# Iteración 004 — Seguridad del input de embeddings

Fecha: 2026-09-15
Estado: completada

## Problema

Los `TASK_CONTEXT` acumulativos podían superar la ventana de contexto de Ollama al
regenerar su embedding durante un update, aunque el contenido almacenado fuera válido.

## Solución

`buildEmbeddingText` aplica `OLLAMA_EMBED_MAX_CHARS` (12.000 por defecto). Para entradas
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
