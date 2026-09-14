# Arquitectura actual

Última verificación: 2026-09-13.

## Propósito

Team Memory mantiene conocimiento curado y compartido para agentes y personas. La
unidad de recuperación es una entrada tipada de memoria, no un fragmento arbitrario
de documento.

## Flujo principal

```text
Agente MCP / TUI
       |
       | stdio o Streamable HTTP
       v
Servidor MCP ---- rutas HTTP de identidad
       |
       +---- tools de memoria
       |        |
       |        +---- PostgreSQL + pgvector + FTS
       |        +---- Ollama embeddings
       |        +---- Ollama generación de resúmenes
       |
       +---- métricas y registro de accesos

Instalador ---- configura clientes MCP + protocolo de uso
```

## Componentes y dependencias

| Componente | Responsabilidad | Dependencias directas |
|---|---|---|
| Servidor MCP | Exponer tools y transportes | MCP SDK, Express |
| Tools | Casos de uso de memoria | PostgreSQL, embeddings, tipos |
| Recuperación | Vector + FTS + RRF | pgvector, Ollama |
| Persistencia | Fuente de verdad y auditoría | PostgreSQL |
| Identidad | Usuarios, tokens y roles | Express, PostgreSQL |
| TUI | Administración y consulta interactiva | Endpoint HTTP MCP y `/auth` |
| Instalador | Onboarding y configuración de clientes | CLI y filesystem del usuario |

## Invariantes deseados

- Una entrada pertenece a un proyecto, área y tipo válidos.
- Las búsquedas normales solo devuelven entradas activas.
- Las entradas archivadas por compactación conservan el vínculo al resumen.
- Una operación autorizada debe quedar atribuida a una identidad verificada.
- Los contratos MCP deben ser consumibles de la misma forma por la TUI y agentes.
- Ninguna compactación real debe ejecutarse sin previsualización y confirmación.

## Estado y riesgos conocidos

- La identidad autenticada no llega al contexto de ejecución de las tools.
- El ranking no tiene umbral de relevancia ni corpus de evaluación.
- Los límites de tamaño, timeouts y fallos parciales requieren una política común.
- El servidor y la TUI ya comparten un contrato de edición mínimo; aún duplican tipos
  y conviene extraer un módulo de contratos común.

Docker, CI/CD y producción conservan deuda conocida, pero quedan fuera de la ruta
crítica inmediata salvo que bloqueen la verificación local.
