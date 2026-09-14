# Instalador

Código principal: `packages/installer/`.

## Responsabilidad

Detectar clientes compatibles, registrar el servidor MCP, instalar el protocolo de
memoria y asistir el onboarding mediante invite o token existente.

## Consumidores actuales

Claude Code, VS Code/Copilot, Copilot CLI, Cursor y OpenCode.

## Invariantes

- Preservar configuración previa y generar backup antes de modificarla.
- Ser idempotente cuando una integración ya está actualizada.
- No ocultar los pasos manuales exigidos por cada cliente.
- Nunca persistir o imprimir nuevamente un token más allá del flujo autorizado.

## Riesgos y evolución

- Hay copias similares bajo `scripts/install/` y `packages/installer/`; se debe definir
  una única fuente canónica.
- El instalador debe verificar compatibilidad de protocolo y versión del servidor.
- El flujo standalone necesitará instalar, diagnosticar y administrar el servicio
  local además de configurar clientes.

