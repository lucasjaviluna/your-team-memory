# Identidad y autorización

Código principal: `packages/server/src/middleware/auth.ts`,
`packages/server/src/routes/auth.ts` y `db/migrations/003_auth.sql`.

## Responsabilidad

Gestionar bootstrap, usuarios, invites, tokens por dispositivo, revocación y roles
`reader`, `writer` y `admin`.

## Límite actual

La autorización HTTP conoce la identidad, pero las tools no la reciben. Por eso
`author` y el registro de accesos todavía no constituyen una auditoría verificada.

## Evolución prevista

- Usar un contexto propio que no colisione con MCP SDK.
- Propagar identidad a todos los casos de uso.
- Derivar autoría y accesos desde `user_id`.
- Almacenar hash o HMAC de tokens y mostrar el secreto solo al crearlo.
- Registrar mutaciones administrativas relevantes.

La seguridad de red, TLS y hardening del despliegue pertenecen al backlog de
infraestructura diferido.

