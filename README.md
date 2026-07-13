# team-memory — MCP Server

Sistema de memoria persistente y compartida para equipos de desarrollo que trabajan con IA.

## Stack

- **MCP Server**: TypeScript + `@modelcontextprotocol/sdk`
- **Base de datos**: PostgreSQL 16 + pgvector
- **Embeddings / Generación**: Ollama local (`nomic-embed-text` + `llama3`)
- **Transporte**: `stdio` para local · `Streamable HTTP` para red interna / VPN

---

## Modos de uso

```
┌─────────────────────────────────────────────────────────────┐
│  LOCAL (desarrollo)            PRODUCCIÓN (red interna/VPN) │
│                                                             │
│  MCP_TRANSPORT=           MCP_TRANSPORT=http            │
│  Docker en tu máquina          Servidor compartido del equipo│
│  Conexión: command+args        Conexión: URL                │
└─────────────────────────────────────────────────────────────┘
```

---

## Setup local (desarrollo)

### 1. Instalar dependencias del servidor

El servidor tiene su propio `package.json` independiente. El `npm install` del root **no** instala las dependencias del servidor — esto es intencional para que `npx` sea rápido.

```bash
# Solo las deps del servidor (una vez al clonar)
npm run server:install

# O directamente
npm install --prefix packages/server
```

### 2. Levantar infraestructura

```bash
cp .env.local .env
docker compose up -d
docker exec team-memory-ollama ollama pull nomic-embed-text
docker exec team-memory-ollama ollama pull llama3
```

### 3. Compilar y correr

```bash
npm run build
npm run dev
```

### 3. Configurar Claude Code

`~/.claude/claude_desktop_config.json` (Mac/Linux):

```json
{
  "mcpServers": {
    "team-memory": {
      "command": "node",
      "args": ["/ruta/a/team-memory/packages/server/dist/index.js"],
      "env": {
        "DB_HOST": "",
        "DB_PORT": "",
        "DB_USER": "",
        "DB_PASSWORD": "",
        "DB_NAME": "",
        "OLLAMA_URL": "",
        "OLLAMA_EMBED_MODEL": "",
        "OLLAMA_CHAT_MODEL": "",
        "MCP_TRANSPORT": ""
      }
    }
  }
}
```

`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "team-memory": {
      "command": "node",
      "args": ["C:\\ruta\\a\\team-memory\\packages\\server\\dist\\index.js"],
      "env": {
        "DB_HOST": "",
        "DB_PORT": "",
        "DB_USER": "",
        "DB_PASSWORD": "",
        "DB_NAME": "",
        "OLLAMA_URL": "",
        "OLLAMA_EMBED_MODEL": "",
        "OLLAMA_CHAT_MODEL": "",
        "MCP_TRANSPORT": ""
      }
    }
  }
}
```

---

## Setup de producción (servidor compartido)

### Instalación inicial en el servidor (una sola vez)

```bash
bash setup-server.sh
```

El script instala Docker, clona el repo, genera las credenciales de DB,
levanta todos los servicios y descarga los modelos de Ollama.

Al finalizar muestra la IP y la URL del servidor.

### Configuración de cada dev (producción)

Una vez que el servidor está levantado, cada dev solo necesita agregar
esto en su `claude_desktop_config.json` — reemplazando la IP por la del servidor:

```json
{
  "mcpServers": {
    "team-memory": {
      "url": "http://192.168.1.100:3100/mcp"
    }
  }
}
```

Sin tokens, sin contraseñas — la VPN o red interna ya restringe el acceso.

### Comandos del servidor

```bash
# Ver estado de todos los servicios
docker compose -f docker-compose.prod.yml ps

# Ver logs del MCP server
docker compose -f docker-compose.prod.yml logs -f mcp-server

# Reiniciar solo el MCP server (sin bajar la DB)
docker compose -f docker-compose.prod.yml restart mcp-server

# Health check
curl http://localhost:3100/health

# Actualizar a la última versión manualmente
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build mcp-server
```

---

## Deploy automático (GitHub Actions)

### Secrets requeridos en GitHub

| Secret           | Descripción                       |
| ---------------- | --------------------------------- |
| `SERVER_HOST`    | IP del servidor en la red interna |
| `SERVER_USER`    | Usuario SSH                       |
| `SERVER_SSH_KEY` | Clave privada SSH                 |

### Generar clave SSH para GitHub Actions

```bash
# En tu máquina local
ssh-keygen -t ed25519 -C "github-actions@team-memory" -f ~/.ssh/tm-deploy -N ""

# Copiar clave pública al servidor
ssh-copy-id -i ~/.ssh/tm-deploy.pub usuario@IP-SERVIDOR

# Copiar clave privada como secret en GitHub
cat ~/.ssh/tm-deploy   # → pegar en SERVER_SSH_KEY
```

El workflow de CI corre en cada PR (TypeScript check + build + migración).
El workflow de deploy corre automáticamente al mergear a `main`.

---

## Scripts de testing

```bash
# Generar 900 entradas de prueba (100 por tipo)
node --env-file=.env scripts/seed.mjs --quick

# Test completo del sistema
node --env-file=.env scripts/test-system.mjs

# Test con compactación real
node --env-file=.env scripts/test-system.mjs --compact

# Agente de IA interactuando con el sistema
node --env-file=.env scripts/agent-demo.mjs
```

Ver `scripts/README.md` para más detalles.

---

## Instalador universal (cualquier herramienta de IA)

Para que cada dev tenga team-memory disponible automáticamente en **cualquier sesión de IA** (Claude Code, Copilot CLI, VS Code, Cursor) sin configurar nada por proyecto, ni clonar el repo manualmente:

```bash
npx github:tu-org/team-memory install
```

La URL del servidor se toma de `scripts/install/team-memory.config.json` (editar `defaultUrl` con la IP real una sola vez al configurar el repo de la empresa). Solo hace falta pasar `--url` si se quiere apuntar a otro servidor distinto del default (ej. staging):

```bash
npx github:tu-org/team-memory install --url http://staging-ip:3100/mcp
```

Detecta qué herramientas tiene instaladas, registra el MCP globalmente en cada una, e instala el protocolo de uso (cuándo buscar, cuándo persistir, cómo clasificar). Es idempotente, hace backup antes de tocar archivos existentes, y soporta `--dry-run` y el subcomando `uninstall`:

```bash
npx github:tu-org/team-memory install --dry-run
npx github:tu-org/team-memory uninstall
npx github:tu-org/team-memory help
```

> **Nota:** la primera vez, `npx` instala las dependencias de todo el monorepo (el instalador en sí no usa ninguna) — tarda unos segundos extra. Si se vuelve un problema, está en el roadmap separarlo a un paquete standalone sin dependencias.

Ver `scripts/install/README.md` para el detalle completo de qué modifica en cada herramienta.

## MCP Tools disponibles

| Tool             | Descripción                                     |
| ---------------- | ----------------------------------------------- |
| `save_memory`    | Guarda una nueva entrada con embedding generado |
| `search_memory`  | Búsqueda híbrida (semántica + keywords) con RRF |
| `get_context`    | Carga contexto completo al inicio de sesión     |
| `list_projects`  | Lista proyectos con entradas activas            |
| `compact_memory` | Compacta entradas antiguas en SUMMARYs          |

## Tipos de entrada

`BUG` · `FIX` · `DECISION` · `INSIGHT` · `PATTERN` · `ANTI_PATTERN` · `REPOSITORY_NOTE` · `TASK_CONTEXT` · `SUMMARY`

## Áreas

`frontend` · `backend` · `infra` · `general`
