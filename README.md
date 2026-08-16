# team-memory

Sistema de memoria persistente y compartida para equipos que trabajan con IA.
Captura el conocimiento generado en sesiones — decisiones, bugs resueltos, convenciones,
anti-patrones — y lo hace disponible para cualquier miembro del equipo en cualquier sesión futura.

No solo para devs: QA, diseñadores, POs y analistas funcionales también se benefician.

## Stack

- **MCP Server:** Node.js 22 + TypeScript + `@modelcontextprotocol/sdk`
- **Base de datos:** PostgreSQL 16 + pgvector (vectorial + FTS con RRF)
- **Embeddings / Generación:** Ollama local (`nomic-embed-text` + `llama3`)
- **Transporte:** `stdio` (local/admin) · `Streamable HTTP /mcp` (producción/equipo)
- **Auth:** tokens por usuario con roles (reader / writer / admin)
- **TUI:** Ink 5 + React + tsx

---

## Onboarding — nuevo usuario del equipo

El servidor ya está corriendo. El admin ya generó un invite token para vos.
Solo necesitás correr:

```bash
npx github:tu-org/team-memory install --invite inv-abc123
```

El instalador:

1. Detecta las herramientas de IA instaladas (Claude Code, Copilot, VS Code, Cursor, OpenCode)
2. Te pide tu **username** y el nombre del dispositivo
3. Registra tu cuenta en el servidor y obtiene tu **API key personal**
4. Muestra tu API key una sola vez — guardala en tu gestor de contraseñas
5. Configura todas las herramientas de IA automáticamente con tu token

```
╔══════════════════════════════════════════════════════════════╗
║  🔑 TU API KEY PERSONAL                                      ║
║                                                              ║
║  sk-writer-abc123xyz...                                      ║
║                                                              ║
║  ⚠  Guardá este token en un lugar seguro.                   ║
║     Este mensaje no se va a volver a mostrar.                ║
╚══════════════════════════════════════════════════════════════╝
```

### Dispositivo nuevo (ya tenés token)

```bash
# Si tenés tu token anterior
npx github:tu-org/team-memory install --token sk-writer-abc123...

# Si perdiste tu token — pedile al admin que genere uno nuevo para vos
```

### Configurar tu repo con .team-memory.json

Agregar al root del repo y **commitear** — todos los devs que clonan lo heredan:

```json
{
  "project_slug": "nombre-del-proyecto",
  "default_area": "general",
  "area_map": {
    "src/frontend/": "frontend",
    "src/backend/": "backend",
    "docker/": "infra",
    ".github/": "infra"
  }
}
```

---

## TUI — Terminal UI

Interfaz de terminal para gestionar la memoria sin pasar por un agente de IA.

### Instalación (requiere repo clonado)

```bash
npm run install-tui
# → instala deps, compila y crea ~/.local/bin/memory-tui
```

### Uso

```bash
# Desde cualquier repo con .team-memory.json
memory-tui --token sk-writer-abc123...

# Con variable de entorno (más cómodo)
export TEAM_MEMORY_TOKEN=sk-writer-abc123...
memory-tui

# Con flags explícitos
memory-tui --url=http://localhost:3100/mcp --project=mi-proyecto

# Desde el repo (desarrollo)
npm run tui
```

### Pantallas

| Pantalla  | Acceso  | Funcionalidad                                           |
| --------- | ------- | ------------------------------------------------------- |
| Dashboard | inicio  | Stats del proyecto, top accedidas, health               |
| Entradas  | `l`     | Lista scrollable con filtros área/tipo, ↑↓ para navegar |
| Búsqueda  | `s`     | Búsqueda semántica live con preview                     |
| Detalle   | `Enter` | Contenido completo + append, tags, cambio de estado     |
| Compactar | `c`     | Dry-run preview → confirmación interactiva              |
| Admin     | `a`     | Solo admins: gestionar usuarios, invites, tokens        |

---

## Autenticación

### Roles

| Rol      | Puede hacer                                                       |
| -------- | ----------------------------------------------------------------- |
| `reader` | Leer, buscar, ver stats, compact dry-run                          |
| `writer` | reader + guardar y editar entradas (default para nuevos usuarios) |
| `admin`  | writer + compact real, delete, gestión de usuarios e invites      |

