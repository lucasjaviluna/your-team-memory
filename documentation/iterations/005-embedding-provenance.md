# Iteración 005 — Provenance de embeddings

Fecha: 2026-09-16
Estado: completada

## Objetivo

Conservar suficiente metadata para saber con qué perfil se generó cada embedding y
detectar futuras necesidades de reindexación.

## Cambios

- La migración `db/migrations/005_embedding_provenance.sql` agrega a entradas y revisiones
  `embedding_model`, `embedding_dimensions`, `embedding_version` y
  `embedding_generated_at`.
- `OLLAMA_EMBED_VERSION` permite versionar explícitamente el contrato de representación.
- Save, update, restore, rotate y compactación registran el perfil de embedding generado.
- `get_memory_revisions` expone metadata de provenance, pero nunca el vector.
- Los datos anteriores a la migración conservan metadata nula hasta una reindexación
  explícita; no se atribuye retrospectivamente un modelo o versión no verificados.

## Verificación

- Build correcto.
- Suite offline: 15 tests correctos y 2 integraciones omitidas.
- Integración live PostgreSQL/pgvector/Ollama: 1/1 correcta, incluyendo aserciones de
  modelo, dimensión, versión y fecha en entrada y revisión.

## Próximo paso

Definir una estrategia de reindexación cuando cambien modelo, dimensión o
`OLLAMA_EMBED_VERSION`, y decidir si la búsqueda debe advertir o excluir perfiles
incompatibles.
