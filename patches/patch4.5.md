Resumen del Patch V4.5 — Autenticación completa

12 archivos · 24KB

Qué hace cada pieza

db/migrations/003_auth.sql — tres tablas: users (username, role, revoked_at), api_tokens (token, user_id, device_name, last_used), invite_tokens (token, role, expires_at, used_by). Vista active_tokens para auditoría.

middleware/auth.ts — valida el Bearer token en cada request a /mcp. Actualiza last_used en background. Verifica permisos por tool y por rol. Si AUTH_ENABLED=false pasa directo sin tocar nada.

routes/auth.ts — 11 endpoints en /auth/\*: bootstrap, register, me, tokens/device, invites (crear/listar), users (listar, generar token, cambiar rol, revocar).

tools/delete-memory.ts — nueva tool delete_memory, solo admin, con confirm: true obligatorio.

install.mjs — detecta auth en /health, maneja --invite y --token, muestra el banner de API key destacado después del registro.

TUI — index.tsx detecta auth y verifica el token al arrancar. App.tsx recibe apiToken e isAdmin. Admin.tsx pantalla completa de gestión (usuarios, invites, revocar). Dashboard.tsx muestra tecla a para admin.

# 1. Migración

docker exec -i team-memory-db psql -U $DB_USER -d $DB_NAME \
 < db/migrations/003_auth.sql

# 2. .env del servidor

AUTH_ENABLED=true
ADMIN_BOOTSTRAP_TOKEN=boot-secreto-temporal

# 3. Primer admin

curl -X POST http://localhost:3100/auth/bootstrap \
 -H "Authorization: Bearer boot-secreto-temporal" \
 -H "Content-Type: application/json" \
 -d '{"username":"lucas","device_name":"MacBook Lucas"}'

# → guarda el token que devuelve

# 4. Crear invite para el primer dev del equipo

curl -X POST http://localhost:3100/auth/invites \
 -H "Authorization: Bearer sk-admin-..." \
 -H "Content-Type: application/json" \
 -d '{"role":"writer"}'

# → inv-abc123...

# 5. El dev instala

npx github:tu-org/team-memory install --invite inv-abc123

# 6. TUI con auth

memory-tui --token sk-writer-...

# Si sos admin: aparece tecla [a] para gestionar usuarios e invites
