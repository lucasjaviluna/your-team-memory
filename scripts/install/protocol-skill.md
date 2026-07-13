---
name: team-memory
description: Protocolo universal para usar el sistema de memoria persistente compartida del equipo (team-memory MCP). Se activa en cualquier sesión de código donde sea relevante recuperar contexto de un proyecto, buscar conocimiento previo, o persistir aprendizajes (decisiones, bugs, convenciones, anti-patrones, features completados). No depende de ningún agente o pipeline custom — funciona en cualquier repo, con o sin configuración adicional.
---

# Team Memory — Protocolo Universal

Este skill define cómo usar las tools del servidor MCP `team-memory` durante cualquier sesión de desarrollo, independientemente del proyecto, del LLM, o de si existe un agente de memoria custom para ese repo en particular.

## Tools disponibles

| Tool | Uso |
|---|---|
| `list_projects` | Ver qué proyectos tienen conocimiento guardado |
| `get_context` | Cargar el contexto completo de un proyecto al inicio de sesión |
| `search_memory` | Búsqueda híbrida (semántica + keywords) sobre el conocimiento activo |
| `save_memory` | Persistir una entrada nueva |
| `update_memory` | Corregir o extender una entrada existente |
| `compact_memory` | Compactar entradas viejas y poco usadas en SUMMARYs (solo a pedido explícito) |

## Resolver `project_slug`

Todas las tools necesitan `project_slug`. Se resuelve una sola vez por sesión, en este orden:

1. Campo `name` en `package.json` del repo
2. Si no existe, nombre del repositorio git (del remoto o de la carpeta)
3. Normalizar a kebab-case minúscula (`Ecommerce Frontend` → `ecommerce-frontend`)

Reutilizar el mismo `project_slug` en todas las llamadas de la sesión.

## Áreas y tipos

`area`: `frontend` | `backend` | `infra` | `general`

`type` — 9 tipos, con reglas de clasificación:

| Tipo | Cuándo usarlo |
|---|---|
| `SUMMARY` | Resumen de sesión o de un período de trabajo. Se carga primero siempre en `get_context`. No se busca en `search_memory` salvo filtro explícito `type: 'SUMMARY'`. |
| `TASK_CONTEXT` | Trabajo en progreso, incompleto. "La migración a X está al 60%, falta Y." |
| `DECISION` | Elección técnica o de producto con su razonamiento — el por qué, no solo el qué. |
| `REPOSITORY_NOTE` | Estructura del repo: dónde vive cada cosa, catálogo de componentes/servicios. |
| `PATTERN` | Solución probada y reutilizable, validada específicamente en este proyecto. |
| `ANTI_PATTERN` | Qué no hacer y por qué — evita repetir errores ya documentados. |
| `INSIGHT` | Aprendizaje no obvio descubierto durante el trabajo, que no encaja en los anteriores. |
| `FIX` | Solución aplicada a un problema — con o sin un `BUG` asociado. |
| `BUG` | Problema documentado con el contexto de cómo se manifestó. |

## Flujo de una sesión

### 1. Bootstrap (al inicio)

```
1. Resolver project_slug
2. list_projects() — opcional, para confirmar si el proyecto ya tiene memoria
3. get_context({ project_slug, area? })
   → devuelve priority_entries (SUMMARY + TASK_CONTEXT primero) y entries (resto)
4. Si la tarea es específica de un dominio, complementar con:
   search_memory({ query: <descripción de la tarea>, project_slug, type: 'REPOSITORY_NOTE' | 'PATTERN' | 'ANTI_PATTERN' })
```

Si `get_context` devuelve `total_entries: 0` o el proyecto no aparece en `list_projects`, no es un error — el proyecto simplemente no tiene memoria todavía. Continuar normalmente; la primera entrada que se guarde lo crea automáticamente.

### 2. Durante el trabajo

Antes de responder cualquier pregunta técnica sobre el proyecto (arquitectura, por qué se hizo algo así, bugs conocidos, convenciones del equipo), llamar `search_memory` primero. No asumir ni inventar contexto que podría estar documentado.

Si `search_memory` devuelve un `ANTI_PATTERN` relacionado con algo que el dev está por hacer, advertirlo proactivamente antes de proceder.

### 3. Antes de persistir — deduplicación

El servidor ya hace un control automático de duplicados en `save_memory`. El agente no necesita hacer un `search_memory` previo como paso obligatorio — pero sí debe saber interpretar y actuar ante la respuesta.

**Flujo cuando `save_memory` devuelve `duplicate_detected: true`:**

