# Déploiement Azure App Service

Environnement **entièrement séparé** du déploiement microk8s existant (`k8s/`) : sa
propre base de données (Azure Database for PostgreSQL), son propre stockage de
fichiers (Azure Blob Storage), ses propres comptes utilisateurs. Rien n'est partagé
entre les deux — ce n'est pas une migration, c'est un second environnement.

Backend, worker et frontend tournent comme trois Web Apps sur un même App Service
Plan (`infra/main.bicep`). Le worker n'a pas de serveur HTTP — il tourne via
`appCommandLine` (override de la commande de démarrage du même conteneur que le
backend), pas via un WebJob.

Deux workflows GitHub Actions gèrent cet environnement :
- **[`deploy-azure-infra.yaml`](../.github/workflows/deploy-azure-infra.yaml)** —
  déclenchement **manuel** (onglet Actions > "Deploy Azure Infrastructure" > Run
  workflow). Provisionne/met à jour les ressources Azure via Bicep. Ne construit
  aucune image — réutilise celles déjà publiées par le pipeline de build.
- **[`build-and-push.yaml`](../.github/workflows/build-and-push.yaml)** —
  automatique à chaque push sur `main`. Construit les images (dont
  `frontend-azure`, distincte de celle utilisée par microk8s) et met à jour les
  Web Apps vers la dernière image — mais seulement une fois l'infra provisionnée
  et les variables ci-dessous configurées.

## 1. Prérequis (une fois, en local)

```bash
az login
az account set --subscription <subscription-id>
az group create --name <resource-group> --location canadacentral
```

## 2. Configurer l'authentification GitHub Actions → Azure (OIDC, une fois)

```bash
az ad app create --display-name inspect-ia-github-actions
# noter l'appId retourné -> AZURE_CLIENT_ID

az ad sp create --id c7a088fe-c362-4732-9127-7d64b89480a0

az role assignment create \
  --assignee c7a088fe-c362-4732-9127-7d64b89480a0 \
  --role Contributor \
  --scope /subscriptions/<subscription-id>/resourceGroups/<resource-group>

az ad app federated-credential create \
  --id c7a088fe-c362-4732-9127-7d64b89480a0 \
  --parameters '{
    "name": "github-actions-main",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:ronaldodia/ai-inspection-assistant:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

## 3. Configurer les secrets et variables du dépôt

**Settings > Secrets and variables > Actions > Secrets** :

| Nom | Valeur |
|---|---|
| `AZURE_CLIENT_ID` | `appId` de l'étape 2 |
| `AZURE_TENANT_ID` | tenant ID Azure AD |
| `AZURE_SUBSCRIPTION_ID` | subscription ID Azure |
| `AZURE_POSTGRES_ADMIN_PASSWORD` | mot de passe fort pour l'administrateur Postgres |
| `BACKEND_SECRET_KEY` | `openssl rand -hex 32` — clé de signature JWT de **cet environnement** (distincte de celle du déploiement k8s) |
| `ANTHROPIC_API_KEY` | clé API Anthropic |
| `GHCR_PULL_USERNAME` | votre user GitHub — uniquement si les packages `ghcr.io/ronaldodia/ai-inspection-assistant-*` restent privés, sinon laisser non défini |
| `GHCR_PULL_TOKEN` | PAT avec le scope `read:packages` — idem |

**Settings > Secrets and variables > Actions > Variables** :

| Nom | Valeur |
|---|---|
| `AZURE_RESOURCE_GROUP` | le resource group créé à l'étape 1 |

Les quatre autres variables (`AZURE_BACKEND_APP_NAME`, `AZURE_WORKER_APP_NAME`,
`AZURE_FRONTEND_APP_NAME`, `AZURE_NEXT_PUBLIC_API_URL`) sont renseignées
**automatiquement** par le workflow d'infra à l'étape suivante — ne pas les créer
à la main.

## 4. Déployer l'infrastructure

Onglet **Actions** du dépôt > **Deploy Azure Infrastructure** > **Run workflow**.

Ce workflow exécute le Bicep avec les secrets ci-dessus, puis enregistre
automatiquement les quatre variables manquantes (noms des Web Apps + URL du
backend) via `gh variable set`, pour que `build-and-push.yaml` puisse ensuite
déployer en continu sans intervention manuelle.

<details>
<summary>Équivalent en ligne de commande, si vous préférez ne pas passer par le workflow</summary>

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/main.bicep \
  --parameters \
    postgresAdminPassword='<mot-de-passe-fort>' \
    secretKey="$(openssl rand -hex 32)" \
    anthropicApiKey='sk-ant-...' \
    registryUsername='<votre-user-github>' \
    registryPassword='<PAT-avec-read:packages>'
```

