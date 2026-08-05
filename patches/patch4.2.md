# TeamMemory Patch V4.2

## Cambio: script tui en root + .team-memory.json de ejemplo

### Archivos modificados/agregados (2)

```
package.json          ← nuevo script "tui"
.team-memory.json     ← archivo de ejemplo (nuevo, commitearlo)
```

### A — script tui

Permite correr la TUI directamente desde el root del repo sin
recordar la ruta completa:

```bash
npm run tui
npm run tui -- --url=http://localhost:3100/mcp
npm run tui -- --project=mi-proyecto
```

### B — .team-memory.json

Archivo de configuración del propio repo de team-memory.
Documenta las tres claves disponibles con un ejemplo real:

```json
{
  "project_slug": "team-memory",
  "default_area": "general",
  "area_map": {
    "packages/server/": "backend",
    "packages/tui/": "frontend",
    "packages/installer/": "general",
    "db/": "backend",
    ".github/": "infra"
  }
}
```

Este archivo sirve como referencia canónica para los devs
que configuran sus propios repos.

### Cómo aplicar (sobre V4 o V4.1)

```bash
tar -xzf TeamMemoryPatchV4.2.tar.gz
cp patch-v4.2/package.json        package.json
cp patch-v4.2/.team-memory.json   .team-memory.json
```
