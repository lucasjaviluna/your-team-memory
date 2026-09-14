# Iteración 001 — Núcleo compilable y contratos coherentes

Fecha: 2026-09-14
Estado: completa

## Objetivo

Eliminar los bloqueos inmediatos del núcleo local y alinear servidor MCP, TUI y
monorepo alrededor de contratos explícitos.

## Cambios realizados

- Se separó la identidad de Team Memory en `req.teamMemoryAuth` para no colisionar
  con el campo `auth` reservado por el SDK MCP.
- El transporte HTTP conserva una aserción de borde localizada en la llamada al SDK.
- `update_memory` ahora devuelve también la entrada actualizada.
- La TUI valida y desempaqueta `result.entry` antes de actualizar su estado.
- El root workspace incluye `packages/installer`, `packages/server` y `packages/tui`.
- Se regeneró `package-lock.json` para representar los workspaces y sus enlaces.

## Verificación

- `npm run build --prefix packages/server` → correcto.
- `npm run build` → correcto.
- `packages/tui/node_modules/.bin/tsc --noEmit -p packages/tui/tsconfig.json` → correcto.

## Fuera de alcance

No se modificaron Docker, pipelines, CI/CD ni configuración productiva. Tampoco se
implementaron todavía identidad verificada dentro de las tools, hashing de tokens,
pruebas de integración o evaluación de relevancia RAG.

## Próximo paso

Iteración 002: correctitud y atomicidad de los casos de uso, límites de entrada,
timeouts y pruebas funcionales de las tools.

