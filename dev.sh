#!/usr/bin/env bash
# Démarre l'app localement via docker compose (Postgres + backend + worker + frontend).
# Nécessite Docker avec le plugin Compose v2 (`docker compose version`).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "→ Création de .env à partir de .env.example..."
  cp .env.example .env
  SECRET=$(openssl rand -hex 32)
  sed -i.bak "s/^SECRET_KEY=.*/SECRET_KEY=${SECRET}/" .env && rm -f .env.bak
  echo "  Clé JWT générée automatiquement."
fi

if grep -q "^ANTHROPIC_API_KEY=sk-ant-\.\.\.$" .env; then
  echo "⚠️  ANTHROPIC_API_KEY n'est pas configurée dans .env — l'analyse IA échouera tant"
  echo "   que vous n'y aurez pas mis une vraie clé Anthropic. Le reste de l'app fonctionne quand même."
fi

echo "→ Démarrage des conteneurs (build si nécessaire)..."
docker compose up --build -d

echo "→ Attente du backend..."
ready=false
for _ in $(seq 1 60); do
  if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" = false ]; then
  echo "⚠️  Le backend ne répond pas encore après 60s — vérifiez : docker compose logs backend"
fi

DEV_EMAIL="inspecteur@local.test"
DEV_PASSWORD="inspecteur123"
echo "→ Compte de test (créé si absent) : ${DEV_EMAIL} / ${DEV_PASSWORD}"
docker compose exec -T backend python -m scripts.create_user \
  --email "$DEV_EMAIL" --password "$DEV_PASSWORD" --full-name "Inspecteur Test" || true

ADMIN_EMAIL="admin@local.test"
ADMIN_PASSWORD="admin12345"
echo "→ Compte admin (créé si absent) : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"
docker compose exec -T backend python -m scripts.create_user \
  --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" --full-name "Admin Test" --role admin || true

cat <<EOF

✅ Prêt :
   Frontend : http://localhost:3000
   Backend  : http://localhost:8000/health
   Compte de test : ${DEV_EMAIL} / ${DEV_PASSWORD}
   Compte admin   : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}

Logs  : docker compose logs -f [service]
Arrêt : docker compose down
Reset complet (efface les données) : docker compose down -v
EOF
