# team-memory — Instalador universal

Un solo comando que registra el servidor `team-memory` MCP **globalmente** (no por proyecto) en cada herramienta de IA detectada en la máquina del dev, e instala el protocolo de uso correspondiente. Después de correrlo una vez, cualquier sesión de IA en cualquier repo tiene acceso a la memoria del equipo — sin tocar configs por proyecto ni escribir agentes custom.

## Uso

Sin clonar el repo — vía `npx` directo desde GitHub:

```bash
# Instalación normal — usa la URL configurada en team-memory.config.json
npx github:tu-org/team-memory install

# Apuntar a otro servidor distinto del default (ej. staging)
npx github:tu-org/team-memory install --url http://IP-SERVIDOR:3100/mcp

# Ver qué se haría sin escribir nada
npx github:tu-org/team-memory install --dry-run

# Sin preguntas de confirmación (para scripts de onboarding automatizado)
npx github:tu-org/team-memory install --yes

# Limitar a herramientas específicas
npx github:tu-org/team-memory install --only=claude,vscode

# Desinstalar todo
npx github:tu-org/team-memory uninstall

# Ayuda
npx github:tu-org/team-memory help
```

O clonando el repo y corriendo el script directo (equivalente, sin pasar por `npx`):

```bash
node scripts/install/install.mjs
```

Requiere Node.js 22+ (usa `fetch` y `AbortSignal.timeout` nativos). El instalador en sí no tiene dependencias externas — `cli.mjs` es un wrapper delgado que delega a `install.mjs` como proceso hijo.

## URL del servidor

La resolución sigue este orden:

1. **`--url` explícito** — siempre tiene prioridad
2. **`team-memory.config.json`** (`defaultUrl`) — se usa si no se pasó `--url`
3. **Ninguno de los dos** — error pidiendo que se especifique uno

Al configurar el repo para la organización, editar `scripts/install/team-memory.config.json` con la IP/hostname real del servidor interno:

```json
{
  "defaultUrl": "http://10.0.0.5:3100/mcp"
}
```

Así el comando que corre cada dev queda reducido a `npx github:tu-org/team-memory install`, sin tener que conocer ni pasar la URL del servidor.

---

## Qué hace en cada herramienta

| Herramienta | Detección | Registro MCP | Instrucciones siempre-activas | Skill detallado |
|---|---|---|---|---|
| **Claude Code** | `which claude` | `claude mcp add --transport http --scope user` | `~/.claude/CLAUDE.md` | `~/.claude/skills/team-memory/SKILL.md` |
| **VS Code + Copilot** | `which code` | `code --add-mcp '<json>'` | usa el skill de Copilot CLI (portable) | — |
| **Copilot CLI** | `which copilot` o `~/.copilot/` | `~/.copilot/mcp-config.json` | `~/.copilot/copilot-instructions.md` | `~/.copilot/skills/team-memory/SKILL.md` |
| **Cursor** | `~/.cursor/` | `~/.cursor/mcp.json` | ⚠️ manual (ver abajo) | referencia impresa en consola |

Todo a **nivel global del usuario** — no requiere tocar nada por repositorio. El dev instala una vez y queda disponible en todos sus proyectos.

---

## Seguridad de las escrituras

- **Backup automático** antes de modificar cualquier archivo existente (`archivo.bak-<timestamp>`)
- **Inserción por marcadores** (`<!-- team-memory:start/end -->`) — nunca toca contenido fuera de esos límites, nunca duplica si se corre más de una vez
- **`--dry-run`** muestra exactamente qué se escribiría, sin tocar nada
- **Detección de conflictos semánticos** — si el archivo existente tiene instrucciones que podrían chocar con el protocolo (ej. "nunca uses herramientas sin confirmación"), se avisa explícitamente en la salida

---

## Limitación conocida — Cursor

Cursor no expone un archivo en disco para las "User Rules" globales — solo se configuran desde la UI (Settings → Rules). El instalador:
1. Registra el MCP server igual (`~/.cursor/mcp.json` sí es un archivo accesible)
2. Imprime el bloque de instrucciones en la terminal para copiar/pegar manualmente

Es el único paso no automatizable de todo el proceso.

---

## Arquitectura del protocolo

Dos archivos de contenido, reutilizados igual en todas las herramientas:

- **`protocol-short.md`** — ~15 líneas, va en el archivo "siempre cargado" de cada herramienta (`CLAUDE.md`, `copilot-instructions.md`). Corto a propósito: estos archivos se cargan en *cada* sesión, así que cuanto más largos, más contexto consumen siempre.
- **`protocol-skill.md`** — el protocolo completo (mapeo de tipos, criterios de clasificación, formato de contenido). Va como `SKILL.md`, que se carga solo cuando es relevante, no en cada sesión.

Si un repo ya tiene un agente de memoria custom más específico (como el migrado para Claude Code / Copilot con su propia tabla de triggers), ese agente tiene prioridad — este protocolo universal es el comportamiento base que garantiza que la memoria se use aún sin un agente dedicado.
