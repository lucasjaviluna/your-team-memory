# Persistencia

Código principal: `db/migrations/` y `packages/server/src/db/`.

## Responsabilidad

PostgreSQL es la fuente de verdad para proyectos, entradas, relaciones de
compactación, identidad y accesos. pgvector aporta distancia semántica y PostgreSQL
FTS aporta coincidencia textual.

## Relaciones principales

- `projects 1 ── N memory_entries`
- `memory_entries 1 ── N memory_access_log`
- `memory_entries N ── 1 memory_entries` mediante `archived_into`
- `users 1 ── N api_tokens`
- `users 1 ── N invite_tokens` como creador y usuario receptor

## Invariantes

- Proyectos identificados por slug único.
- Tipos, áreas, estados y roles restringidos por checks.
- Borrar un proyecto elimina sus entradas; borrar una entrada elimina accesos.
- Solo la compactación debería producir estado `archived` y `archived_into`.

## Riesgos actuales

- `delete_memory` agrupa la eliminación de accesos y entrada en una transacción;
  compactación también agrupa sus escrituras en una transacción con lock por proyecto;
  carreras de deduplicación aún requieren revisión.
- Las consultas tienen `statement_timeout` configurable por `DB_STATEMENT_TIMEOUT_MS`.
- La dimensión `vector(768)` depende del modelo sin metadata de versión.
- Tokens reutilizables están almacenados en texto plano.
- No hay mecanismo interno de versión de schema consultable por la aplicación.