### Flujo inicial del servidor (primer admin)

```bash
# 1. Aplicar migración de auth
docker exec -i team-memory-db psql -U $DB_USER -d $DB_NAME \
  < db/migrations/003_auth.sql

# 2. Configurar en .env del servidor
AUTH_ENABLED=true
ADMIN_BOOTSTRAP_TOKEN=token-secreto-temporal-de-un-solo-uso

# 3. Reiniciar el servidor y crear el primer admin
curl -X POST http://localhost:3100/auth/bootstrap \
  -H "Authorization: Bearer token-secreto-temporal-de-un-solo-uso" \
  -H "Content-Type: application/json" \
  -d '{"username": "lucas", "device_name": "MacBook Lucas"}'
# → guarda el token que devuelve

# 4. Crear invite para el primer miembro del equipo
curl -X POST http://localhost:3100/auth/invites \
  -H "Authorization: Bearer sk-admin-..." \
  -H "Content-Type: application/json" \
  -d '{"role": "writer"}'
# → { "token": "inv-abc123...", "expires_at": "..." }

# 5. Mandar el invite al usuario por Slack/email
# El usuario corre:
npx github:tu-org/team-memory install --invite inv-abc123...
```

### Endpoints de autenticación

Todos en el mismo servidor y puerto que el MCP (`http://IP:3100`):

| Endpoint                     | Auth requerida  | Descripción                          |
| ---------------------------- | --------------- | ------------------------------------ |
| `POST /auth/bootstrap`       | Bootstrap token | Crea el primer admin (un solo uso)   |
| `POST /auth/register`        | Invite token    | Registro con invite                  |
| `GET /auth/me`               | Bearer token    | Verificar token propio               |
| `POST /auth/tokens/device`   | Bearer token    | Nuevo token para otro dispositivo    |
| `POST /auth/invites`         | Admin           | Crear invite token                   |
| `GET /auth/invites`          | Admin           | Listar invites activos               |
| `GET /auth/users`            | Admin           | Listar usuarios                      |
| `POST /auth/users/:id/token` | Admin           | Generar token para usuario existente |
| `PATCH /auth/users/:id/role` | Admin           | Cambiar rol                          |
| `DELETE /auth/tokens/:id`    | Admin           | Revocar token                        |
| `DELETE /auth/users/:id`     | Admin           | Revocar usuario + todos sus tokens   |

### Sin auth (modo legado)

Si `AUTH_ENABLED=false` en el `.env`, el servidor funciona sin autenticación.
La VPN o red interna actúa como único perímetro. Útil para desarrollo local.

---

## MCP Tools (8)

| Tool                     | Rol mínimo | Descripción                                         |
| ------------------------ | ---------- | --------------------------------------------------- |
| `search_memory`          | reader     | Búsqueda híbrida semántica + FTS con RRF            |
| `get_context`            | reader     | Contexto completo al inicio de sesión               |
| `list_projects`          | reader     | Lista proyectos con stats opcionales                |
| `get_memory_stats`       | reader     | Health, accesos, autores, candidatos a compactación |
| `save_memory`            | writer     | Persiste entrada con deduplicación automática       |
| `update_memory`          | writer     | Append de contenido, tags, cambio de estado         |
| `compact_memory` dry_run | reader     | Preview de compactación sin ejecutar                |
| `compact_memory` real    | admin      | Compactación efectiva en producción                 |
| `delete_memory`          | admin      | Eliminación permanente (requiere `confirm: true`)   |

### Tipos de entrada

`SUMMARY` · `TASK_CONTEXT` · `DECISION` · `REPOSITORY_NOTE` · `PATTERN` · `ANTI_PATTERN` · `INSIGHT` · `FIX` · `BUG`

### Áreas

`frontend` · `backend` · `infra` · `general`

---

## Scripts de la raíz

| Comando                  | Descripción                            |
| ------------------------ | -------------------------------------- |
| `npm run server:install` | Instala dependencias del servidor      |
| `npm run build`          | Compila TypeScript del servidor        |
| `npm run dev`            | Levanta el servidor en modo desarrollo |
| `npm run install-tui`    | Instala `memory-tui` globalmente       |
| `npm run tui`            | Ejecuta la TUI desde el repo           |
| `npm run db:migrate`     | Aplica migración 001 (schema inicial)  |
| `npm run db:migrate:002` | Aplica migración 002 (user tracking)   |

