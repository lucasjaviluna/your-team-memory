# Roadmap de estabilización y evolución

Estado inicial: propuesta acordada el 2026-09-13.

## Principios

- Estabilizar contratos antes de ampliar superficie funcional.
- Mantener el servidor como núcleo independiente de cualquier interfaz.
- Tratar TUI/standalone como consumidor de los mismos contratos públicos.
- Medir la calidad de recuperación; no asumirla por la elección del modelo.
- Actualizar documentación y memoria como parte de cada iteración.
- Diferir Docker, pipelines y despliegue productivo mientras no bloqueen desarrollo.

## Iteración 1 — Núcleo compilable y contratos coherentes

Objetivo: disponer de una base local confiable sobre la que iterar.

- Separar el contexto de identidad propio del campo `Request.auth` del SDK MCP.
- Definir un envelope de respuesta único para todas las tools.
- Compartir tipos de contrato entre servidor y TUI o generar tipos desde schemas.
- Corregir la respuesta de `update_memory` y los demás desajustes cliente-servidor.
- Normalizar el monorepo para que servidor, TUI e instalador tengan comandos claros.
- Incorporar typecheck y pruebas unitarias mínimas de los contratos.

Criterio de salida: servidor y TUI compilan; las tools principales tienen pruebas de
contrato; una edición realizada desde la TUI conserva un `MemoryEntry` válido.

## Iteración 2 — Correctitud de casos de uso

Objetivo: garantizar consistencia de datos y errores previsibles.

- Revisar atomicidad de actualización, eliminación, acceso y compactación.
- Unificar errores de dominio y traducción a respuestas MCP/HTTP.
- Definir límites para títulos, contenido, tags, lotes y prompts.
- Agregar timeouts y cancelación a Ollama y operaciones largas.
- Corregir semántica de `get_context`, totales y filtros de área.
- Probar deduplicación, estados y compactación con PostgreSQL real.

Criterio de salida: cada tool tiene invariantes documentados y pruebas positivas,
negativas y transaccionales.

## Iteración 3 — Calidad del RAG

Objetivo: convertir relevancia y deduplicación en propiedades medibles.

- Crear un corpus pequeño de consultas esperadas en español e inglés.
- Medir recall, precision y resultados irrelevantes del vector, FTS y combinación.
- Evaluar umbral de relevancia, pesos, tags, título y configuración lingüística.
- Versionar modelo y dimensión de embeddings para permitir migraciones.
- Añadir procedencia y vigencia: archivo, URL, commit, fecha o evidencia.
- Endurecer la compactación frente a prompt injection y pérdida de hechos.

Criterio de salida: un comando local genera un reporte reproducible de calidad y
protege un conjunto de casos críticos contra regresiones.

## Iteración 4 — Identidad y trazabilidad funcional

Objetivo: que las acciones sean atribuibles sin depender de texto declarado.

- Propagar `user_id`, rol y dispositivo desde HTTP a cada tool.
- Derivar autor y access log desde la identidad verificada.
- Guardar hashes de tokens en lugar de secretos reutilizables.
- Definir auditoría mínima para mutaciones y acciones administrativas.
- Mantener un modo local explícito sin autenticación para desarrollo standalone.

Esta iteración cubre seguridad del producto; el hardening de infraestructura queda
en el backlog diferido.

## Iteración 5 — Standalone y experiencia de uso

Objetivo: que una persona pueda instalar, iniciar, diagnosticar y usar la herramienta
sin conocer su arquitectura interna.

- Definir dos perfiles: standalone local y cliente de servidor compartido.
- Unificar resolución de URL, proyecto, identidad y configuración.
- Incorporar diagnóstico de DB, modelo, versión de schema y compatibilidad.
- Mejorar estados vacíos, errores, edición, búsqueda y navegación de la TUI.
- Evaluar un empaquetado standalone solo después de estabilizar sus contratos.

Criterio de salida: onboarding local reproducible, diagnóstico accionable y recorrido
completo de crear, buscar, editar, revisar y compactar memoria.

## Evolución posterior

- Metadatos extensibles para casos organizacionales no técnicos.
- Colecciones, espacios o políticas de visibilidad por equipo.
- Importación controlada de documentos y conectores.
- Estrategias de revisión, caducidad y aprobación de conocimiento.
- API/SDK estable para interfaces adicionales.

## Backlog diferido de infraestructura

- Docker y composición de producción.
- Automatización de migraciones en despliegue.
- CI/CD y estrategia de releases.
- TLS, proxy, backups, alta disponibilidad y observabilidad productiva.

