# TeamMemory Patch V4.7
## Feature: delete_memory desde la pantalla Admin de la TUI

### Archivos modificados (3)

```
packages/tui/src/client.ts           ← setAuthToken() + apiDeleteMemory()
packages/tui/src/index.tsx           ← llama setAuthToken() antes del render
packages/tui/src/screens/Admin.tsx   ← flujo de eliminación completo
```

### Qué cambia

**client.ts:**
- Nueva función exportada `setAuthToken(token)` — configura el token globalmente
  para que todos los requests al endpoint /mcp incluyan Authorization: Bearer
- Nueva función `apiDeleteMemory(url, { entry_id, confirm: true })`

**index.tsx:**
- Llama `setAuthToken(apiToken)` después de resolver la auth, antes del render
- Garantiza que búsquedas, get_context y delete_memory usen el token correcto

**Admin.tsx — nuevo flujo "Eliminar entrada":**
1. Menú Admin → "🗑️  Eliminar entrada"
2. Pantalla de búsqueda: ingresá project-slug + query
3. Lista de resultados navegable con ↑↓
4. Confirmación explícita con preview de la entrada
5. Resultado con opción de eliminar otra o volver al menú

### Cómo aplicar (sobre V4.5+)

```bash
tar -xzf TeamMemoryPatchV4.7.tar.gz
cp patch-v4.7/packages/tui/src/client.ts           packages/tui/src/client.ts
cp patch-v4.7/packages/tui/src/index.tsx           packages/tui/src/index.tsx
cp patch-v4.7/packages/tui/src/screens/Admin.tsx   packages/tui/src/screens/Admin.tsx
```
