#!/bin/bash
# setup-server.sh — Instalación inicial en el servidor de producción (red interna / VPN)
# Ejecutar como root: bash setup-server.sh

set -e

echo "╔══════════════════════════════════════════╗"
echo "║   team-memory — Server Setup             ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. Docker ─────────────────────────────────────────────────────────────────
echo ""
echo "1/4 → Instalando Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker
echo "   ✓ Docker listo"

# ── 2. Clonar repo ────────────────────────────────────────────────────────────
echo ""
echo "2/4 → Clonando repositorio..."
git clone https://github.com/lucasjaviluna/your-team-memory.git /opt/your-team-memory
cd /opt/your-team-memory
echo "   ✓ Repositorio en /opt/your-team-memory"

# ── 3. Configurar .env ────────────────────────────────────────────────────────
echo ""
echo "3/4 → Configurando entorno..."

DB_PASS=$(openssl rand -hex 24)

cp .env.prod .env
sed -i "s/CAMBIAR_POR_PASSWORD_SEGURO/${DB_PASS}/" .env

echo ""
echo "   ┌────────────────────────────────────────────────┐"
echo "   │  GUARDÁ ESTA CREDENCIAL                        │"
echo "   │  DB_PASSWORD = ${DB_PASS}   │"
echo "   └────────────────────────────────────────────────┘"
echo ""
read -p "   Presioná Enter cuando la hayas guardado..."

# ── 4. Levantar servicios ─────────────────────────────────────────────────────
echo ""
echo "4/4 → Levantando servicios..."
docker compose -f docker-compose.prod.yml up -d

echo "   Esperando que los servicios estén listos..."
sleep 20

echo "   Descargando modelos de Ollama..."
docker exec team-memory-ollama ollama pull nomic-embed-text
docker exec team-memory-ollama ollama pull llama3

# ── Verificación ──────────────────────────────────────────────────────────────
SERVER_IP=$(hostname -I | awk '{print $1}')
HTTP_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:3100/health || echo "000")

echo ""
echo "═══════════════════════════════════════════════════"
if [[ "$HTTP_STATUS" == "200" ]]; then
  echo "  ✅ Setup completo"
  echo ""
  echo "  Servidor:  http://${SERVER_IP}:3100"
  echo "  Health:    http://${SERVER_IP}:3100/health"
  echo "  MCP URL:   http://${SERVER_IP}:3100/mcp"
  echo ""
  echo "  Configuración para cada dev:"
  echo "  ──────────────────────────────────────────────"
  echo "  Claude Code (~/.claude/claude_desktop_config.json):"
  echo ""
  echo '  {'
  echo '    "mcpServers": {'
  echo '      "team-memory": {'
  echo "        \"url\": \"http://${SERVER_IP}:3100/mcp\""
  echo '      }'
  echo '    }'
  echo '  }'
else
  echo "  ❌ Algo falló (HTTP ${HTTP_STATUS})"
  echo "  Revisá: docker compose -f docker-compose.prod.yml logs mcp-server"
fi
echo "═══════════════════════════════════════════════════"
