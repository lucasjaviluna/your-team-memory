# Memoria y recuperación

Código principal: `packages/server/src/tools/` y
`packages/server/src/embeddings/ollama.ts`.

## Responsabilidad

Crear, actualizar, buscar, cargar contexto, deduplicar, medir y compactar entradas de
conocimiento.

## Flujo de búsqueda

1. generar embedding de la consulta;
2. obtener candidatos vectoriales;
3. obtener candidatos FTS;
4. fusionar rankings mediante RRF;
5. cargar entradas activas y registrar acceso.

## Flujo de escritura

1. resolver o crear proyecto;
2. detectar título exacto o candidato similar;
3. generar embedding;
4. persistir entrada.

## Decisiones vigentes

- `SUMMARY` no participa en búsqueda genérica.
- `SUMMARY` y `TASK_CONTEXT` no pasan por deduplicación normal.
- La compactación agrupa por área y tipo y archiva las fuentes.

## Riesgos actuales

- RRF expresa posición relativa, no confianza absoluta.
- FTS utiliza configuración inglesa para contenido potencialmente multilingüe.
- No existen dataset ni métricas de relevancia versionadas.
- Modelo y dimensión del embedding están implícitamente acoplados al schema.
- Contenido almacenado puede influir indebidamente en el prompt de compactación.
- La compactación real serializa por proyecto y confirma todos los grupos en una única
  transacción; si una fuente cambió de estado se aborta el lote.
- La deduplicación serializa por proyecto/área/tipo durante check, embedding e inserción;
  esto evita que dos escritores concurrentes atraviesen el check simultáneamente.
- La lógica RRF vive en `tools/ranking.ts`, tiene pruebas puras y `search_memory` expone
  `min_score` opcional. El analizador FTS se selecciona con `FTS_LANGUAGE` y por defecto
  es `simple` para no asumir un idioma único.
- El texto enviado al proveedor de embeddings se limita a `OLLAMA_EMBED_MAX_CHARS`
  (12.000 por defecto), preservando título, tags, inicio y final; el contenido persistido
  nunca se trunca.

## Pruebas necesarias

- Ranking esperado para un corpus estable.
- Consultas irrelevantes que deben devolver vacío.
- Deduplicados exactos, semánticos y falsos positivos.
- Conservación de hechos durante compactación.
- Fallos y timeouts del proveedor de embeddings.

## Límites incorporados

Los schemas de entrada limitan tamaño de query, slug, título, contenido y tags. Las
llamadas a Ollama tienen timeout configurable y validan la forma básica de la respuesta.
El texto enviado al embedding tiene un límite independiente (`OLLAMA_EMBED_MAX_CHARS`)
para evitar fallos por ventana de contexto en entradas largas.
`get_context` separa la cantidad total disponible de la cantidad retornada en la página,
y la compactación falla explícitamente si el prompt excede el máximo permitido.
