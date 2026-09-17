# Iteración 004 — Seguridad del input de embeddings

Fecha: 2026-09-15
Estado: completada

## Problema

Los `TASK_CONTEXT` acumulativos podían superar la ventana de contexto de Ollama al
regenerar su embedding durante un update, aunque el contenido almacenado fuera válido.

## Solución

`buildEmbeddingText` aplica `OLLAMA_EMBED_MAX_CHARS` (4.000 por defecto). Para entradas
largas conserva el título, tags, el 60% inicial y el tramo final del contenido, insertando
un marcador explícito en el segmento omitido. El contenido original de la entrada no se
modifica.

## Verificación

- Test unitario de límite, marcador y preservación de extremos.
- `npm run test:server` → 11 correctos y 2 integraciones omitidas por defecto.
- `npm run build` → correcto.

## Configuración

Se puede ajustar `OLLAMA_EMBED_MAX_CHARS` según el modelo, manteniendo margen para su
ventana de tokens. El valor afecta únicamente la representación vectorial.

Verificación operativa — 2026-09-15: el runtime MCP activo aceptó una actualización real
del `TASK_CONTEXT` acumulativo mediante `update_memory` y una búsqueda posterior confirmó
la persistencia del cambio. No queda pendiente reiniciar/reconstruir el runtime para esta
corrección.

## Evolución estructural iniciada

La migración `db/migrations/004_memory_entry_revisions.sql` crea
`memory_entry_revisions`. `update_memory` registra la versión previa dentro de una
transacción antes de aplicar cambios, permitiendo reemplazar o rotar un `TASK_CONTEXT`
sin perder trazabilidad. La tool `get_memory_revisions` expone el historial por
`entry_id`, con paginación y sin embeddings. La tool `restore_memory_revision` permite
restaurar una revisión con confirmación explícita: guarda el estado actual como una nueva
revisión, regenera el embedding y aplica la restauración en una única transacción.

La política de rotación quedó implementada mediante `rotate_task_context`: requiere
confirmación explícita, usa un umbral configurable de 12.000 caracteres (`force: true`
permite adelantarla), genera un resumen, guarda el contenido anterior como revisión y
actualiza el embedding de forma transaccional. La generación live puede validarse de
forma opt-in con `RUN_LIVE_INTEGRATION=1 RUN_LIVE_ROTATION=1`; se mantiene opt-in porque
el tiempo de inferencia de Ollama depende del hardware.

Siguiente foco: ampliar las pruebas de concurrencia y rollback y definir si la rotación
debe dispararse automáticamente al guardar o mantenerse como operación explícita.
