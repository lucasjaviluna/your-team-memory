# team-memory

Sistema de memoria persistente y compartida para equipos de desarrollo que trabajan con IA.
Captura el conocimiento generado en sesiones de IA — decisiones, bugs resueltos, convenciones,
anti-patrones — y lo hace disponible para cualquier dev en cualquier sesión futura.

## Stack

- **MCP Server:** Node.js 22 + TypeScript + `@modelcontextprotocol/sdk`
- **Base de datos:** PostgreSQL 16 + pgvector (vectorial + FTS con RRF)
- **Embeddings / Generación:** Ollama local (`nomic-embed-text` + `llama3`)
- **Transporte:** `stdio` (local/admin) · `Streamable HTTP /mcp` (producción/equipo)
- **TUI:** Ink 5 + React + tsx

---

## Onboarding de un dev del equipo

El servidor ya está corriendo en el servidor del equipo (ver Setup de producción más abajo).
Cada dev solo necesita correr **un comando** para tener team-memory disponible en todas
sus herramientas de IA:

```bash
npx github:tu-org/team-memory install
```

Esto detecta automáticamente las herramientas instaladas (Claude Code, VS Code + Copilot,
Copilot CLI, Cursor, OpenCode) y registra el MCP en todas ellas globalmente — sin configurar
nada por proyecto, sin clonar el repo.

La URL del servidor se toma de `packages/installer/team-memory.config.json`. Si necesitás
apuntar a otro servidor:

```bash
# Override explícito
npx github:tu-org/team-memory install --url http://IP:3100/mcp

# O variable de entorno
TEAM_MEMORY_URL=http://IP:3100/mcp npx github:tu-org/team-memory install
```

### Configurar un repo para usar team-memory

Agregar `.team-memory.json` en el root del repo y commitearlo:

```json
// Repo de una sola capa
{
  "project_slug": "nombre-del-proyecto",
  "default_area": "frontend"
}

// Repo fullstack
{
  "project_slug": "nombre-del-proyecto",
  "default_area": "general",
  "area_map": {
    "src/frontend/": "frontend",
    "src/backend/":  "backend",
    "docker/":       "infra",
    ".github/":      "infra"
  }
}
```

El agente de IA lo detecta automáticamente al iniciar cada sesión.

---

## TUI — Terminal UI

Interfaz de terminal para gestionar la memoria sin pasar por un agente de IA.

### Instalación

```bash
# Requiere tener el repo clonado
npm run install-tui
# → instala deps, compila y crea ~/.local/bin/memory-tui
```

### Uso

```bash
# Desde cualquier repo con .team-memory.json
memory-tui

# Con flags explícitos
memory-tui --url=http://localhost:3100/mcp
memory-tui --project=mi-proyecto

# Desde el repo (desarrollo)
npm run tui
npm run tui -- --url=http://localhost:3100/mcp
```

### Pantallas disponibles

| Tecla | Pantalla | Funcionalidad |
|---|---|---|
| inicio | Dashboard | Stats del proyecto, top accedidas, health |
| `l` | Entradas | Lista scrollable con filtros por área y tipo |
| `s` | Búsqueda | Búsqueda semántica live con preview |
| `Enter` | Detalle | Contenido completo + edición (append, tags, status) |
| `c` | Compactar | Dry-run preview + confirmación interactiva |
| `q` | — | Salir |

---

## Scripts de la raíz

| Comando | Descripción |
|---|---|
| `npm run server:install` | Instala dependencias del servidor (`packages/server`) |
| `npm run build` | Compila el servidor TypeScript |
| `npm run dev` | Levanta el servidor en modo desarrollo |
| `npm run install-tui` | Instala `memory-tui` globalmente |
| `npm run tui` | Ejecuta la TUI directamente desde el repo |
| `npm run db:migrate` | Aplica migración 001 (schema inicial) |
| `npm run db:migrate:002` | Aplica migración 002 (user tracking) |

---

## MCP Tools