```
1. Leer el campo `duplicate`: { id, title, content_preview, score }
2. Evaluar con contexto conversacional:
   - score === 1.0 (exact title match) → casi siempre usar update_memory
   - score ~0.030 (near-duplicate)     → revisar content_preview para decidir
3. Mismo tema / mismo componente / misma decisión
   → update_memory({ entry_id: duplicate.id, ... })
4. Genuinamente distinto a pesar del score alto
   → save_memory({ ..., force: true })
5. Nunca ignorar silenciosamente — siempre tomar una de las dos acciones
```

**Tipos excluidos del check automático** (acumulativos por naturaleza):
- `SUMMARY` — es legítimo tener varios sobre períodos distintos
- `TASK_CONTEXT` — es legítimo tener varios sobre tareas distintas en progreso

Para estos tipos, `save_memory` inserta directamente sin verificar duplicados.

### 4. Qué persistir y cuándo

| Señal | Acción |
|---|---|
| Se tomó una decisión técnica con razonamiento explícito | `save_memory` tipo `DECISION` |
| Se resolvió un bug que tomó tiempo no trivial diagnosticar | `save_memory` tipo `BUG` + `FIX` (pueden ser dos entradas separadas) |
| Se confirmó o corrigió una convención del equipo | `save_memory`/`update_memory` tipo `PATTERN` |
| Se identificó algo que no hay que repetir | `save_memory` tipo `ANTI_PATTERN` |
| Se descubrió algo no obvio sobre el sistema | `save_memory` tipo `INSIGHT` |
| Se completó una feature, ruta, módulo o refactor estructural | `save_memory` tipo `SUMMARY` (al cerrar el trabajo) |
| Queda trabajo a medio terminar para la próxima sesión | `save_memory` tipo `TASK_CONTEXT` |
| Se documentó la estructura del repo (dónde vive algo) | `save_memory` tipo `REPOSITORY_NOTE` |

**Por defecto, proponer al dev antes de guardar** — mostrar el contenido completo que se va a persistir y esperar confirmación, salvo que el dev haya indicado explícitamente "guardá automáticamente sin preguntar" para la sesión.

### 5. Compactación

`compact_memory` **nunca se ejecuta de forma autónoma**. Solo a pedido explícito del dev, y siempre:

```
1. Primero con dry_run: true — mostrar el preview completo (cuántas entradas, qué grupos, qué SUMMARYs se crearían)
2. Esperar confirmación explícita
3. Solo entonces ejecutar con dry_run: false
```

`SUMMARY` y `TASK_CONTEXT` nunca son candidatos a compactación — el sistema los excluye automáticamente.

## Formato de contenido al guardar

- `title`: corto y descriptivo, sin relleno
- `content`: markdown autocontenido — debe tener sentido leído de forma aislada, sin depender de contexto conversacional
  - `BUG`: síntoma, entorno, pasos para reproducir, causa raíz si se conoce
  - `FIX`: problema + solución aplicada + por qué funciona
  - `DECISION`: elección + alternativas consideradas + razonamiento
  - `ANTI_PATTERN`: qué no hacer + por qué falla + qué hacer en su lugar
  - `PATTERN`: la regla + ejemplo concreto si aplica
  - `SUMMARY`: resumen ejecutivo + bullets de lo más relevante + período cubierto
- `tags`: términos técnicos relevantes (tecnologías, nombres de archivos/componentes, área temática) — mejoran tanto la búsqueda por keywords como la organización
- `author`: nombre del dev si se conoce, o `"ai-session"` si no hay forma de saberlo

## Coexistencia con agentes de memoria custom

Si el repo tiene un agente de memoria específico (por ejemplo `.claude/agents/memory.md` o `.github/agents/memory.agent.md` con su propia tabla de triggers), ese agente tiene prioridad — está afinado para ese pipeline en particular. Este skill es el comportamiento **base** que garantiza que la memoria se use incluso en repos sin un agente custom, o en sesiones que no pasan por un orquestador.

## Errores comunes a evitar

- No guardar información trivial que ya está en la documentación oficial del proyecto
- No crear `SUMMARY` por cada mensaje — solo al cerrar un bloque de trabajo significativo
- No ejecutar `compact_memory` "para probar" — siempre es a pedido explícito
- No asumir que `project_slug` es el mismo entre proyectos distintos del mismo dev — resolver siempre por repo
- No tratar errores de conexión al MCP como bloqueantes — si el servidor no responde, continuar la sesión sin memoria e informar al dev brevemente
