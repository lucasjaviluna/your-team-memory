# Documentación de Team Memory

Este directorio es la referencia técnica versionada del proyecto. La memoria MCP
complementa esta documentación con contexto operativo recuperable entre sesiones,
pero no la reemplaza.

## Mapa documental

- [Arquitectura actual](architecture/current-state.md): límites, componentes y flujos.
- [Roadmap](roadmap.md): orden propuesto de estabilización y evolución.
- [Servidor MCP](components/server-mcp.md): transporte y registro de tools.
- [Memoria y recuperación](components/memory-retrieval.md): escritura, búsqueda,
  contexto, deduplicación y compactación.
- [Persistencia](components/persistence.md): esquema PostgreSQL y transacciones.
- [Identidad y autorización](components/identity-access.md): usuarios, tokens y roles.
- [TUI y standalone](components/tui-standalone.md): cliente, configuración y evolución.
- [Instalador](components/installer.md): onboarding e integración con clientes.
- [Iteraciones](iterations/README.md): historial verificable de cambios.

## Regla de mantenimiento

Cada iteración debe identificar qué documentación impacta. La definición de terminado
incluye:

1. código y pruebas actualizados;
2. ficha de componente actualizada si cambió un contrato, flujo o invariante;
3. decisión registrada cuando exista una elección arquitectónica relevante;
4. entrada en `documentation/iterations/` con alcance, evidencia y deuda restante;
5. memoria MCP consolidada cuando se descubra conocimiento reutilizable.

Una ficha de componente debe responder: qué responsabilidad tiene, con quién se
relaciona, qué contrato expone, qué invariantes protege, cómo falla y cómo se prueba.

