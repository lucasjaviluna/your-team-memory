# TeamMemory Patch V4.9
## Feature: Scripts de testing actualizados para auth (E + F)

### Archivos modificados (2)

```
scripts/seed.mjs         ← seed de usuarios en tablas de auth (F)
scripts/test-system.mjs  ← Test 9: auth endpoints y permisos (E)
```

---

### F — seed.mjs: usuarios de prueba en tablas de auth

**Nuevo comportamiento:**
- Si la migración 003 está aplicada (`users` tabla existe), crea 6 usuarios de prueba
  con sus respectivos tokens en las tablas `users` y `api_tokens`
- Idempotente: si el usuario ya existe, lo reutiliza; si el token ya existe, lo muestra
- El `--clean` también limpia las tablas de auth (solo los usuarios del seed)
- Muestra una tabla con usernames, roles y tokens al finalizar

**Usuarios generados:**
| Username | Rol     |
|---|---|
| lucas    | admin   |
| sofia    | writer  |
| martin   | writer  |
| ana      | writer  |
| diego    | reader  |
| carla    | writer  |

**Nuevo flag:**
- `--skip-auth` → no crear/limpiar usuarios de prueba (útil si no tenés 003 aplicado)

**Uso:**
```bash
# Con auth (default si migración 003 está aplicada)
node --env-file=.env scripts/seed.mjs --quick --clean

# Sin auth
node --env-file=.env scripts/seed.mjs --quick --clean --skip-auth
```

**Output de ejemplo:**
```
👤 Creando usuarios de prueba...

   Usuarios y tokens de prueba:
   ┌──────────────┬──────────┬──────────────────────────────────────────────────┐
   │ Username     │ Rol      │ Token                                            │
   ├──────────────┼──────────┼──────────────────────────────────────────────────┤
   │ lucas        │ admin    │ sk-admin-seed-a1b2c3...                          │
   │ sofia        │ writer   │ sk-writer-seed-d4e5f6...                         │
   └──────────────┴──────────┴──────────────────────────────────────────────────┘

   💡 Usar en test-system: --token=<token>
   💡 Usar en TUI:         memory-tui --token=<token>
```

---

### E — test-system.mjs: Test 9 de auth

**Nuevo flag:** `--auth` → ejecuta el Test 9
**Nuevo flag:** `--token=<token>` → usa ese token en los requests al servidor

**Test 9 cubre:**
1. `GET /health` — verifica que `auth: "enabled"` está activo
2. `GET /auth/me` — verifica el token pasado por `--token`
3. `POST /auth/bootstrap` — crea primer admin (si `ADMIN_BOOTSTRAP_TOKEN` está en .env)
4. `POST /auth/invites` — crear invite (requiere admin)
5. `GET /auth/invites` — listar invites activos
6. `POST /auth/register` — registrarse con el invite creado
7. Verificar que el nuevo token funciona en `/auth/me`
8. Verificar que el invite ya no funciona (un solo uso → 409)
9. Permisos por rol: `GET /auth/users` y crear invites solo para admin → 403 para writer/reader
10. Token inválido en `/mcp` → 401
11. Sin token en `/mcp` → 401

**Uso:**
```bash
# Test básico de auth (solo health check y token inválido)
node --env-file=.env scripts/test-system.mjs --auth

# Con token admin del seed (flujo completo)
node --env-file=.env scripts/test-system.mjs --auth --token=sk-admin-seed-...

# Solo test de auth
node --env-file=.env scripts/test-system.mjs --only=9 --auth --token=sk-admin-seed-...
```

---

### Cómo aplicar (sobre cualquier V4.x)

```bash
tar -xzf TeamMemoryPatchV4.9.tar.gz
cp patch-v4.9/scripts/seed.mjs        scripts/seed.mjs
cp patch-v4.9/scripts/test-system.mjs scripts/test-system.mjs
```

### Flujo recomendado para testear auth desde cero

```bash
# 1. Aplicar migración de auth
npm run db:migrate:003

# 2. Seed con usuarios
node --env-file=.env scripts/seed.mjs --quick --clean
# → copiar el token de lucas (admin)

# 3. Tests de auth con el token del admin
node --env-file=.env scripts/test-system.mjs --auth --token=sk-admin-seed-...

# 4. TUI con el token del admin
memory-tui --token=sk-admin-seed-...
```
