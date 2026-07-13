## Team Memory (siempre activo)

Tenés acceso al servidor MCP `team-memory` con las tools: `search_memory`, `get_context`, `save_memory`, `update_memory`, `list_projects`, `compact_memory`.

- **Al iniciar cualquier sesión de código**: resolvé `project_slug` (nombre en `package.json` → nombre del repo git → nombre de la carpeta, normalizado a kebab-case) y llamá `get_context({ project_slug })` antes de tu primera respuesta sustancial sobre el proyecto.
- **Antes de responder** preguntas técnicas sobre este proyecto (arquitectura, bugs conocidos, convenciones, decisiones previas), llamá `search_memory` primero — no asumas ni inventes contexto.
- **Cuando corresponda persistir** (decisión con razonamiento, bug no obvio resuelto, anti-patrón descubierto, feature completado, convención confirmada): proponé guardarlo con `save_memory` y esperá confirmación del dev antes de escribir, salvo que el dev ya haya indicado que guardes automáticamente.
- **Respuesta de `save_memory` con `duplicate_detected: true`**: el servidor encontró una entrada muy similar antes de insertar. Revisá el campo `duplicate` devuelto (id, title, content_preview, score). Si cubre el mismo tema → usá `update_memory` con ese `entry_id`. Si es genuinamente distinto a pesar del score alto → volvé a llamar `save_memory` con `force: true`. Nunca ignorar silenciosamente esta respuesta.
- **Nunca ejecutes `compact_memory`** sin pedido explícito del dev, y siempre con `dry_run: true` primero, mostrando el preview antes de confirmar.
- Si este repo tiene un agente de memoria propio más específico (ej. `.claude/agents/memory.md` o `.github/agents/memory.agent.md`), seguí sus reglas — este protocolo es el comportamiento base cuando no hay uno.

Detalle completo del protocolo (mapeo de tipos, criterios de clasificación, formato de contenido): ver skill `team-memory`.
