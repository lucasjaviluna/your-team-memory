# Scripts de testing — team-memory

Tres scripts para probar el sistema completo, actualizados para cubrir
todas las features implementadas: save_memory con deduplicación, update_memory,
get_memory_stats con tracking de autores y user_id reservado, y compact_memory.

---

## Prerequisitos

```bash
# Docker corriendo con PostgreSQL + Ollama
docker compose up -d
docker exec team-memory-ollama ollama pull nomic-embed-text
docker exec team-memory-ollama ollama pull llama3

# Aplicar migración 002 (user tracking foundation)
docker exec -i team-memory-db psql -U $DB_USER -d $DB_NAME \
  < db/migrations/002_user_tracking.sql

# Dependencias
npm install && npm run build --workspace=packages/server
```

---

## 1. seed.mjs — Generar datos de prueba

Genera **100 entradas por tipo** (900 total) con contenido variado,
timestamps en 3 franjas temporales, 6 autores distintos, y un par de
entradas con título idéntico para testear la deduplicación.

```bash
# Sin embeddings (rápido ~30seg)
node --env-file=.env scripts/seed.mjs --quick

# Con embeddings reales (lento ~15min — mejor calidad semántica)
node --env-file=.env scripts/seed.mjs

# Borrar datos previos antes de seedear
node --env-file=.env scripts/seed.mjs --quick --clean
```

**Distribución de timestamps:**
- 30 entradas/tipo → 0-30 días (recientes, acceso moderado)
- 30 entradas/tipo → 31-90 días (medias, acceso variado)
- 40 entradas/tipo → 91-365 días (antiguas → candidatas a compactación)

**Autores incluidos:** `lucas`, `sofia`, `martin`, `ana`, `diego`, `carla`
→ permite testear `get_memory_stats` con filtro `author`

**Entradas especiales para tests de dedup:**
- 2 entradas con el mismo título `DECISION: Use Zustand for state management`
  → deben aparecer en `health.duplicate_risk_count` de `get_memory_stats`

---

## 2. test-system.mjs — Test completo sin IA externa

Prueba todos los flujos directamente contra las funciones del servidor.
Cubre las 7 tools actuales con assertions y análisis de resultados.

```bash
# Test completo (sin compactación real)
node --env-file=.env scripts/test-system.mjs

# También ejecuta compactación real
node --env-file=.env scripts/test-system.mjs --compact

# Filtrar por área
node --env-file=.env scripts/test-system.mjs --area=backend

# Correr solo tests específicos (por número)
node --env-file=.env scripts/test-system.mjs --only=4,5
node --env-file=.env scripts/test-system.mjs --only=6

# Combinar flags
node --env-file=.env scripts/test-system.mjs --compact --area=frontend
```

**Tests incluidos:**

| # | Tool testeada | Qué verifica |
|---|---|---|
| 1 | `list_projects` | Proyectos con stats por área/tipo/status |
| 2 | `get_context` | Orden de prioridad: SUMMARY → TASK_CONTEXT → resto |
| 3 | `search_memory` | 5 queries distintas, análisis de score RRF |
| 4 | `save_memory` | Inserción normal → duplicado detectado → force:true → SUMMARY exento |
| 5 | `update_memory` | append_content, add_tags, status, error en archived |
| 6 | `get_memory_stats` | Overview, timeline, autores, health, user_id reservado |
| 7 | `compact_memory` | dry_run + real (con --compact) + verificación post-compact |

---

## 3. agent-demo.mjs — Agente de IA con Anthropic API

Usa `claude-sonnet-4-6` con tool_use para simular exactamente cómo un
agente de IA usaría el sistema en una sesión real de desarrollo.
Requiere `ANTHROPIC_API_KEY` en el `.env`.

```bash
# Demo completa (query por defecto: JWT authentication)
node --env-file=.env scripts/agent-demo.mjs

# Con query personalizada
node --env-file=.env scripts/agent-demo.mjs --query="React state management patterns"
node --env-file=.env scripts/agent-demo.mjs --query="Docker deployment issues"
```

**Los 6 pasos que ejecuta el agente:**

1. **Bootstrap** — `list_projects` + `get_context` → explica qué encontró
2. **Búsqueda** — `search_memory` con análisis del score RRF y access_count
3. **Deduplicación** — intenta guardar un duplicado, maneja `duplicate_detected: true`
4. **Update** — usa `update_memory` con `append_content` y `add_tags`
5. **Stats** — `get_memory_stats` con análisis de health y nota sobre `user_id`
6. **Compactación** — `compact_memory dry_run` con recomendación razonada

**Requiere en `.env`:**
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Flujo recomendado de testing completo

```bash
# 1. Seedear (una sola vez, o con --clean para empezar de cero)
node --env-file=.env scripts/seed.mjs --quick --clean

# 2. Test del sistema — verificar que todo funciona
node --env-file=.env scripts/test-system.mjs

# 3. Agente de IA interactuando con el sistema
node --env-file=.env scripts/agent-demo.mjs

# 4. Probar compactación real y verificar integridad
node --env-file=.env scripts/test-system.mjs --compact

# 5. Verificar estado post-compactación
node --env-file=.env scripts/test-system.mjs --only=1,6

# 6. Testear con query semántica específica
node --env-file=.env scripts/agent-demo.mjs --query="anti-patrones en servicios Angular"
```

---

## Qué cubre cada feature nueva

| Feature | seed.mjs | test-system.mjs | agent-demo.mjs |
|---|---|---|---|
| `save_memory` deduplication | Inserta 2 títulos idénticos | Test 4B (bloqueado) + 4C (force) + 4D (SUMMARY exento) | Paso 3 — demo con análisis |
| `update_memory` | — | Test 5 completo | Paso 4 |
| `get_memory_stats` | Genera datos variados (6 autores) | Test 6 con filtro author + user_id | Paso 5 |
| `compact_memory` real | — | Test 7 con --compact | Paso 6 (solo dry_run) |
| `user_id` reservado | — | Verifica que filters.user_id es null | Agente analiza la nota |
| Migración 002 | — | Test 5D (archived) | Implícito |
