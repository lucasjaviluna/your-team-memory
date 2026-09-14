# TUI y standalone

Código principal: `packages/tui/src/`.

## Responsabilidad

Ofrecer consulta y administración interactiva sin depender de un agente. La TUI es
un cliente del contrato público MCP y de las rutas administrativas HTTP.

## Flujo actual

- Resuelve URL, proyecto y token desde flags, entorno y archivos de configuración.
- Verifica health e identidad.
- Inicializa el protocolo MCP y consume tools por HTTP.
- Expone dashboard, listado, búsqueda, detalle, compactación y administración.

## Riesgos actuales

- El contrato de `update_memory` ya devuelve la entrada actualizada y la TUI valida
  su presencia; los tipos aún están duplicados entre paquetes.
- Los tipos del cliente duplican contratos del servidor y pueden divergir.
- El concepto standalone aún no distingue formalmente servicio local y cliente remoto.

## Dirección

Definir un núcleo cliente compartido y dos perfiles explícitos:

- standalone local: dependencias locales, arranque y diagnóstico guiado;
- cliente compartido: solo URL, identidad y proyecto.
