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

- Curar los `relevant_ids` del corpus inicial en `documentation/evaluation/corpus-v1.json`;
  la plantilla ya contiene cuatro consultas representativas, pero aún no fija IDs reales.
- Medir precision/recall y calibrar `min_score` con datos reales.
- Añadir procedencia, vigencia y versión de embeddings.

Se añadieron las métricas puras `evaluateRanking` y `averageMetrics` en
`packages/server/src/tools/evaluation.ts`, cubiertas por `evaluation.test.ts`. Esto separa
la definición de métricas de la futura ejecución live y permite validar el cálculo antes de
construir etiquetas definitivas.
- Validar resultados contra PostgreSQL/pgvector y Ollama activos.

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
