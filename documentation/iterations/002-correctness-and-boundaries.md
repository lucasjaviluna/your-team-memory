# Iteración 002 — Correctitud y límites

Fecha: 2026-09-14
Estado: en curso

## Objetivo

Reducir fallos previsibles del núcleo mediante límites explícitos, timeouts y
operaciones de persistencia más seguras.

## Cambios realizados en esta sesión

- Se definieron límites compartidos para slug, query, título, contenido, autor y tags.
- Los schemas de `save_memory`, `update_memory` y `search_memory` aplican esos límites
  y normalizan campos textuales.
- Las llamadas a Ollama usan timeout configurable mediante `OLLAMA_TIMEOUT_MS` y
  validan vectores/respuestas no vacíos.
- `logAccess` ya no puede fallar antes del bloque de rollback/finally si el pool no
  consigue conexión.
- `delete_memory` ejecuta eliminación de log y entrada dentro de una transacción.
- `get_context` informa `total_entries` como total real de entradas activas del proyecto.
- La compactación rechaza prompts que superen el límite configurado, evitando truncado
  silencioso de conocimiento.
- PostgreSQL usa `DB_STATEMENT_TIMEOUT_MS` (15 segundos por defecto) para evitar queries
  colgadas indefinidamente.
- La creación concurrente del mismo proyecto recupera el registro ganador tras una
  colisión de slug único.
- La compactación real serializa por proyecto con advisory lock, genera los artefactos
  secuencialmente y confirma la inserción de SUMMARYs y archivado de fuentes en una
  única transacción; un conflicto de filas cancela el lote completo.
- Se añadieron tres pruebas ejecutables de schemas y límites con `node:test`/`tsx`.

## Verificación

- `npm run test:server` → 3 tests correctos.
- `npm run build` → correcto.

## Pendiente de Iteración 002

- Revisar carreras de deduplicación.
- Unificar errores de dominio y protocolo.
- Añadir pruebas de integración con PostgreSQL y mocks de Ollama.
- Revisar límites de prompts de compactación y política de truncado.
