# 📱 App d'Inspection IA - Spécifications Fonctionnelles MVP
## Quick & Dirty (2-3 semaines) avec Essentials Only — déployé sur microk8s

---

## 📋 Table des matières

1. [Vision Produit](#vision-produit)
2. [Features Essentielles](#features-essentielles)
3. [User Flows](#user-flows)
4. [Architecture Technique](#architecture-technique)
5. [Base de Données](#base-de-données)
6. [API Endpoints](#api-endpoints)
7. [Frontend Wireframes](#frontend-wireframes)
8. [Déploiement (microk8s)](#déploiement-microk8s)
9. [Timeline Développement](#timeline-développement)

---

## Vision Produit

**Pour qui?** Inspecteurs bâtiment (immobilier, assurance) au Québec
**Quoi?** App mobile-web pour capturer photos d'inspection et générer rapports IA automatiquement
**Pourquoi?** Détecter plus d'anomalies (moisissure, infiltration, isolant, nuisibles, fissures) qu'une inspection manuelle seule, sans remplacer le jugement de l'inspecteur

**Résultat inspecteur:**
- Prend photos pendant l'inspection (mode offline supporté)
- Synchronise en fin de visite
- L'IA détecte les anomalies photo par photo
- **L'inspecteur révise et corrige avant l'envoi** — le rapport engage sa responsabilité professionnelle
- Export PDF pour client

---

## Features Essentielles

### ✅ MUST HAVE (MVP)

| Feature | Description | Pourquoi |
|---------|-------------|---------|
| **Authentification** | Login email/mot de passe (comptes créés manuellement par admin) | Isolation données par inspecteur |
| **Créer Inspection** | Form: adresse, type (comble/vide sanitaire/autre) | Contexte pour IA |
| **Capturer Photos** | Camera web/mobile + GPS auto, stockage offline (IndexedDB) | Cœur du produit — signal absent dans un vide sanitaire |
| **Synchronisation** | Upload différé, idempotent, auto au retour du signal | Fiabilité terrain |
| **Analyse IA** | Claude Opus 5 détecte anomalies par photo | Le magic |
| **Révision inspecteur** | Écran d'édition des anomalies avant export — ajouter/supprimer/corriger | Responsabilité professionnelle — non négociable |
| **Rapport PDF** | Généré à partir des données révisées | Livrable inspecteur |
| **Historique** | Lister inspections passées avec statut | Traçabilité |

### ⏭️ NICE TO HAVE (Post-MVP, Sprint 2)

| Feature | Description | Quand |
|---------|-------------|-------|
| Signature électronique | Valider rapport | Sprint 2 |
| Export email auto | Envoyer rapport au client | Sprint 2 |
| Batching photos par appel Claude | 3-5 photos/appel pour réduire le coût et corréler les anomalies | Sprint 2, si le coût par inspection le justifie |
| Annotations photos | Marquer anomalies à l'écran | Sprint 2 |
| Enrichissement d'adresse (année construction, etc.) | Nécessite une source de données fiable au Québec — à valider | Sprint 2 |
| Suppression d'inspection | Soft-delete uniquement — un rapport livré ne se supprime pas | Sprint 2 |
| Dashboard stats | Synthèse par inspecteur | Après traction |

### ❌ OUT OF SCOPE (MVP)

- App native iOS/Android (Next.js = suffisant)
- Synchronisation temps réel entre inspecteurs
- Multiple utilisateurs par inspection
- Intégration CRM
- Analytics avancées
- MinIO / stockage objet distribué (un seul nœud microk8s → disque local suffit)
- File d'attente Redis/Celery (une table Postgres + `SKIP LOCKED` suffit à ce volume)

---

## User Flows

### Flow 1: Nouvelle Inspection (Jour 1)

```
Inspecteur arrive sur site (a du signal dans l'auto)
↓
1. Login dans l'app
↓
2. Clique "Nouvelle Inspection"
   - Adresse, type, notes optionnelles
   - GPS capturé automatiquement
   - → Inspection créée en base, statut DRAFT (nécessite le réseau, requête unique légère)
↓
3. Entre dans le bâtiment (signal faible/absent)
   - Prend 10-30 photos
   - Chaque photo compressée et stockée dans IndexedDB (pas localStorage — quota trop petit)
   - Un badge "hors ligne" indique l'état de connexion
↓
4. À la fin: clique "Terminer l'inspection"
   - Si des photos restent en attente et hors ligne → bloqué avec message clair
   - Sinon: synchronise puis met l'inspection en file d'attente (QUEUED)

Statut: QUEUED
```

### Flow 2: Traitement & Révision (Jour 1 soir ou Jour 2)

```
Worker (pod dédié) détecte l'inspection QUEUED
↓
1. Marque PROCESSING
2. Pour chaque photo (séquentiel) :
   - Appelle Claude Opus 5 (vision + sortie structurée JSON)
   - Stocke les anomalies détectées, condition générale, tokens utilisés
3. Génère une synthèse texte (un appel Claude, sans image)
4. Marque REVIEW

Durée: ~1-3 minutes pour 25 photos (appels séquentiels, pas de batching au MVP)
↓
5. Le frontend poll le statut toutes les 4s et redirige vers l'écran de révision
↓
6. Inspecteur:
   - Relit chaque photo + anomalies détectées
   - Corrige, supprime, ajoute des anomalies
   - Édite la synthèse générale
   - Clique "Finaliser le rapport" → génère le PDF, statut COMPLETED

Statut: COMPLETED ✅
```

### Flow 3: Consulter Ancien Rapport

```
Inspecteur clique sur une inspection COMPLETED
↓
Voir: synthèse, décompte d'anomalies par sévérité, bouton télécharger PDF
```

---

## Architecture Technique

### Stack — sur microk8s existant, sans dépendances cloud externes

```
┌──────────────────────────────────────────────────────────┐
│  Ingress (nginx, microk8s addon) + cert-manager (TLS)     │
└───────────────┬─────────────────────────┬─────────────────┘
                 │                         │
        ┌────────▼────────┐      ┌─────────▼─────────┐
        │  frontend (pod)  │      │   backend (pod)    │
        │  Next.js 14      │      │   FastAPI          │
        │  IndexedDB local │      │   auth JWT (HS256) │
        └──────────────────┘      └────────┬────────────┘
                                            │
                                   ┌────────▼─────────┐
                                   │  worker (pod)     │
                                   │  poll Postgres    │
                                   │  (SKIP LOCKED)     │
                                   │  → Claude Opus 5   │
                                   │  → PDF (weasyprint)│
                                   └────────┬───────────┘
                                            │
                       ┌────────────────────┼────────────────────┐
                       ▼                    ▼                    ▼
                ┌─────────────┐    ┌─────────────────┐   ┌──────────────┐
                │ postgres pod │    │ PVC /data        │   │  Claude API   │
                │ (PVC 5 Gi)   │    │ photos + PDFs    │   │  (Anthropic)  │
                │ file d'attente│   │ (PVC 20 Gi)      │   │               │
                │ = table SQL  │    │ servi via endpoint│  │               │
                │              │    │ authentifié        │  │               │
                └─────────────┘    └─────────────────┘   └──────────────┘
```

**Décisions clés et pourquoi (vs le plan Vercel/Railway/Azure original) :**

| Décision | Raison |
|---|---|
| Postgres = file d'attente (`SELECT ... FOR UPDATE SKIP LOCKED`) | Pas de Celery/Redis à opérer pour un seul worker séquentiel — sur-ingénierie évitée |
| Photos sur PVC local, servies via endpoint FastAPI authentifié | Pas de MinIO ni de SAS tokens — plus simple et plus sécurisé qu'un blob public (les photos sont des intérieurs de propriétés privées) |
| Worker = pod séparé du backend API | Un traitement de 1-3 min ne doit pas bloquer les requêtes HTTP normales |
| IndexedDB (pas localStorage) côté frontend | localStorage a un quota de ~5-10 Mo ; 25 photos compressées dépassent ça facilement |
| Compression image côté client avant stockage | Réduit la charge réseau à la synchronisation et les tokens Claude |
| RWO (pas RWX) sur les PVC | microk8s est mono-nœud ici — RWX (NFS) serait de la complexité anticipée non justifiée |

### Technologies

| Layer | Tech | Pourquoi |
|-------|------|---------|
| **Frontend** | Next.js 14 (TypeScript, App Router) | Mobile-responsive, build standalone léger en conteneur |
| **Backend** | FastAPI (Python 3.11) | Async natif, parfait pour upload + IA |
| **Worker** | Script Python autonome, même image que le backend | Poll Postgres, appelle Claude, génère le PDF |
| **Database** | PostgreSQL 16 (pod microk8s, PVC) | File d'attente + stockage métier |
| **File Storage** | PVC monté (`hostpath-storage` microk8s) | Simple, suffisant pour un seul nœud |
| **AI** | Anthropic Claude Opus 5 (vision, sortie structurée, prompt caching) | Meilleure précision vision sur photos dégradées |
| **PDF** | HTML/Jinja2 → `weasyprint` | Plus simple à styliser que reportlab |
| **Ingress/TLS** | nginx-ingress + cert-manager (addons microk8s) | Gratuit, standard |

---

## Base de Données

### Schéma PostgreSQL

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address VARCHAR(500) NOT NULL,
    inspection_type VARCHAR(50) NOT NULL, -- comble, vide_sanitaire, autre
    notes TEXT,
    lat DECIMAL(10, 8),
    lon DECIMAL(11, 8),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    -- DRAFT, QUEUED, PROCESSING, REVIEW, COMPLETED, ERROR
    error_message TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    client_photo_id VARCHAR(100) NOT NULL, -- UUID généré côté client, pour idempotence
    storage_path VARCHAR(500) NOT NULL,
    photo_order INT NOT NULL,
    lat DECIMAL(10, 8),
    lon DECIMAL(11, 8),
    taken_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (inspection_id, client_photo_id)
);

CREATE TABLE anomaly_detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id UUID NOT NULL UNIQUE REFERENCES photos(id) ON DELETE CASCADE,
    anomalies JSONB NOT NULL DEFAULT '[]',
    overall_condition VARCHAR(30), -- bon, acceptable, mauvais, critique
    input_tokens INT,
    output_tokens INT,
    model VARCHAR(100),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL UNIQUE REFERENCES inspections(id) ON DELETE CASCADE,
    pdf_path VARCHAR(500),
    synthesis TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspections_user_id ON inspections(user_id);
CREATE INDEX idx_inspections_status_created ON inspections(status, created_at) WHERE archived_at IS NULL;
CREATE INDEX idx_photos_inspection_id ON photos(inspection_id);
CREATE INDEX idx_anomaly_detections_gin ON anomaly_detections USING GIN (anomalies);
```

Notes :
- `client_photo_id` + contrainte `UNIQUE` règlent l'idempotence d'upload (retry réseau sans doublon).
- `input_tokens`/`output_tokens`/`model` par photo permettent de connaître le coût réel par inspection avant de fixer un prix.
- Pas de `DELETE` en cascade exposé côté API — un rapport livré est un document à valeur probante, `archived_at` sert de soft-delete si besoin plus tard.

---

## API Endpoints

Toutes les routes (sauf `/health` et `/api/auth/login`) exigent `Authorization: Bearer <token>`.

```
POST   /api/auth/login                                  {email, password} → {access_token, token_type}

POST   /api/inspections                                 {address, inspection_type, notes?, lat?, lon?} → inspection (DRAFT)
GET    /api/inspections                                  → liste des inspections de l'utilisateur
GET    /api/inspections/{id}                              → {inspection, photos[], report}

POST   /api/inspections/{id}/photos          (multipart) file, client_photo_id, photo_order, lat?, lon?, taken_at?
                                              idempotent via client_photo_id — retourne {id, duplicate}

POST   /api/inspections/{id}/queue                        DRAFT|ERROR → QUEUED (déclenche le worker)

PATCH  /api/inspections/{id}/photos/{photo_id}/anomalies  {anomalies[], overall_condition} — étape de révision
PATCH  /api/inspections/{id}/synthesis                    {synthesis} — étape de révision

POST   /api/inspections/{id}/finalize                     REVIEW → COMPLETED, génère le PDF

GET    /api/inspections/{id}/report.pdf                    stream du PDF (auth + vérif propriétaire)
GET    /api/photos/{photo_id}                               stream de la photo (auth + vérif propriétaire)

GET    /health                                              liveness/readiness (pas d'auth)
```

Pas de `/api/auth/register` ni de `DELETE /api/inspections/{id}` au MVP — comptes créés via `scripts/create_user.py` (voir Déploiement), suppression via soft-delete reportée à Sprint 2.

---

## Frontend Wireframes

Les écrans principaux (login, dashboard, nouvelle inspection, capture) restent similaires au plan initial. Deux ajouts liés aux corrections retenues :

### Écran Capture (offline-first)

```
┌────────────────────────────────┐
│  ← Retour            En ligne  │  ← badge état connexion
├────────────────────────────────┤
│  12 photos — 3 en attente       │
│                                 │
│  [ 📷 Ajouter des photos ]      │
│                                 │
│  [🖼️⚠] [🖼️⚠] [🖼️] [🖼️]         │  ⚠ = pas encore synchronisée
│  [🖼️] [🖼️] [🖼️] [🖼️]           │
├────────────────────────────────┤
│ [Synchroniser (3)] [Terminer]  │
└────────────────────────────────┘
```

### Écran Révision (nouveau — MUST HAVE)

```
┌────────────────────────────────┐
│  Révision — 123 Rue de Montréal│
├────────────────────────────────┤
│  Synthèse générale (éditable)   │
│  [___________________________] │
│                                 │
│  📷 Photo 1        État: Mauvais│
│  ┌───────────────────────────┐ │
│  │ Moisissure — Majeure      │ │
│  │ [Emplacement__________]   │ │
│  │ [Description__________]   │ │
│  │ [Recommandation_______]   │ │
│  │              [Supprimer]  │ │
│  └───────────────────────────┘ │
│  [+ Ajouter une anomalie]      │
├────────────────────────────────┤
│  [Sauvegarder] [Finaliser]     │
└────────────────────────────────┘
```

---

## Déploiement (microk8s)

### Prérequis (une fois)

```bash
microk8s enable dns hostpath-storage
kubectl get ingressclass          # doit lister "nginx" (contrôleur déjà en place)
kubectl get clusterissuer         # doit lister "letsencrypt-prod" (déjà en place)
```

Le contrôleur ingress (classe `nginx`) et le `ClusterIssuer` cert-manager
(`letsencrypt-prod`) sont déjà déployés sur le cluster — ni l'addon `ingress` ni l'addon
`cert-manager` de microk8s ne sont à activer ici, et ce dépôt ne gère pas ces ressources
(pas de manifest `ClusterIssuer` dans `k8s/`, l'ingress y référence juste
`letsencrypt-prod` par son nom). Les manifests utilisent `ingressClassName: nginx` avec
les hosts `inspection.evoluops.com` (frontend) et `api.inspection.evoluops.com`
(backend) — un enregistrement DNS wildcard `*.evoluops.com` doit pointer vers l'IP du
contrôleur.

ArgoCD doit être installé et configuré pour surveiller le dossier `k8s/` de ce dépôt
(sync automatique). Le registre local microk8s n'est plus utilisé — les images sont
construites et publiées sur GitHub Container Registry (voir plus bas).

### CI/CD (GitHub Actions + ArgoCD)

Le workflow [`build-and-push.yaml`](.github/workflows/build-and-push.yaml) construit et
publie `ghcr.io/ronaldodia/ai-inspection-assistant-{backend,frontend}` à chaque push sur
`main`, tag les images avec le hash de commit (`sha-xxxxxxx`), puis commit lui-même la
mise à jour des tags dans `k8s/04-backend.yaml`, `k8s/05-worker.yaml` et
`k8s/06-frontend.yaml`, ainsi que la régénération de
[`k8s/01c-postgres-init-configmap.yaml`](k8s/01c-postgres-init-configmap.yaml) depuis
`backend/schema.sql` (ce fichier ne doit jamais être édité à la main — toute évolution du
schéma passe par `backend/schema.sql`, la ConfigMap suit automatiquement). ArgoCD détecte
ce commit et synchronise le cluster — plus besoin de `docker build`/`push`/`kubectl apply`
manuel pour déployer une nouvelle version.

À configurer une fois dans les paramètres du dépôt GitHub :
- **Settings > Secrets and variables > Actions > Variables** : `NEXT_PUBLIC_API_URL` =
  `https://api.inspection.evoluops.com`, sinon la valeur par défaut du workflow
  (`https://api.inspect.example.com`, incorrecte pour ce déploiement) est utilisée.
- Si les packages `ghcr.io/ronaldodia/ai-inspection-assistant-*` restent privés, créer le
  secret `ghcr-pull-secret` dans le cluster — voir
  [`k8s/01b-ghcr-pull-secret.example.yaml`](k8s/01b-ghcr-pull-secret.example.yaml).
  Sinon, les rendre publics et retirer `imagePullSecrets` des manifests 04/05/06.

### Déploiement initial (une fois, avant qu'ArgoCD ne prenne le relais)

```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01c-postgres-init-configmap.yaml

cp k8s/01-secrets.example.yaml k8s/01-secrets.yaml
# éditer k8s/01-secrets.yaml avec des vraies valeurs (ne jamais commit ce fichier)
kubectl apply -f k8s/01-secrets.yaml

# uniquement si les packages GHCR restent privés — voir k8s/01b-ghcr-pull-secret.example.yaml
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io --docker-username=<user> --docker-password=<PAT> -n inspect-ia

kubectl apply -f k8s/02-postgres.yaml
kubectl apply -f k8s/03-photos-pvc.yaml
kubectl apply -f k8s/04-backend.yaml
kubectl apply -f k8s/05-worker.yaml
kubectl apply -f k8s/06-frontend.yaml
kubectl apply -f k8s/07-ingress.yaml
```

Une fois cette première application faite et ArgoCD pointé sur `k8s/`, les déploiements
suivants se font simplement en poussant sur `main` — le CI/CD s'occupe du reste.

### Créer le premier compte inspecteur

```bash
kubectl exec -it deploy/backend -n inspect-ia -- \
  python -m scripts.create_user --email inspecteur@example.com --password "..." --full-name "Marc Dubois"
```

---

## Timeline Développement

Ajustée pour tenir compte de microk8s déjà en place (pas de temps à passer sur le déploiement infra) et de la revue humaine ajoutée au scope MUST HAVE.

### Semaine 1 : Backend + Database

- Schéma Postgres + connexion (`psycopg`) + pool
- Auth (login only, JWT HS256)
- CRUD inspections + upload photo (idempotent, compression déjà faite côté client)
- File d'attente Postgres (`SKIP LOCKED`) + squelette worker

**Livrable jour 5 :** API stable, upload + mise en file d'attente fonctionnels

### Semaine 2 : IA + Révision + Rapport

- Intégration Claude Opus 5 (vision, sortie structurée, prompt caching)
- **Jeu de test étiqueté** : 10-15 inspections réelles annotées par un inspecteur senior, utilisées pour valider le prompt avant de le figer
- Synthèse texte + génération PDF (HTML/Jinja2 → weasyprint)
- Endpoints de révision (édition anomalies + synthèse)

**Livrable jour 10 :** Pipeline complet DRAFT → QUEUED → REVIEW → COMPLETED, testé sur le jeu de test

### Semaine 3 : Frontend + Déploiement

- Next.js : login, dashboard, nouvelle inspection, capture offline (IndexedDB), révision, rapport
- Manifests k8s + déploiement sur la VM existante
- Test terrain avec 1-2 inspecteurs, ajustements

**Livrable jour 15 :** App en production sur microk8s, prête pour beta

---

## Coûts Mensuels (MVP)

| Poste | Coût | Notes |
|---|---|---|
| VM (microk8s) | 0 $ (déjà possédée) | — |
| Domaine | ~1 $/mois | TLS gratuit via cert-manager/Let's Encrypt |
| Claude API | ~0,20-0,40 $/inspection | Vision par photo + 1 appel de synthèse, avec prompt caching |
| **Total infra fixe** | **~1 $/mois** | Le coût variable est presque entièrement Claude |

À 50 $/inspection facturés et ~0,30 $ de coût Claude, la marge brute est très favorable — le jeu de test étiqueté (voir Semaine 2) sert à confirmer que la qualité de détection justifie ce prix avant de généraliser.

---

## Métriques de Succès (MVP)

✅ **Adoption:** 5+ inspecteurs testent l'app, 50+ inspections complétées, NPS > 7/10
✅ **Quality:** mesurée contre le jeu de test étiqueté (pas d'estimation à l'aveugle) — cible initiale à ajuster une fois le prompt validé sur les 10-15 inspections annotées
✅ **Business:** inspecteurs prêts à payer, utilisation > 2x/mois par inspecteur

Si validé → Phase 2 (batching Claude, signature électronique, export email)
Si pas validé → Pivot rapide sur feedback

---

*Document révisé après retour d'architecture (microk8s existant). Code et manifests dans `backend/`, `frontend/`, `k8s/`.*
