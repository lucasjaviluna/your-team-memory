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
sin perder trazabilidad. El siguiente paso es exponer consulta/restauración de revisiones
y definir cuándo rotar automáticamente el contexto.
