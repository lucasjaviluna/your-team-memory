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

## Resolver `project_slug` — flujo obligatorio al iniciar

Antes de cualquier llamada MCP, resolvé el `project_slug` siguiendo esta cascada. Nunca asumir ni inventar un slug.

### Paso 1 — Buscar `.team-memory.json`

Buscá el archivo subiendo desde el directorio de trabajo actual hasta la raíz del repo (donde vive `.git`). El primero que encuentres gana — esto permite que monorepos tengan un config en el root y paquetes internos puedan tener el suyo propio.

### Caso A — `.team-memory.json` existe y tiene `project_slug`

Usarlo directamente, sin preguntar nada.

```
[team-memory] Proyecto: ecommerce-frontend (fuente: .team-memory.json)
```

### Caso B — `.team-memory.json` existe pero sin `project_slug`

El archivo puede existir con otros campos de configuración futura pero sin el slug todavía. Seguir el flujo interactivo (ver abajo) y **actualizar el campo `project_slug` sin tocar los campos existentes**.

### Caso C — `.team-memory.json` no existe

Seguir el flujo interactivo (ver abajo) y **crear el archivo** con `{ "project_slug": "..." }`.

### Flujo interactivo (Casos B y C)

**1. Detectar candidatos** en este orden:
- Remote git origin: `git remote get-url origin` → extraer solo el nombre del repo (`acme/ecommerce-frontend` → `ecommerce-frontend`)
- Campo `name` en `package.json` más cercano (si existe)
- Nombre de la carpeta raíz del repo (donde está `.git`)

**2. Presentar opciones** (máximo 3 candidatos + opción libre):

```
[team-memory] No encontré project_slug en .team-memory.json.
¿Cuál es el nombre de este proyecto en el sistema de memoria del equipo?

  1) ecommerce-frontend  (remote git)
  2) frontend            (package.json)
  3) ecommerce           (carpeta raíz)
  4) Otro — indicame cuál

Respondé con el número o el nombre directamente.
```

**3. Normalizar** la respuesta a kebab-case minúscula:
`Ecommerce Frontend` → `ecommerce-frontend`
`my_app` → `my-app`

**4. Escribir en `.team-memory.json`**:

Caso B — actualizar campo sin destruir los demás:
```json
{
  "project_slug": "ecommerce-frontend",
  "otrosCamposQueYaEstaban": "..."
}
```

Caso C — crear archivo:
```json
{
  "project_slug": "ecommerce-frontend"
}
```

**5. Confirmar al dev**:
```
[team-memory] Proyecto: ecommerce-frontend (guardado en .team-memory.json)
Podés editar ese archivo manualmente si el nombre no es correcto.
El archivo debería commitearse para que todos los devs del equipo usen el mismo slug.
```

### Siempre mostrar el slug activo

Al inicio de cada sesión, independientemente del caso, informar brevemente:
```
[team-memory] Proyecto: <slug> · <N> entradas activas · <fuente>
```

Esto permite al dev detectar rápidamente si el slug es incorrecto y corregirlo antes de que el agente trabaje con el contexto equivocado.

## Resolver `area` — cascada de 4 niveles

`area` es requerido en `save_memory`, `search_memory` y `get_context`. Se resuelve en este orden — el primero que aplica gana:

### Nivel 1 — `area_map` en `.team-memory.json`

Si el archivo tiene `area_map`, buscar el prefijo de ruta más específico que coincida con el archivo activo (o el directorio de trabajo actual):

```json
{
  "project_slug": "ecommerce-platform",
  "default_area": "general",
  "area_map": {
    "src/frontend/": "frontend",
    "src/backend/":  "backend",
    "packages/web/": "frontend",
    "packages/api/": "backend",
    "docker/":       "infra",
    ".github/":      "infra",
    "infra/":        "infra"
  }
}
```

Regla de matching: usar el prefijo más largo que coincida. Si el archivo activo es `src/frontend/components/button.ts` → `frontend`.

### Nivel 2 — `default_area` en `.team-memory.json`

Si no hay `area_map` o no hubo coincidencia, usar el valor de `default_area`. Si no está definido, el default implícito es `general`.

```json
{
  "project_slug": "ecommerce-frontend",
  "default_area": "frontend"
}
```

Útil para repos que son puramente de una sola área — no hay que configurar `area_map`, con `default_area` alcanza.

### Nivel 3 — Inferencia por heurística del agente

Si los niveles 1 y 2 no aplican o no resuelven con confianza, inferir del contexto activo:

| Señal | Área inferida |
|---|---|
| Imports: `@angular/`, `react`, `vue`, `svelte` | `frontend` |
| Extensiones: `.component.ts`, `.module.ts`, `.scss`, `.css`, `.html` en contexto de UI | `frontend` |
| Imports: `express`, `fastify`, `@nestjs/`, `pg`, `mongoose`, `prisma` | `backend` |
| Archivos: `Dockerfile`, `docker-compose*.yml`, `*.tf`, `.github/workflows/` | `infra` |
| Archivos: `nginx.conf`, `kubernetes/`, `helm/` | `infra` |
| Contexto mixto o arquitectural sin señales claras | `general` |

Solo usar esta inferencia cuando el contexto es claro. En caso de duda, pasar al Nivel 4.

### Nivel 4 — Preguntar al dev

Solo cuando los tres niveles anteriores no resuelven con confianza:

```
[team-memory] ¿En qué área enmarcamos esta entrada?
  1) frontend
  2) backend
  3) infra
  4) general

(Podés evitar esta pregunta en el futuro agregando "default_area" o "area_map"
en .team-memory.json)
```

Después de que el dev responda, el agente puede sugerir agregar o actualizar el `area_map` si la pregunta se repite con el mismo directorio.

### Decisiones cross-area

Cuando el conocimiento aplica a más de una capa (ej. "Decidimos usar JWT entre frontend y backend"), usar `area: 'general'` con tags específicos:

```
save_memory({
  area: 'general',
  type: 'DECISION',
  tags: ['frontend', 'backend', 'jwt', 'authentication'],
  ...
})
```

Los tags permiten recuperar la entrada desde cualquier contexto de búsqueda. `area: 'general'` es exactamente para esto — conocimiento que no pertenece a una sola capa.

### Mostrar el área resuelta

Al persistir cualquier entrada, informar brevemente de dónde vino el área:

```
[team-memory] Guardado: "DECISION: Use JWT" → area: general (cross-area, tags: frontend, backend)
[team-memory] Guardado: "BUG: Input validation" → area: frontend (area_map: src/frontend/)
```



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