Migración 003 (auth) se aplica manualmente — ver sección de autenticación.

---

## Setup local (desarrollo)

```bash
# 1. Instalar deps del servidor
npm run server:install

# 2. Configurar entorno
cp .env.local .env
# Si querés probar auth localmente:
# AUTH_ENABLED=true
# ADMIN_BOOTSTRAP_TOKEN=boot-dev

# 3. Levantar infraestructura
docker compose up -d
docker exec team-memory-ollama ollama pull nomic-embed-text
docker exec team-memory-ollama ollama pull llama3

# 4. Aplicar migraciones
npm run db:migrate
npm run db:migrate:002
npm run db:migrate:003
# Con auth:
docker exec -i team-memory-db psql -U $DB_USER -d $DB_NAME < db/migrations/003_auth.sql

# 5. Compilar y correr (modo HTTP para que la TUI pueda conectar)
npm run build
MCP_TRANSPORT=http npm run dev
# → Servidor en http://localhost:3100/mcp

# 6. TUI apuntando al servidor local
memory-tui --url=http://localhost:3100/mcp
```

---

## Setup de producción (servidor compartido)

### Instalación inicial en el servidor

```bash
bash setup-server.sh
```

Instala Docker, levanta PostgreSQL + Ollama, aplica migraciones y descarga los modelos.

### Comandos del servidor

```bash
# Estado de servicios
docker compose -f docker-compose.prod.yml ps

# Logs del MCP server
docker compose -f docker-compose.prod.yml logs -f mcp-server

# Health check
curl http://localhost:3100/health
# → { "status": "ok", "auth": "enabled", ... }

# Actualizar
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build mcp-server
```

---

## Deploy automático (GitHub Actions)

### Secrets requeridos

| Secret           | Descripción                       |
| ---------------- | --------------------------------- |
| `SERVER_HOST`    | IP del servidor en la red interna |
| `SERVER_USER`    | Usuario SSH                       |
| `SERVER_SSH_KEY` | Clave privada SSH                 |

```bash
# Generar clave SSH para el deploy
ssh-keygen -t ed25519 -C "github-actions@team-memory" -f ~/.ssh/tm-deploy -N ""
ssh-copy-id -i ~/.ssh/tm-deploy.pub usuario@IP-SERVIDOR
# Copiar el contenido de ~/.ssh/tm-deploy como secret SERVER_SSH_KEY
```

---

## Scripts de testing

```bash
# Generar datos de prueba
node --env-file=.env scripts/seed.mjs --quick --clean

# Test completo de las 8 tools
node --env-file=.env scripts/test-system.mjs

# Con compactación real
node --env-file=.env scripts/test-system.mjs --compact

# Tests específicos
node --env-file=.env scripts/test-system.mjs --only=4,5,6

# Demo con agente de IA real (requiere ANTHROPIC_API_KEY)
node --env-file=.env scripts/agent-demo.mjs
```

---

## Historial de versiones

| Versión | Cambios principales                                                                |
| ------- | ---------------------------------------------------------------------------------- |
| V2      | Base: 7 tools MCP, PostgreSQL + pgvector + Ollama, instalador para 4 herramientas  |
| V3.1    | Advertencia en `--transport=stdio`                                                 |
| V3.2    | `project_slug` via `.team-memory.json` con flujo interactivo                       |
| V3.3    | `area` via cascada de 4 niveles con `area_map`                                     |
| V3.4    | Soporte para OpenCode                                                              |
| V4      | Terminal UI Phase 1 (5 pantallas, Ink 5)                                           |
| V4.1    | Fix: subcomando `install-tui` en `cli.mjs`                                         |
| V4.2    | Script `npm run tui` + `.team-memory.json` de ejemplo                              |
| V4.3    | `.gitignore` completo + README actualizado                                         |
| V4.4    | Mensaje de bienvenida TUI con fuentes de resolución                                |
| V4.5    | Auth completa: 3 tablas, middleware, 11 endpoints, `delete_memory`, pantalla Admin |
