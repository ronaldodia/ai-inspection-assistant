# Feuille de route — Inspect IA

Ce document liste les prochaines étapes après le MVP (capture → IA → révision →
rapport PDF, déployé sur microk8s via CI/CD + ArgoCD — voir [readme.md](readme.md)).
Il complète la section "Nice to have" du readme sans la dupliquer.

## État actuel (rappel)

- **Accès** : compte unique par inspecteur, créé à la main via
  `scripts/create_user.py` (`kubectl exec` sur le pod backend). Pas d'inscription
  libre, pas de notion d'organisation/équipe — chaque `users.id` est isolé via
  `inspections.user_id`, un point c'est tout.
- **Schéma** : géré par un seul fichier `backend/schema.sql`, appliqué uniquement à
  l'initialisation d'un volume Postgres vide (pas d'outil de migration). Suffisant
  tant qu'il n'y a qu'un environnement à faire évoluer à la main, mais c'est une
  dette qu'il faut solder avant la Phase 1 ci-dessous.
- **Données déjà collectées et sous-exploitées** : `anomalies` (JSONB, indexé GIN),
  `input_tokens`/`output_tokens`/`model` par photo, `lat`/`lon` par inspection et par
  photo, `section_type`, timestamps de tout le cycle de vie. La Phase 3 s'appuie
  presque entièrement là-dessus — pas de nouvelle collecte de données requise pour
  démarrer.

---

## TODO — Sécurité, pentest, tests d'intégration et fonctionnels (2026-08-23)

Aucun de ces chantiers n'est commencé — notés à la demande de l'utilisateur.
Contrairement aux autres sections de ce document, ce ne sont pas des
fonctionnalités mais de la dette qui devient plus coûteuse à combler plus
l'app grossit (on vient d'ajouter contexte bâtiment, checklists, RAG,
extraction de documents — tout ça sans un seul test d'intégration ni revue de
sécurité).

### Sécurité

**Déjà en place** (pour ne pas repartir de zéro dans une future revue) :
JWT + bcrypt (`backend/app/security.py`), requêtes paramétrées partout
(aucune concaténation SQL de valeurs utilisateur), `CORS_ORIGINS` scopé par
environnement, accès aux photos vérifié par propriétaire (`JOIN` sur
`inspections.user_id` dans `GET /api/photos/{photo_id}`), validation de
type/taille sur tous les uploads (photos, déclaration du vendeur), Azure Blob
avec `allowBlobPublicAccess: false`.

**Gaps identifiés en construisant les fonctionnalités récentes** :
- Aucune limite de débit sur les endpoints qui coûtent de l'argent par appel
  — en particulier `POST /api/inspections/extract-disclosure`
  (`backend/app/routers/inspections.py`), qui appelle Claude sans passer par
  `effective_inspection_limit`/`effective_photo_limit` (`app/limits.py`) —
  un compte compromis ou un abus pourrait générer des coûts Claude
  arbitraires sans qu'aucune limite existante ne s'applique.
- Aucun header de sécurité (CSP, HSTS, X-Frame-Options...) sur les réponses
  FastAPI (`backend/app/main.py`).
- `npm install` du frontend a déjà signalé 3 vulnérabilités "high severity"
  en dépendances (`npm audit` jamais lancé pour voir lesquelles) — aucun scan
  de dépendances (`npm audit`, `pip-audit`/`safety`) intégré à la CI
  (`.github/workflows/build-and-push.yaml`).
- Aucun log d'audit sur les actions admin (création/désactivation
  d'inspecteur, reset de mot de passe — `backend/app/routers/admin.py`).
- Mot de passe réinitialisé par un admin sans expiration ni changement forcé
  à la première connexion.

### Pentest

Pas encore fait — à planifier une fois l'app utilisée par de vrais
inspecteurs (donc de vraies données clients : adresses, noms, déclarations de
vendeurs) plutôt qu'avant, pour ne pas tester une surface qui va encore
bouger. Premier pas peu coûteux disponible dès maintenant : la skill
`security-review` de ce projet peut auditer le diff en cours à la demande, à
lancer avant chaque changement touchant l'auth/les uploads/les paiements
futurs (Phase 2) plutôt que d'attendre un audit externe.

### Tests d'intégration (backend)

