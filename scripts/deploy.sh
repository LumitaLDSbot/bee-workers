#!/usr/bin/env bash
set -euo pipefail

APP_NAME="bee-workers"
APP_DIR="/opt/bee-workers"
DOMAIN="bee-workers.lumodigitalsolutions.com"
PORT="3004"
NETWORK="web"

echo "🚀 Deploy de ${APP_NAME}"
echo "Dominio: ${DOMAIN}"

if ! command -v docker &> /dev/null; then echo "❌ Docker no está instalado"; exit 1; fi
if ! docker compose version &> /dev/null; then echo "❌ Docker Compose plugin no está disponible"; exit 1; fi

mkdir -p "${APP_DIR}"

if ! docker network inspect "${NETWORK}" >/dev/null 2>&1; then
  echo "🌐 Creando red Docker '${NETWORK}'"
  docker network create "${NETWORK}"
fi

echo "📦 Sincronizando archivos..."
rsync -av --delete --exclude '.git' --exclude 'node_modules' --exclude '.next' --exclude '.env' ./ "${APP_DIR}/"

cd "${APP_DIR}"

if [ ! -f .env ]; then echo "❌ Falta .env en ${APP_DIR}"; exit 1; fi

echo "🔨 Construyendo imagen Docker..."
docker compose build --pull

echo "♻️  Reiniciando contenedor..."
docker compose up -d --remove-orphans

echo "🩺 Esperando health check..."
sleep 10

for i in {1..10}; do
  if curl --fail --silent "http://127.0.0.1:${PORT}/api/health" > /dev/null; then
    echo "✅ Servicio activo en puerto ${PORT}"
    exit 0
  fi
  echo "Intento ${i}/10 fallido. Reintentando..."
  sleep 5
done

echo "❌ El health check falló. Revisa logs:"
echo "docker logs ${APP_NAME}"
exit 1
