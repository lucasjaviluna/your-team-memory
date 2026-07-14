## Team Memory (siempre activo)

Tenés acceso al servidor MCP `team-memory` con las tools: `search_memory`, `get_context`, `save_memory`, `update_memory`, `list_projects`, `compact_memory`.

### Resolving `project_slug` (required at startup)

Before any other action, resolve `project_slug` using this flow:

**Step 1 — Find `.team-memory.json`** by going up from the current directory until you find `.git` (the first one found wins — useful in monorepos).

**Case A — It exists and has `project_slug`:**
Use it directly. Inform the dev:

```
[team-memory] Project: <slug> (source: .team-memory.json)
```

**Case B — It exists but without `project_slug`**, or **Case C — It does not exist:**

1. Detect candidates:
   - Git remote name (e.g. `acme/ecommerce-frontend` → `ecommerce-frontend`)
   - `name` field in `package.json`, if present
   - Root repo folder name
2. Present options to the dev:

```
[team-memory] I did not find project_slug. What is the name of this project?
  1) ecommerce-frontend  (git remote)
  2) frontend            (package.json)
  3) mis-cosas           (folder)
  4) Other — tell me which one
```

3. Wait for the dev's response.
4. Normalize to lowercase kebab-case.
5. Write to `.team-memory.json`:
   - Case B: update the `project_slug` field without touching other existing fields
   - Case C: create the file with `{ "project_slug": "..." }`
6. Inform the dev:

```
[team-memory] Project: <slug> (saved in .team-memory.json)
You can edit it manually if the name is incorrect.
```

The resolved `project_slug` is reused in all MCP calls for the session.

### Behavior during the session

- **Al iniciar**: llamá `get_context({ project_slug })` antes de tu primera respuesta sustancial.
- **Antes de responder** preguntas técnicas sobre el proyecto, llamá `search_memory` — no asumas ni inventes contexto.
- **Al persistir** (decisión, bug, convención, feature): `save_memory` responde `duplicate_detected: true` si ya existe algo similar — en ese caso usá `update_memory` sobre la entrada existente, o `save_memory` con `force: true` si es genuinamente distinto.
- **Nunca ejecutes `compact_memory`** sin pedido explícito del dev, siempre con `dry_run: true` primero.
- Si este repo tiene un agente de memoria más específico (`.claude/agents/memory.md`), seguí sus reglas — este protocolo es el comportamiento base.

Detalle completo: skill `team-memory`.