La suite actuelle (`backend/tests/`) est **volontairement DB-free**
(`conftest.py`) — elle ne couvre que des modules purs (constants, security,
pdf, claude_client, storage). **Aucun test ne touche une vraie base Postgres**
: `create_inspection`, `upload_photo`, les endpoints de checklist/checklist
sécurité, `queue_inspection`, `finalize_inspection` n'ont aucune couverture
au-delà de la vérification manuelle. Il manque :
- Une base Postgres de test (conteneur éphémère en CI, ex. service
  `postgres:16` dans `build-and-push.yaml` + migration appliquée) — sans ça,
  impossible de tester les routes qui touchent `conn`.
- Un test de bout en bout du pipeline complet : créer une inspection →
  uploader une photo → `queue` → le worker traite (`backend/worker/worker.py`)
  → `REVIEW` → réviser → `finalize` → télécharger le PDF — c'est le chemin
  critique du produit et il n'est jamais testé automatiquement aujourd'hui.

### Tests fonctionnels automatisés (frontend)

Aucun outil de test installé côté frontend (`frontend/package.json` n'a que
`typescript`/`tailwind`/`eslint` en devDependencies) — la seule vérification
actuelle est `tsc --noEmit` + `next build`, qui attrapent des erreurs de
type, pas des régressions de comportement. Zones les plus à risque à couvrir
en premier, précisément parce qu'on y a déjà trouvé et corrigé un vrai bug
cette session (photo supprimée localement mais jamais côté serveur) :
- La synchronisation hors-ligne (`frontend/lib/offline-db.ts`,
  `syncPhotos`/`handleRemove` dans `capture/page.tsx`) — logique la plus
  complexe de l'app, la plus difficile à vérifier manuellement (nécessite de
  simuler une coupure réseau).
- Le flux complet capture → révision → rapport, en E2E (Playwright — déjà
  compatible avec le service worker Serwist en place, contrairement à
  certains outils plus anciens).

---

## Localisation précise par photo (2026-08-23)

Fonctionnalité scindée en deux (décision utilisateur) :

**Partie 1 — texte libre, en cours d'implémentation.** `photos.location_detail`
(texte libre, ex. "salle de bain principale"), saisi comme réglage actif
persistant à côté de "Section en cours" dans l'écran de capture (même modèle
mental, pas un nouveau concept à apprendre), avec autocomplétion `<datalist>`
alimentée par les localisations déjà tapées dans l'inspection en cours.
Transmis à `analyze_photo()` pour aider Claude à se situer dans le bâtiment.

**Partie 2 — dictée vocale, non commencée.** Permettre de dicter la
localisation (ou une courte description) plutôt que de taper. Rejoint la
recommandation de l'expert consulté sur la dictée transcrite en français (voir
discussion produit). Prérequis à trancher :
- Web Speech API (navigateur, gratuit, qualité variable en français québécois)
  vs service tiers (meilleure précision, coût et dépendance réseau).
- Doit rester compatible avec la capture hors-ligne
  (`frontend/lib/offline-db.ts`) — la transcription ne peut pas dépendre d'un
  aller-retour serveur synchrone si l'inspecteur est hors ligne (vide
  sanitaire, zones rurales sans signal).

## TODO — Localisations dérivées de l'annonce/déclaration (idée, 2026-08-23)

Idée de l'utilisateur, pas encore évaluée en profondeur : au lieu de partir
d'une liste de localisations vide et construite au fil de la saisie (Partie 1
ci-dessus), extraire la liste des pièces directement de l'annonce immobilière
et/ou de la déclaration du vendeur (nombre de chambres, salles de bain, etc.)
pour préremplir les localisations disponibles avant même le début de la
capture — l'inspecteur n'aurait plus qu'à taper, dans la plupart des cas.

**Nuance à trancher avant de partir dessus** : la déclaration du vendeur (déjà
extraite via `POST /api/inspections/extract-disclosure`,
`DISCLOSURE_SCHEMA` dans `backend/app/claude_client.py`) est structurée autour
des vices/rénovations/systèmes, pas d'un plan pièce par pièce — le document le
plus susceptible de contenir un décompte de pièces est plutôt **l'annonce de
vente** (Centris, DuProprio, Realtor.ca...), un document distinct qui n'a pas
d'upload/extraction dédiée aujourd'hui. Une éventuelle implémentation devrait
donc soit ajouter un nouveau type de document à extraire, soit assouplir
l'extraction existante pour accepter les deux sources.

