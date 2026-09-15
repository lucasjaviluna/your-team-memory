# Servidor MCP

Código principal: `packages/server/src/index.ts`.

## Responsabilidad

Registrar las tools, exponer transporte stdio o Streamable HTTP y traducir resultados
de dominio al protocolo MCP. En HTTP también monta health, rutas de identidad y el
control de permisos previo a una llamada de tool.

## Contratos e invariantes

- Cada request HTTP usa un servidor y transporte stateless.
- Los errores de tool se devuelven como contenido MCP con `isError`.
- El transporte no debe compartir el campo reservado de autenticación con el contexto
  de identidad de Team Memory.
- Todos los consumidores deben interpretar el mismo envelope de respuesta.
- Los fallos de tools se serializan mediante `src/errors.ts` con el mismo envelope
  `{ success: false, error }` y `isError: true`.

## Riesgos actuales

- La identidad propia ya está aislada en `teamMemoryAuth`, pero todavía no se inyecta
  en el contexto de ejecución de cada tool.
- Registro repetitivo de handlers; la serialización de errores ya está centralizada.
- Falta un contexto de ejecución formal que lleve identidad y datos de request a las tools.
- No hay catálogo automatizado de contratos para verificar clientes.

## Pruebas necesarias

- Registro de tools y schemas.
- Inicialización y llamada stateless por HTTP.
- Traducción uniforme de éxito y error.
- Matriz de autorización por tool y rol.
