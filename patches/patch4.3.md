# TeamMemory Patch V4.3

## Cambio: .gitignore completo + README.md actualizado

### Archivos modificados (2)

```
.gitignore    ← cobertura completa
README.md     ← reescritura completa para v4
```

### C — .gitignore

Agrega cobertura que faltaba:

- `.env.local` y `.env.prod` — explícitos (antes solo `.env`)
- `packages/*/dist/` — compilados de todos los paquetes (TUI incluida)
- `*.bak-*` — backups generados por el instalador al modificar archivos del dev
- `*.tar` y `*.tar.gz` — releases locales
- `.DS_Store`, `Thumbs.db`, `*.swp`, `.idea/` — OS y editores
- `*.log` — logs de npm y Node.js

Todos los archivos que sí deben commitearse están verificados:
`.team-memory.json`, `package.json`, `tsconfig.json`, `team-memory.config.json`, `README.md`.

### D — README.md

Reescritura completa para reflejar el estado actual (v4):

- Onboarding del dev del equipo como sección principal
- Instrucciones de `.team-memory.json` con ejemplos
- Sección completa de la TUI (install-tui, memory-tui, pantallas, npm run tui)
- Tabla de scripts de la raíz con todos los comandos
- Tabla de 7 MCP tools (antes tenía 5)
- Setup local con nota sobre MCP_TRANSPORT=http para la TUI
- Scripts de testing actualizados (seed, test-system, agent-demo con flags)
- Historial de versiones V2 → V4.3

### Cómo aplicar (sobre V4.1 o V4.2)

```bash
tar -xzf TeamMemoryPatchV4.3.tar.gz
cp patch-v4.3/.gitignore   .gitignore
cp patch-v4.3/README.md    README.md
```