Le Bicep ne sort jamais de secret (mot de passe, clé de storage) dans ses
outputs — reconstruisez l'URL de connexion Postgres vous-même à partir de
`postgresServerName` et du mot de passe déjà fourni ci-dessus.
</details>

### ⚠️ Ordre important au tout premier déploiement

`NEXT_PUBLIC_API_URL` est figé au build de l'image frontend (voir plus bas) —
or l'URL du backend n'est connue qu'*après* ce premier déploiement d'infra. Donc
au tout premier setup :

1. Étapes 1 à 4 ci-dessus (l'image `frontend-azure:latest` utilisée à ce stade
   pointera vers une URL vide/incorrecte — sans conséquence, l'infra elle-même
   n'en dépend pas).
2. Une fois `AZURE_NEXT_PUBLIC_API_URL` renseigné automatiquement, déclenchez un
   nouveau build (`git push` ou re-run manuel de `build-and-push.yaml`) — la
   nouvelle image `frontend-azure` sera buildée avec la bonne URL, et
   `deploy-azure` la déploiera automatiquement.

Les déploiements suivants n'ont plus ce problème — l'ordre ne compte qu'à
l'initialisation.

## 5. Initialiser le schéma Postgres (une fois)

Azure Database for PostgreSQL n'a pas d'équivalent au `docker-entrypoint-initdb.d`
utilisé par le conteneur Postgres local/k8s — le schéma doit être appliqué
manuellement :

```bash
PGPASSWORD='<mot-de-passe-fort>' psql \
  "host=<postgresServerName>.postgres.database.azure.com port=5432 dbname=inspect_app user=inspectadmin sslmode=require" \
  -f backend/schema.sql
```

(`postgresServerName` est dans les outputs du workflow "Deploy Azure
Infrastructure", ou `az deployment group show`.)

## 6. Créer le premier compte inspecteur

```bash
az webapp ssh --name <AZURE_BACKEND_APP_NAME> --resource-group <resource-group>
# puis, dans le shell du conteneur :
python -m scripts.create_user --email inspecteur@example.com --password "..." --full-name "..."
```

## Pourquoi une image frontend distincte pour Azure

`NEXT_PUBLIC_API_URL` est figé dans le bundle JavaScript au moment du `next
build` (voir `frontend/Dockerfile`), pas lu au runtime. L'image frontend déjà
publiée pour microk8s pointe vers `api.inspect.evoluops.com` — la réutiliser sur
Azure App Service ferait appeler le mauvais backend. D'où
`ghcr.io/ronaldodia/ai-inspection-assistant-frontend-azure`, buildée avec
`AZURE_NEXT_PUBLIC_API_URL` comme `NEXT_PUBLIC_API_URL`.

## Limites connues

- Le Bicep n'a pas été validé avec `bicep build`/`az deployment group what-if`
  (pas d'outil Azure disponible dans l'environnement où il a été écrit) — à
  vérifier avant un déploiement en production.
- Le SKU `Standard_B1ms` (Postgres) et `B2` (App Service Plan) sont des points de
  départ économiques, pas des recommandations de dimensionnement — à ajuster
  selon la charge réelle.
- Pas de VNet/private endpoint : Postgres est joignable via le firewall
  "AllowAzureServices", pas isolé sur un réseau privé. Acceptable pour un premier
  déploiement, à durcir avant une mise en production avec des données réelles de
  clients.
- `deploy-azure-infra.yaml` utilise `gh variable set`, qui nécessite que le
  `GITHUB_TOKEN` du workflow ait la permission `actions: write` (déjà déclarée
  dans le workflow). Si l'organisation restreint les permissions par défaut du
  token au niveau du dépôt, cette étape peut échouer — dans ce cas, renseignez
  les quatre variables manuellement avec les valeurs affichées dans les logs du
  job.
