# TeamMemory Patch V4.10
## Feature: Selector interactivo de proyecto en la TUI (G)

### Archivos modificados/agregados (4)

```
packages/tui/src/screens/ProjectSelector.tsx  ← nueva pantalla
packages/tui/src/App.tsx                       ← prop project acepta null
packages/tui/src/index.tsx                     ← no sale con error si falta slug
packages/tui/src/client.ts                     ← nueva función apiListProjects
```

### Qué cambia

**Antes:** Si no había `.team-memory.json` en el directorio actual, la TUI
mostraba un error y salía.

**Ahora:** Si no se puede resolver el `project_slug`, la TUI inicia normalmente
y muestra un selector interactivo con todos los proyectos disponibles en el servidor:

```
team-memory TUI  v4

  ✓ Servidor   http://10.0.0.5:3100/mcp
  ⚠ Proyecto   no encontrado — se mostrará el selector
  ✓ Conectado  ...

┌─────────────────────────────────────────────────────┐
│ Seleccioná un proyecto  (3 disponibles)             │
└─────────────────────────────────────────────────────┘

  No encontré .team-memory.json en el directorio actual.

  ❯ ecommerce-platform              482 entradas
    admin-dashboard                 231 entradas
    mobile-app                      118 entradas

  Para no ver este selector, agregá .team-memory.json al root del repo.
```

Si el servidor no tiene proyectos todavía, muestra instrucciones para crear
el primer `.team-memory.json` o usar `--project`.

### Casos cubiertos

| Situación | Comportamiento |
|---|---|
| `.team-memory.json` con slug → como siempre | Directo al Dashboard |
| `--project=slug` → como siempre | Directo al Dashboard |
| Sin `.team-memory.json` y sin `--project` | Selector interactivo |
| Sin proyectos en el servidor | Instrucciones para empezar |

### Cómo aplicar (sobre V4.7+)

```bash
tar -xzf TeamMemoryPatchV4.10.tar.gz
cp patch-v4.10/packages/tui/src/screens/ProjectSelector.tsx packages/tui/src/screens/
cp patch-v4.10/packages/tui/src/App.tsx    packages/tui/src/App.tsx
cp patch-v4.10/packages/tui/src/index.tsx  packages/tui/src/index.tsx
cp patch-v4.10/packages/tui/src/client.ts  packages/tui/src/client.ts
```
