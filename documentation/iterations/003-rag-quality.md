# Iteración 003 — Calidad medible del RAG

Fecha: 2026-09-14
Estado: en curso

## Objetivo

Hacer explícita y testeable la lógica de ranking antes de ajustar modelos o umbrales
con datos reales.

## Cambios realizados

- Se extrajo la combinación RRF a `packages/server/src/tools/ranking.ts`.
- Se añadieron `combineRrf` y `selectRankedIds` como funciones puras.
- `search_memory` acepta `min_score` opcional para suprimir resultados débiles.
- FTS usa `simple` por defecto y permite `FTS_LANGUAGE=english|spanish`.
- Deduplicación y búsqueda comparten la configuración lingüística.
- Se añadió un test que verifica que un resultado presente en ambos rankings supera a
  resultados presentes en uno solo y que el umbral filtra los últimos.

## Verificación

- `npm run test:server` → 10 tests correctos y 1 integración live omitida por defecto.
- `npm run build` → correcto.
- `RUN_LIVE_INTEGRATION=1 npm test --prefix packages/server` → 11 tests correctos
  contra PostgreSQL/pgvector y Ollama reales.
- El smoke test live también ejercita `save_memory`, `search_memory`, `get_context` y
  `update_memory` sobre un proyecto temporal, que se elimina al finalizar.

## Pendiente

- Revisar y ampliar periódicamente los `relevant_ids` del corpus en
  `documentation/evaluation/corpus-v1.json` a medida que crezca la memoria.
- Medir precision/recall y calibrar `min_score` con datos reales.
- Añadir procedencia, vigencia y versión de embeddings.

Se añadieron las métricas puras `evaluateRanking` y `averageMetrics` en
`packages/server/src/tools/evaluation.ts`, cubiertas por `evaluation.test.ts`. Esto separa
la definición de métricas de la futura ejecución live y permite validar el cálculo antes de
construir etiquetas definitivas.

El corpus fue etiquetado con IDs activos del proyecto y se incorporó
`live-evaluation.test.ts`. Primera línea base, con `limit=10` y `min_score=0`:
`precision=0.487`, `recall=1.000`, `MRR=0.813` (promedio macro sobre cuatro consultas).
La cobertura es alta, pero la precisión refleja resultados secundarios; se debe calibrar
`limit` y `min_score` antes de evaluar cambios de modelo.

### Barrido inicial (2026-09-15)

Con el corpus actual, el barrido live mostró:

- `limit=3`: precision `0.500`, recall `0.625`, MRR `0.625`.
- `limit=5`: precision `0.450`, recall `0.875`, MRR `0.675`.
- `limit=10`: precision `0.450`, recall `1.000`, MRR `0.675`.

Los umbrales altos reducen el recall: con `min_score=0.016` el recall macro cae a `0.500`
para `limit=3/5/10`, mientras que `0.015` ya lo reduce a `0.875` en `limit=10`. Por ahora
`limit=5` y `min_score=0` ofrecen el mejor compromiso práctico para no perder cobertura;
el umbral debe calibrarse con un corpus mayor y el reporte conserva cuatro decimales para
no ocultar diferencias entre `0.005`, `0.010` y `0.015`.

## Glosario y reglas de evaluación

- **Precision@k**: proporción de resultados recuperados que son relevantes dentro de los
  primeros `k`; mide ruido.
- **Recall@k**: proporción de resultados relevantes conocidos recuperados dentro de los
  primeros `k`; mide cobertura.
- **MRR** (Mean Reciprocal Rank): promedio de `1/rango` del primer resultado relevante;
  premia que aparezca temprano.
- **`limit`**: máximo de resultados devueltos; aumentarlo suele subir recall y también el
  número de resultados secundarios.
- **`min_score`**: umbral mínimo del score RRF; subirlo reduce ruido, pero puede eliminar
  evidencia relevante. No representa una probabilidad.

Regla provisional: usar `limit=5` y `min_score=0` como referencia hasta ampliar el corpus.
No cambiar el modelo por variaciones pequeñas de una sola métrica; comparar siempre
precision, recall y MRR sobre el corpus completo.

## Estado de servicios locales (2026-09-14)

La validación manual confirmó que el entorno local está disponible desde Docker Desktop
(`desktop-linux`):

- `team-memory-db` (`pgvector/pgvector:pg16`) está `healthy` y `pg_isready` acepta
  conexiones en `localhost:5432`.
- `team-memory-ollama` responde en `localhost:11434` y expone `llama3:latest` y
  `nomic-embed-text:latest`.
- Ollama figura `unhealthy` únicamente porque su healthcheck ejecuta `curl`, ausente en
  la imagen (`/bin/sh: curl: not found`); la API está operativa.

La integración real deja de estar bloqueada por disponibilidad de servicios. Se añadió
`packages/server/test/live-integration.test.ts`, opt-in mediante `RUN_LIVE_INTEGRATION=1`,
que verifica conexión a PostgreSQL, extensión pgvector, disponibilidad de Ollama, modelo
de chat, generación de embeddings y el flujo funcional de las tools principales. La
corrección del healthcheck queda registrada como higiene local, fuera del foco prioritario
de estabilización.