**Doit rester une amélioration au-dessus de la Partie 1, pas un remplacement**
— aucune annonce/déclaration n'est disponible pour tous les mandats (ex.
expertise, pré-réception), le champ texte libre + autocomplétion doit
continuer à fonctionner seul dans ce cas.

Piste secondaire intéressante si implémenté : un indicateur de couverture
("pièces déclarées mais jamais photographiées"), sur le même principe que la
checklist par système déjà en place.

---

## Phase 1 — Accès par invitation

Objectif : passer de "un admin exécute une commande kubectl par inspecteur" à un
flux où une agence peut inviter son équipe elle-même, sans toucher à
l'abonnement/facturation dans un premier temps.

**Modèle de données (nouveau) :**

```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'inspector';
-- role: 'owner' (invite, facturation plus tard) | 'inspector'

CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'inspector',
    invited_by UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ
);
```

**Flux :**
1. `POST /api/organizations/{id}/invitations` (owner uniquement) → génère un token,
   envoie un courriel avec le lien d'acceptation.
2. Écran `/invite/{token}` (frontend, non authentifié) → l'invité choisit son mot de
   passe, nom complet → crée le `users` row rattaché à l'organisation.
3. `scripts/create_user.py` reste utilisé pour créer le tout premier `owner` d'une
   nouvelle organisation (bootstrap), mais plus pour les invités suivants.

**Prérequis à régler avant cette phase :**
- **Outil de migration réel (Alembic recommandé)** — `schema.sql` seul ne suffit
  plus dès qu'il faut faire évoluer une base qui contient déjà des inspections
  réelles en production.
- **Envoi de courriel** — aucune intégration actuellement (ni SMTP, ni service
  tiers type Postmark/SES). Nécessaire pour les invitations et, plus tard, les
  reçus de facturation.
- **Isolation multi-tenant** — vérifier que chaque requête (`inspections`,
  `photos`, `reports`) est bien scopée par `organization_id` en plus de `user_id`,
  pas seulement par inspecteur individuel.

---

## Phase 2 — Abonnement

À faire une fois les invitations en place et 2-3 organisations pilotes actives —
pas avant, pour ne pas ajouter de friction de paiement avant d'avoir validé la
valeur (cohérent avec la logique déjà posée dans le readme : "Si validé → Phase 2").

- Stripe Billing par `organization_id` (`stripe_customer_id`,
  `stripe_subscription_id`, `subscription_status` sur `organizations`).
- Plans par nombre d'inspecteurs actifs et/ou volume d'inspections/mois — à
  calibrer avec les chiffres déjà dans le readme (~0,20-0,40 $ coût Claude par
  inspection, cible ~50 $ facturés).
- Webhook `POST /api/billing/webhook` (`checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`).
- Portail client Stripe lié depuis un nouvel écran "Facturation".
- Décider du comportement en cas d'abonnement expiré : bloquer
  `POST /api/inspections` et `/queue`, mais garder l'accès en lecture aux rapports
  déjà générés (ce sont des documents à valeur légale, pas question de les rendre
  inaccessibles).

---

## Phase 3 — Métriques à valeur ajoutée (contexte Québec)

Les données existent déjà (anomalies JSONB indexé GIN, tokens/coût par photo,
géolocalisation, sections). Ce qui manque, ce sont des endpoints d'agrégation et un
écran "Statistiques". Métriques proposées, par ordre de valeur/faisabilité :

