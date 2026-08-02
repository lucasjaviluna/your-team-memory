#!/usr/bin/env node
/**
 * cli.mjs — Entry point del comando `team-memory`
 *
 * Subcomandos:
 *   install         Registra el MCP en las herramientas de IA detectadas
 *   install-tui     Instala memory-tui globalmente (requiere repo clonado)
 *   uninstall       Revierte todo lo instalado
 *   help            Muestra esta ayuda
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const installScript = join(__dirname, "install.mjs");

const [subcommand, ...rest] = process.argv.slice(2);

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
\x1b[1mteam-memory\x1b[0m — instalador universal del sistema de memoria compartida del equipo

\x1b[1mUso:\x1b[0m
  team-memory install [opciones]   Registra el MCP en las herramientas de IA detectadas
  team-memory install-tui          Instala memory-tui globalmente (requiere repo clonado)
  team-memory uninstall            Revierte todo lo instalado
  team-memory help                 Muestra esta ayuda

\x1b[1mOpciones para install:\x1b[0m
  --url <url>          URL del servidor MCP (override de config/env)
  --transport=http     (default) Servidor remoto via Streamable HTTP
  --transport=stdio    Servidor local como subproceso — solo para administradores
  --dry-run            Muestra qué se haría sin escribir nada
  --yes                Sin confirmaciones (para scripts de onboarding)
  --only=<lista>       Limita a: claude, vscode, copilot-cli, cursor, opencode

\x1b[1mResolución de URL para install (en orden):\x1b[0m
  1. --url <url>
  2. team-memory.config.json → "defaultUrl"
  3. Variable de entorno TEAM_MEMORY_URL

\x1b[33m"}⚠  --transport=stdio expone las credenciales del servidor (DB, Ollama) al cliente.
   Usar solo para desarrollo o administración del servidor, no para devs del equipo.
   Para el equipo, usar http — las credenciales quedan en el servidor.${"\x1b[0m"}

\x1b[1m"}Flags comunes:${"\x1b[0m"}
  --dry-run            Muestra qué se haría, sin escribir nada
  --yes                No pregunta confirmación (para scripts de onboarding)
  --only=<lista>        Limita a herramientas específicas: claude,vscode,copilot-cli,cursor,opencode

\x1b[1mEjemplos:\x1b[0m
  npx github:tu-org/team-memory install
  npx github:tu-org/team-memory install --url http://10.0.0.5:3100/mcp
  TEAM_MEMORY_URL=http://10.0.0.5:3100/mcp npx github:tu-org/team-memory install
  npx github:tu-org/team-memory install --dry-run
  npx github:tu-org/team-memory install --only=opencode
  npx github:tu-org/team-memory install-tui
  npx github:tu-org/team-memory uninstall --only=cursor
`);
}

// ── install-tui ───────────────────────────────────────────────────────────────

function installTui() {
  const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
    cyan: "\x1b[36m",
  };

  const tuiPkg = join(__dirname, "..", "tui", "package.json");

  console.log(`\n${c.bold}team-memory — Instalador de TUI${c.reset}\n`);

  // 1. Verificar que el paquete TUI existe (requiere repo clonado)
  if (!existsSync(tuiPkg)) {
    console.error(
      `${c.red}✗${c.reset} No se encontró packages/tui — el repo no está clonado.`,
    );
    console.error(
      `\n  Este comando requiere tener el repositorio clonado localmente.\n`,
    );
    console.error(`  ${c.bold}Cómo obtenerlo:${c.reset}`);
    console.error(
      `    ${c.gray}git clone https://github.com/tu-org/team-memory${c.reset}`,
    );
    console.error(`    ${c.gray}cd team-memory${c.reset}`);
    console.error(`    ${c.gray}npm run install-tui${c.reset}\n`);
    process.exit(1);
  }

  const tuiDir = join(__dirname, "..", "tui");

  // 2. npm install en packages/tui
  console.log(`${c.gray}[1/3] Instalando dependencias de la TUI...${c.reset}`);
  const install = spawnSync(
    "npm",
    ["install", "--prefix", tuiDir, "--silent"],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  if (install.status !== 0) {
    console.error(`\n${c.red}✗${c.reset} Error instalando dependencias`);
    process.exit(1);
  }
  console.log(`${c.green}✓${c.reset} Dependencias instaladas\n`);

  // 3. Compilar TypeScript
  console.log(`${c.gray}[2/3] Compilando TypeScript...${c.reset}`);
  const build = spawnSync(
    "npx",
    ["tsc", "--project", join(tuiDir, "tsconfig.json")],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
      cwd: tuiDir,
    },
  );
  if (build.status !== 0) {
    console.error(`\n${c.red}✗${c.reset} Error compilando TypeScript`);
    process.exit(1);
  }
  console.log(`${c.green}✓${c.reset} Compilación exitosa\n`);

  // 4. Crear script global ~/.local/bin/memory-tui
  console.log(`${c.gray}[3/3] Instalando comando memory-tui...${c.reset}`);

  const distEntry = join(tuiDir, "dist", "index.js");

  if (process.platform === "win32") {
    // Windows: mostrar instrucciones para PowerShell
    console.log(`\n${c.yellow}Windows detectado.${c.reset}`);
    console.log(`Agregá este alias a tu perfil de PowerShell ($PROFILE):\n`);
    console.log(
      `  ${c.gray}function memory-tui { node "${distEntry}" @args }${c.reset}\n`,
    );
  } else {
    // Linux / macOS: escribir script en ~/.local/bin
    const binDir = join(homedir(), ".local", "bin");
    const binPath = join(binDir, "memory-tui");

    mkdirSync(binDir, { recursive: true });
    writeFileSync(
      binPath,
      `#!/usr/bin/env node\nimport("${distEntry}").catch(e => { console.error(e.message); process.exit(1) })\n`,
      { encoding: "utf-8", mode: 0o755 },
    );

    console.log(
      `${c.green}✓${c.reset} ${c.bold}Comando instalado: ${binPath}${c.reset}\n`,
    );

    // Verificar si ~/.local/bin está en PATH
    const inPath = (process.env.PATH ?? "").split(":").includes(binDir);
    if (!inPath) {
      console.log(`${c.yellow}⚠  ${binDir} no está en tu PATH.${c.reset}`);
      console.log(`   Agregá esto a tu ~/.bashrc o ~/.zshrc:\n`);
      console.log(`   ${c.gray}export PATH="$HOME/.local/bin:$PATH"${c.reset}`);
      console.log(
        `   Luego recargá tu shell:\n   ${c.gray}source ~/.bashrc${c.reset}\n`,
      );
    } else {
      console.log(`${c.gray}Usá el comando desde cualquier repo:${c.reset}\n`);
      console.log(`  ${c.bold}${c.cyan}memory-tui${c.reset}`);
      console.log(
        `  ${c.bold}${c.cyan}memory-tui --project=mi-proyecto${c.reset}`,
      );
      console.log(
        `  ${c.bold}${c.cyan}memory-tui --url=http://IP:3100/mcp${c.reset}\n`,
      );
    }
  }
}

// ── Router de subcomandos ─────────────────────────────────────────────────────

if (subcommand === undefined) {
  printHelp();
  process.exit(0);
}

if (subcommand === "install-tui") {
  installTui();
  process.exit(0);
}

if (["help", "--help", "-h"].includes(subcommand)) {
  printHelp();
  process.exit(0);
}

// install / uninstall → delegar a install.mjs
let forwardedArgs;
if (subcommand === "install") {
  forwardedArgs = rest;
} else if (subcommand === "uninstall") {
  forwardedArgs = ["--uninstall", ...rest];
} else {
  console.error(`Subcomando desconocido: "${subcommand}"`);
  printHelp();
  process.exit(1);
}

const result = spawnSync(process.execPath, [installScript, ...forwardedArgs], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
