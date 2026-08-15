# TeamMemory Patch V4.6
## Cambio: script db:migrate:003 en el root package.json

### Archivo modificado (1)

```
package.json
```

### Qué cambia

Se agrega el script `db:migrate:003` para aplicar la migración de auth
de forma consistente con las otras dos migraciones existentes:

```bash
npm run db:migrate:003
# equivale a:
# docker exec -i team-memory-db psql -U $DB_USER -d $DB_NAME < db/migrations/003_auth.sql
```

Los tres scripts de migración quedan alineados:

| Script | Migración |
|---|---|
| `npm run db:migrate`     | 001_init.sql (schema inicial) |
| `npm run db:migrate:002` | 002_user_tracking.sql |
| `npm run db:migrate:003` | 003_auth.sql (users, api_tokens, invite_tokens) |

### Cómo aplicar (sobre V4.5)

```bash
tar -xzf TeamMemoryPatchV4.6.tar.gz
cp patch-v4.6/package.json package.json
```