| Métrique | Pourquoi c'est pertinent au Québec | Faisabilité |
|---|---|---|
| **Fréquence des types d'anomalies** par `section_type` et sévérité | Les combles et vides sanitaires ont des profils de défauts très différents (isolant/glace en comble, humidité/infiltration en vide sanitaire) — utile pour prioriser la formation des inspecteurs et rassurer les acheteurs sur ce qui est vraiment fréquent vs anecdotique | Immédiate — agrégation SQL sur `anomaly_detections.anomalies` (déjà indexé GIN) |
| **Saisonnalité des anomalies** (mois de `taken_at`) | Climat québécois = dégel printanier (infiltration d'eau, pics mars-avril), hiver rigoureux (glace, isolant, ventilation) — permet d'anticiper la charge de travail saisonnière et d'alerter les acheteurs selon la période d'achat | Immédiate — `taken_at` déjà stocké par photo |
| **Répartition géographique** (heatmap par municipalité/MRC) | Bâti ancien concentré dans certains arrondissements (ex. Montréal, Québec) vs constructions récentes en périphérie — utile pour du positionnement commercial et pour des partenaires (assureurs) | Immédiate — `lat`/`lon` déjà stockés par inspection |
| **Coût et efficacité IA** (tokens/coût par inspection, tendance par version de modèle) | Valide directement l'hypothèse économique déjà posée dans le readme (~0,30 $/inspection) — permet de justifier le prix facturé et de détecter une dérive de coût | Immédiate — `input_tokens`/`output_tokens`/`model` déjà stockés |
| **Écart IA vs révision inspecteur** (% d'anomalies IA gardées/supprimées, anomalies ajoutées par l'inspecteur) | Proxy de qualité du modèle dans le temps, alimente directement le "jeu de test étiqueté" déjà prévu au readme (Semaine 2) — argument de confiance essentiel pour un rapport à valeur légale | Nécessite un changement mineur : `PATCH .../anomalies` écrase actuellement `anomalies` en place ([inspections.py](backend/app/routers/inspections.py)) — il faut conserver la version brute IA (ex. colonne `anomalies_ai_raw`) séparément de la version révisée pour pouvoir calculer le delta |
| **Âge du bâtiment vs sévérité** | Le bâti pré-1985 (avant le Code du bâtiment du Québec actuel) montre historiquement plus d'anomalies critiques — un argument concret pour l'acheteur | Nécessite une donnée non captée aujourd'hui (année de construction) — déjà listé comme "Nice to have" au readme, la Phase 3 lui donne une vraie justification business |
| **Productivité inspecteur** (inspections/mois, délai DRAFT→COMPLETED, photos/inspection) | Métrique opérationnelle pour dimensionner les plans d'abonnement (Phase 2) par volume | Immédiate — timestamps déjà présents sur `inspections` |
| **Lien avec réclamations "vice caché"** *(aspirationnel)* | Les inspections préachat au Québec sont directement liées aux litiges de vice caché (Code civil du Québec) — pouvoir montrer qu'une anomalie détectée par l'IA a été confirmée (ou non) dans un litige ultérieur serait l'argument de crédibilité le plus fort possible | Nécessite une donnée externe non modélisée aujourd'hui (issue du dossier post-vente) — à ne considérer qu'une fois le produit établi |

**Forme technique proposée :**
- Endpoints d'agrégation en lecture seule, scopés par organisation une fois la
  Phase 1 en place : `GET /api/stats/anomalies`, `/api/stats/seasonal`,
  `/api/stats/geo`, `/api/stats/cost`, `/api/stats/quality`.
- Écran frontend "Statistiques" (dashboard) consommant ces endpoints.
- **Vie privée** : les photos couvrent l'intérieur de propriétés privées (déjà
  souligné au readme). Toute métrique agrégée ou exposée doit être anonymisée /
  regroupée (jamais d'affichage au niveau d'une adresse précise en dehors de
  l'organisation propriétaire de l'inspection).

---

## Ordre suggéré

1. **Sécurité — le gap sur `extract-disclosure` en particulier** (voir
   "Sécurité, pentest, tests d'intégration et fonctionnels" ci-dessus) : coût
   Claude non plafonné, à corriger avant d'ouvrir l'app à plus d'un
   utilisateur — indépendant de l'ordre ci-dessous, à faire dès que possible.
2. Migrations réelles (Alembic) + envoi de courriel — prérequis transverses aux deux
   phases suivantes.
3. Phase 1 (invitations) — débloque l'onboarding de plusieurs organisations pilotes.
4. Phase 3 (métriques) — peut démarrer en parallèle de la Phase 1 pour les
   métriques qui ne dépendent pas du multi-tenant (coût IA, saisonnalité, géo), et
   se termine une fois le multi-tenant en place pour le scoping par organisation.
5. Tests d'intégration backend — avant la Phase 2 (abonnement/paiement), pas
   après : un test de bout en bout du pipeline capture → rapport doit exister
   avant d'ajouter de la facturation par-dessus un chemin non testé.
6. Phase 2 (abonnement) — une fois la valeur validée avec les pilotes.
7. Pentest — une fois de vraies données clients circulent (pilotes actifs).
