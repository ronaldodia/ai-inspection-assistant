# Déploiement Azure App Service

Environnement **entièrement séparé** du déploiement microk8s existant (`k8s/`) : sa
propre base de données (Azure Database for PostgreSQL), son propre stockage de
fichiers (Azure Blob Storage), ses propres comptes utilisateurs. Rien n'est partagé
entre les deux — ce n'est pas une migration, c'est un second environnement.

Backend, worker et frontend tournent comme trois Web Apps sur un même App Service
Plan (`infra/main.bicep`). Le worker n'a pas de serveur HTTP — il tourne via
`appCommandLine` (override de la commande de démarrage du même conteneur que le
backend), pas via un WebJob.

## 1. Prérequis

```bash
az login
az account set --subscription <subscription-id>
az group create --name <resource-group> --location canadacentral
```

## 2. Déployer l'infrastructure

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

`registryUsername`/`registryPassword` ne sont nécessaires que si les packages
`ghcr.io/ronaldodia/ai-inspection-assistant-*` restent privés — sinon, omettez-les.

Notez les sorties (`backendUrl`, `frontendUrl`, `postgresServerName`,
`storageAccountName`) — vous en aurez besoin pour la suite. Le Bicep ne sort
jamais de secret (mot de passe, clé de storage) : reconstruisez l'URL de connexion
vous-même à partir de `postgresServerName` et du mot de passe déjà fourni ci-dessus.

## 3. Initialiser le schéma Postgres (une fois)

Azure Database for PostgreSQL n'a pas d'équivalent au `docker-entrypoint-initdb.d`
utilisé par le conteneur Postgres local/k8s — le schéma doit être appliqué
manuellement :

```bash
PGPASSWORD='<mot-de-passe-fort>' psql \
  "host=<postgresServerName>.postgres.database.azure.com port=5432 dbname=inspect_app user=inspectadmin sslmode=require" \
  -f backend/schema.sql
```

## 4. Créer le premier compte inspecteur

```bash
az webapp ssh --name <AZURE_BACKEND_APP_NAME> --resource-group <resource-group>
# puis, dans le shell du conteneur :
python -m scripts.create_user --email inspecteur@example.com --password "..." --full-name "..."
```

## 5. CI/CD (optionnel, mais recommandé)

Le workflow [`build-and-push.yaml`](../.github/workflows/build-and-push.yaml)
détecte automatiquement si Azure est configuré via `vars.AZURE_RESOURCE_GROUP` —
tant que cette variable n'existe pas, les jobs `build-frontend-azure` et
`deploy-azure` sont simplement ignorés et le pipeline k8s existant n'est pas
affecté.

**Variables du dépôt** (Settings > Secrets and variables > Actions > Variables) :

| Nom | Valeur |
|---|---|
| `AZURE_RESOURCE_GROUP` | le resource group utilisé à l'étape 2 |
| `AZURE_BACKEND_APP_NAME` | sortie `backendUrl` du déploiement (sans le `https://` ni le domaine) |
| `AZURE_WORKER_APP_NAME` | nom du Web App worker (`<baseName>-worker-<suffixe>`) |
| `AZURE_FRONTEND_APP_NAME` | nom du Web App frontend (`<baseName>-frontend-<suffixe>`) |
| `AZURE_NEXT_PUBLIC_API_URL` | la sortie `backendUrl` du déploiement, ex: `https://inspect-ia-backend-xxxxx.azurewebsites.net` |

**Secrets du dépôt** (pour l'authentification OIDC vers Azure — aucun mot de passe
longue durée stocké) :

| Nom | Valeur |
|---|---|
| `AZURE_CLIENT_ID` | client ID de l'app registration Azure AD |
| `AZURE_TENANT_ID` | tenant ID Azure AD |
| `AZURE_SUBSCRIPTION_ID` | subscription ID Azure |

Créer l'app registration et le federated credential OIDC (une fois) :

```bash
az ad app create --display-name inspect-ia-github-actions
# noter l'appId retourné -> AZURE_CLIENT_ID

az ad sp create --id <appId>

az role assignment create \
  --assignee <appId> \
  --role Contributor \
  --scope /subscriptions/<subscription-id>/resourceGroups/<resource-group>

az ad app federated-credential create \
  --id <appId> \
  --parameters '{
    "name": "github-actions-main",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:ronaldodia/ai-inspection-assistant:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
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
