# Iteración 000 — Línea base arquitectónica

Fecha: 2026-09-13
Estado: completa

## Objetivo

Evaluar el repositorio completo y establecer el punto de partida para su evolución.

## Alcance

Servidor MCP, tools, recuperación, persistencia, autenticación, TUI, instalador,
pruebas, empaquetado y configuración operativa.

## Decisiones

- Priorizar estabilidad y evolución del producto.
- Diferir Docker, CI/CD y producción salvo bloqueos esenciales.
- Mantener documentación viva por componente y registro por iteración.
- Usar memoria MCP para conocimiento recuperable y Markdown versionado para contratos.

## Verificación

- Inspección estática de los componentes y sus relaciones.
- Ejecución de `npm run build`.
- El build falló con `TS2345` en `packages/server/src/index.ts:440` por la colisión
  entre el campo de identidad de Express y el contrato de auth del SDK MCP.
- Se identificó una incompatibilidad entre la respuesta de `update_memory` y el tipo
  consumido por la TUI.

## Documentación impactada

Se creó la línea base completa bajo `documentation/`.

## Memoria MCP

- `43c65dbb-bc44-496d-9a57-705f3919e74a`: dictamen arquitectónico.
- `384966e3-b63d-418a-8d48-0de974317332`: decisión de prioridades.

## Próximo paso

Iniciar Iteración 001: núcleo compilable y contratos coherentes.

