#!/usr/bin/env bash
# ==============================================================================
# PaySync - Script de Despliegue Automatizado para Servidores VPS (Linux)
# ==============================================================================
set -e

echo "🚀 Iniciando despliegue de PaySync..."

# 1. Obtener los últimos cambios de Git
if [ -d ".git" ]; then
  echo "📥 Actualizando repositorio desde Git..."
  git fetch origin main
  git reset --hard origin/main
fi

# 2. Instalar dependencias
echo "📦 Instalando dependencias del Backend y Frontend..."
npm run install:all

# 3. Compilar Frontend para producción
echo "🔨 Compilando Frontend (Vite SPA)..."
npm run build

# 4. Crear directorios requeridos
mkdir -p logs backend/uploads

# 5. Reiniciar o iniciar servicio con PM2
echo "🔄 Recargando servicio en PM2..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload ecosystem.config.js --env production
  pm2 save
  echo "✅ Servicio PM2 recargado con éxito."
else
  echo "⚠️ PM2 no está instalado globalmente. Ejecuta: npm install -g pm2"
  echo "Iniciando proceso en segundo plano con Node..."
  nohup node backend/server.js > logs/output.log 2>&1 &
fi

# 6. Validar estado de salud del servicio
echo "🩺 Verificando salud del servicio..."
sleep 2
if command -v curl >/dev/null 2>&1; then
  curl -fsS http://localhost:3001/api/health || { echo "❌ El Healthcheck falló"; exit 1; }
  echo ""
  echo "🎉 ¡Despliegue completado con éxito! PaySync está activo y saludable."
else
  echo "🎉 Despliegue completado (curl no disponible para healthcheck)."
fi
