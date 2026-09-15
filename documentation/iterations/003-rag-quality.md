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

- `npm run test:server` → 7 tests correctos.
- `npm run build` → correcto.

## Pendiente

- Construir corpus de consultas relevantes en español e inglés.
- Medir precision/recall y calibrar `min_score` con datos reales.
- Añadir procedencia, vigencia y versión de embeddings.
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

La integración real deja de estar bloqueada por disponibilidad de servicios. El siguiente
paso es ejecutar un smoke test del servidor contra estas instancias y convertirlo después
en una prueba de integración reproducible. La corrección del healthcheck queda registrada
como higiene local, fuera del foco prioritario de estabilización.