| Tool | Descripción |
|---|---|
| `save_memory` | Persiste entrada nueva con deduplicación automática |
| `update_memory` | Extiende o corrige entrada existente |
| `search_memory` | Búsqueda híbrida semántica + FTS con RRF |
| `get_context` | Carga contexto completo al inicio de sesión |
| `list_projects` | Lista proyectos con stats opcionales |
| `get_memory_stats` | Health, accesos, autores, candidatos a compactación |
| `compact_memory` | Compacta entradas antiguas en SUMMARYs (dry_run por defecto) |

**Tipos de entrada:** `SUMMARY` · `TASK_CONTEXT` · `DECISION` · `REPOSITORY_NOTE` · `PATTERN` · `ANTI_PATTERN` · `INSIGHT` · `FIX` · `BUG`

**Áreas:** `frontend` · `backend` · `infra` · `general`

---

## Setup de producción (servidor compartido)

### 1. Instalación inicial en el servidor

```bash
bash setup-server.sh
```

Instala Docker, levanta PostgreSQL + Ollama, aplica migraciones y descarga
los modelos. Al finalizar muestra la URL del servidor.

### 2. Aplicar migraciones

```bash
npm run db:migrate
npm run db:migrate:002
```

### 3. Comandos del servidor

```bash
# Estado de los servicios
docker compose -f docker-compose.prod.yml ps

# Logs del MCP server
docker compose -f docker-compose.prod.yml logs -f mcp-server

# Health check
curl http://localhost:3100/health

# Actualizar a la última versión
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build mcp-server
```

---

## Setup local (desarrollo del servidor)

```bash
# 1. Instalar deps del servidor
npm run server:install

# 2. Configurar entorno
cp .env.local .env

# 3. Levantar infra
docker compose up -d
docker exec team-memory-ollama ollama pull nomic-embed-text
docker exec team-memory-ollama ollama pull llama3

# 4. Compilar y correr
npm run build
npm run dev
# → Streamable HTTP disponible en http://localhost:3100/mcp
```

El servidor en modo local usa `MCP_TRANSPORT=http` para que la TUI pueda conectarse.
Para modo `stdio` (subproceso del cliente IA), ver `.env.local`.

---

## Scripts de testing

```bash
# Generar datos de prueba (900 entradas, 6 autores, dedup test entries)
node --env-file=.env scripts/seed.mjs --quick --clean

# Test completo de las 7 tools
node --env-file=.env scripts/test-system.mjs

# Con compactación real
node --env-file=.env scripts/test-system.mjs --compact

# Tests específicos
node --env-file=.env scripts/test-system.mjs --only=4,5,6

# Demo con agente de IA real (requiere ANTHROPIC_API_KEY)
node --env-file=.env scripts/agent-demo.mjs
```

Ver `scripts/README.md` para el detalle completo.

---

## Deploy automático (GitHub Actions)

### Secrets requeridos

| Secret | Descripción |
|---|---|
| `SERVER_HOST` | IP del servidor en la red interna |
| `SERVER_USER` | Usuario SSH |
| `SERVER_SSH_KEY` | Clave privada SSH |

```bash
# Generar clave SSH para el deploy
ssh-keygen -t ed25519 -C "github-actions@team-memory" -f ~/.ssh/tm-deploy -N ""
ssh-copy-id -i ~/.ssh/tm-deploy.pub usuario@IP-SERVIDOR
# Copiar el contenido de ~/.ssh/tm-deploy como secret SERVER_SSH_KEY en GitHub
```

---

## Historial de versiones

| Versión | Cambios principales |
|---|---|
| V2 | Base: 7 tools MCP, PostgreSQL + pgvector + Ollama, instalador para 4 herramientas |
| V3.1 | Advertencia en `--transport=stdio` |
| V3.2 | `project_slug` via `.team-memory.json` con flujo interactivo |
| V3.3 | `area` via cascada de 4 niveles con `area_map` |
| V3.4 | Soporte para OpenCode |
| V4 | Terminal UI Phase 1 (5 pantallas, Ink 5) |
| V4.1 | Fix: subcomando `install-tui` en `cli.mjs` |
| V4.2 | Script `npm run tui` + `.team-memory.json` de ejemplo |
