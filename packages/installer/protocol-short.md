## Team Memory (siempre activo)

Tenés acceso al servidor MCP `team-memory` con las tools: `search_memory`, `get_context`, `save_memory`, `update_memory`, `list_projects`, `compact_memory`.

### Resolución de project_slug (obligatorio al iniciar)

Antes de cualquier otra acción, resolvé el `project_slug` siguiendo este flujo:

**Paso 1 — Buscar `.team-memory.json`** subiendo desde el directorio actual hasta encontrar `.git` (el primero que encuentres gana — útil en monorepos).

**Caso A — Existe y tiene `project_slug`:**
Usarlo directamente. Informar al dev:
```
[team-memory] Proyecto: <slug> (fuente: .team-memory.json)
```

**Caso B — Existe pero sin `project_slug`**, o **Caso C — No existe:**
1. Detectar candidatos:
   - Nombre del remote git (ej. `acme/ecommerce-frontend` → `ecommerce-frontend`)
   - Campo `name` de `package.json` si existe
   - Nombre de la carpeta raíz del repo
2. Presentar opciones al dev:
```
[team-memory] No encontré project_slug. ¿Cuál es el nombre de este proyecto?
  1) ecommerce-frontend  (remote git)
  2) frontend            (package.json)
  3) mis-cosas           (carpeta)
  4) Otro — indicame cuál
```
3. Esperar respuesta del dev.
4. Normalizar a kebab-case minúscula.
5. Escribir en `.team-memory.json`:
   - Caso B: actualizar el campo `project_slug` sin tocar otros campos existentes
   - Caso C: crear el archivo con `{ "project_slug": "..." }`
6. Informar al dev:
```
[team-memory] Proyecto: <slug> (guardado en .team-memory.json)
Podés editarlo manualmente si el nombre no es correcto.
```

El `project_slug` resuelto se reutiliza en todas las llamadas MCP de la sesión.

### Resolución de `area`

Para cada entrada a guardar o buscar, resolver el área en este orden:
1. `area_map` en `.team-memory.json` — matching por ruta del archivo activo (prefijo más largo)
2. `default_area` en `.team-memory.json` — área default del repo
3. Inferencia por heurística — imports, extensiones, nombre de archivo
4. Preguntar al dev — solo si los tres anteriores fallan

Decisiones que afectan varias capas → `area: 'general'` + tags específicos (`frontend`, `backend`, etc.).
Informar siempre qué área se resolvió y desde qué nivel. Detalle completo: skill `team-memory`.

### Comportamiento durante la sesión

- **Al iniciar**: llamá `get_context({ project_slug })` antes de tu primera respuesta sustancial.
- **Antes de responder** preguntas técnicas sobre el proyecto, llamá `search_memory` — no asumas ni inventes contexto.
- **Al persistir** (decisión, bug, convención, feature): `save_memory` responde `duplicate_detected: true` si ya existe algo similar — en ese caso usá `update_memory` sobre la entrada existente, o `save_memory` con `force: true` si es genuinamente distinto.
- **Nunca ejecutes `compact_memory`** sin pedido explícito del dev, siempre con `dry_run: true` primero.
- Si este repo tiene un agente de memoria más específico (`.claude/agents/memory.md`), seguí sus reglas — este protocolo es el comportamiento base.

Detalle completo: skill `team-memory`.
