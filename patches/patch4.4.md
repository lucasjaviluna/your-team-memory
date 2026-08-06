# TeamMemory Patch V4.4
## Cambio: Mensaje de bienvenida en la TUI con fuentes de resolución

### Archivos modificados (2)

```
packages/tui/src/config.ts    ← resolveServerUrl y resolveProjectSlug devuelven { value, source }
packages/tui/src/index.tsx    ← mensaje de bienvenida con fuentes y estado de conexión
```

### Qué cambia

Al iniciar `memory-tui`, en lugar de arrancar directamente la interfaz,
se muestra un resumen claro de cómo se resolvió cada parámetro:

```
team-memory TUI  v4

  ✓ Servidor   http://10.0.0.5:3100/mcp  ← team-memory.config.json
  ✓ Proyecto   ecommerce-frontend        ← .team-memory.json
  ✓ Conectado  http://10.0.0.5:3100/health
```

Fuentes posibles para la URL:
  - `--url`
  - `TEAM_MEMORY_URL`
  - `team-memory.config.json`

Fuentes posibles para el proyecto:
  - `--project`
  - `.team-memory.json`

Los mensajes de error también mejoran — muestran las tres opciones
disponibles para resolver el valor que falta.

### Cómo aplicar (sobre V4.1+)

```bash
tar -xzf TeamMemoryPatchV4.4.tar.gz
cp patch-v4.4/packages/tui/src/config.ts   packages/tui/src/config.ts
cp patch-v4.4/packages/tui/src/index.tsx   packages/tui/src/index.tsx
```
