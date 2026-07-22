# Deploy Bee Workers

Dominio: bee-workers.lumodigitalsolutions.com
VPS: 5.189.159.232
Puerto interno: 3004

## Requisitos en VPS
- Docker instalado
- Docker Compose plugin
- Traefik corriendo como reverse proxy
- Red Docker externa llamada `web`

## Deploy
```bash
cp .env.example .env
# Completar variables
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

## Verificar
```bash
curl https://bee-workers.lumodigitalsolutions.com/api/health
```
