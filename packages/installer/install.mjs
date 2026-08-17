#!/usr/bin/env node
/**
 * install.mjs — Instalador universal de team-memory
 *
 * Detecta qué herramientas de IA están instaladas (Claude Code, Copilot CLI,
 * VS Code/Copilot, Cursor, OpenCode) y registra el servidor MCP team-memory de forma
 * GLOBAL en cada una, además de instalar el protocolo de uso (instrucciones
 * siempre-activas + skill detallado) — todo de forma idempotente y segura.
 *
 * Uso:
 *   node install.mjs                                        (usa defaultUrl de config o TEAM_MEMORY_URL)
 *   node install.mjs --url http://IP-SERVIDOR:3100/mcp      (override explícito)
 *   TEAM_MEMORY_URL=http://IP:3100/mcp node install.mjs     (variable de entorno)
 *   node install.mjs --invite inv-abc123                    (registro con invite token)
 *   node install.mjs --token sk-writer-abc123               (dispositivo extra / token existente)
 *   node install.mjs --dry-run
 *   node install.mjs --yes
 *   node install.mjs --uninstall
 */

import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
const SERVER_NAME = "team-memory";

// ── Argumentos ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag) {
  // --flag=value
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  // --flag value
  const i = args.indexOf(flag);
  return i >= 0 ? (args[i + 1] ?? null) : null;
}

const URL_ARG = getArg("--url");
const DRY_RUN = args.includes("--dry-run");
const ASSUME_YES = args.includes("--yes");
const UNINSTALL = args.includes("--uninstall");
const ONLY = getArg("--only"); // ej: claude,vscode,copilot-cli,cursor,opencode
const INVITE_TOKEN = getArg("--invite");
const EXISTING_TOKEN = getArg("--token");
const TRANSPORT_ARG =
  args.find((a) => a.startsWith("--transport="))?.split("=")[1] ?? "http";
const IS_STDIO = TRANSPORT_ARG === "stdio";

if (!["http", "stdio"].includes(TRANSPORT_ARG)) {
  console.error(
    `Transporte desconocido: "${TRANSPORT_ARG}". Valores válidos: http, stdio`,
  );
  process.exit(1);
}

// ── Resolución de URL ─────────────────────────────────────────────────────────

function resolveServerUrl() {
  if (URL_ARG) return { url: URL_ARG, source: "--url" };

  const configPath = join(__dirname, "team-memory.config.json");
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      if (config.defaultUrl) {
        return { url: config.defaultUrl, source: "team-memory.config.json" };
      }
    } catch {
      warn(`No se pudo leer ${configPath} — ignorando defaultUrl.`);
    }
  }

  if (process.env.TEAM_MEMORY_URL) {
    return { url: process.env.TEAM_MEMORY_URL, source: "TEAM_MEMORY_URL" };
  }

  return { url: null, source: null };
}

// ── Output helpers ────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};
const ok = (m) => console.log(`${c.green}✓${c.reset} ${m}`);
const skip = (m) => console.log(`${c.gray}–${c.reset} ${m}`);
const warn = (m) => console.log(`${c.yellow}⚠${c.reset} ${m}`);
const err = (m) => console.log(`${c.red}✗${c.reset} ${m}`);
const head = (m) => console.log(`\n${c.bold}${c.cyan}${m}${c.reset}`);
const info = (m) => console.log(`${c.gray}  ${m}${c.reset}`);

async function confirm(question) {
  if (ASSUME_YES) return true;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise((res) =>
    rl.question(`${question} [y/N] `, res),
  );
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function promptLine(question, defaultVal = "") {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const hint = defaultVal ? ` ${c.gray}[${defaultVal}]${c.reset}` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${hint}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal);
    });
  });
}

// ── Detección de herramientas instaladas ──────────────────────────────────────

function commandExists(cmd) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [cmd], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function resolveWin32Command(cmd) {
  if (process.platform !== "win32") return cmd;
  try {
    const resolved = execFileSync("where", [cmd], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split(/\r?\n/)[0];
    return resolved || cmd;
  } catch {
    return cmd;
  }
}

function detectTools() {
  const filter = ONLY ? ONLY.split(",") : null;
  const want = (name) => !filter || filter.includes(name);

  return {
    claude: want("claude") && commandExists("claude"),
    vscode: want("vscode") && commandExists("code"),
    copilotCli:
      want("copilot-cli") &&
      (commandExists("copilot") || existsSync(join(HOME, ".copilot"))),
    cursor: want("cursor") && existsSync(join(HOME, ".cursor")),
    opencode:
      want("opencode") &&
      (commandExists("opencode") ||
        existsSync(join(HOME, ".config", "opencode"))),
  };
}

// ── Backup ────────────────────────────────────────────────────────────────────

function backupFile(path) {
  if (!existsSync(path)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${path}.bak-${stamp}`;
  copyFileSync(path, backupPath);
  return backupPath;
}

// ── Detección de conflictos semánticos ────────────────────────────────────────

const CONFLICT_PATTERNS = [
  {
    re: /nunca\s+(uses?|llames?)\s+(herramientas?|tools?|mcp)/i,
    msg: "Hay una instrucción que parece prohibir el uso de herramientas/MCP en general.",
  },
  {
    re: /siempre\s+ped[íi]\s+confirmaci[oó]n\s+antes\s+de\s+(buscar|usar)/i,
    msg: 'Hay una instrucción que exige confirmación antes de cada búsqueda/uso de herramientas — puede chocar con "buscar antes de responder" del protocolo.',
  },
  {
    re: /no\s+(persistas?|guard[eé]s?)\s+nada/i,
    msg: "Hay una instrucción que prohíbe persistir información — revisar si aplica también a team-memory.",
  },
  {
    re: /never\s+(use|call)\s+(tools?|mcp)/i,
    msg: "Found an instruction that appears to forbid using tools/MCP in general.",
  },
];

function scanForConflicts(content) {
  return CONFLICT_PATTERNS.filter((p) => p.re.test(content)).map((p) => p.msg);
}

// ── Inserción idempotente por marcadores ──────────────────────────────────────

const MARK_START = `<!-- ${SERVER_NAME}:start -->`;
const MARK_END = `<!-- ${SERVER_NAME}:end -->`;

function buildBlock(innerContent) {
  return `${MARK_START}\n${innerContent.trim()}\n${MARK_END}`;
}

/**
 * Inserta o reemplaza el bloque marcado en un archivo de instrucciones.
 * Nunca toca contenido fuera de los marcadores. Hace backup antes de escribir.
 * Retorna { action, diffPreview, warnings, backupPath }
 */
function upsertMarkerBlock(filePath, innerContent) {
  const block = buildBlock(innerContent);
  const exists = existsSync(filePath);
  const existingContent = exists ? readFileSync(filePath, "utf-8") : "";

  const hasMarkers =
    existingContent.includes(MARK_START) && existingContent.includes(MARK_END);
  const warnings = exists ? scanForConflicts(existingContent) : [];

  let newContent;
  let action;

  if (!exists) {
    newContent = block + "\n";
    action = "created";
  } else if (hasMarkers) {
    const re = new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`);
    newContent = existingContent.replace(re, block);
    action = newContent === existingContent ? "unchanged" : "replaced";
  } else {
    const sep = existingContent.endsWith("\n") ? "\n" : "\n\n";
    newContent = existingContent + sep + block + "\n";
    action = "appended";
  }

  if (DRY_RUN) {
    return {
      action: `${action} (dry-run, no se escribió nada)`,
      warnings,
      backupPath: null,
    };
  }

  let backupPath = null;
  if (exists && action !== "unchanged") {
    backupPath = backupFile(filePath);
  }

  if (action !== "unchanged") {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, newContent, "utf-8");
  }

  return { action, warnings, backupPath };
}

function removeMarkerBlock(filePath) {
  if (!existsSync(filePath)) return { action: "not-found" };
  const content = readFileSync(filePath, "utf-8");
  if (!content.includes(MARK_START)) return { action: "no-block" };

  if (DRY_RUN) return { action: "would-remove (dry-run)" };

  const backupPath = backupFile(filePath);
  const re = new RegExp(`\\n?${MARK_START}[\\s\\S]*?${MARK_END}\\n?`);
  const newContent = content.replace(re, "\n");
  writeFileSync(filePath, newContent, "utf-8");
  return { action: "removed", backupPath };
}

// ── Skills (archivo completo, no se mergea — overwrite directo) ─────────────

function writeSkillFile(skillDir, content) {
  if (DRY_RUN) return { action: "would-write (dry-run)" };
  mkdirSync(skillDir, { recursive: true });
  const path = join(skillDir, "SKILL.md");
  const existed = existsSync(path);
  writeFileSync(path, content, "utf-8");
  return { action: existed ? "updated" : "created", path };
}

function removeSkillFile(skillDir) {
  const path = join(skillDir, "SKILL.md");
  if (!existsSync(path)) return { action: "not-found" };
  if (DRY_RUN) return { action: "would-remove (dry-run)" };
  backupFile(path);
  writeFileSync(path, "");
  return { action: "cleared" };
}

// ── Registro de MCP server — con soporte de apiToken ─────────────────────────

function registerClaudeMcp(url, apiToken = null) {
  try {
    execFileSync("claude", ["mcp", "remove", SERVER_NAME, "-s", "user"], {
      stdio: "ignore",
    });
  } catch {
    /* no existía */
  }

  if (DRY_RUN)
    return {
      action: `would run: claude mcp add --transport http --scope user ${SERVER_NAME} ${url}${apiToken ? " (+ auth header)" : ""}`,
    };

  const addArgs = [
    "mcp",
    "add",
    "--transport",
    "http",
    SERVER_NAME,
    url,
    "--scope",
    "user",
  ];

  if (apiToken) addArgs.push("--header", `Authorization: Bearer ${apiToken}`);
  execFileSync("claude", addArgs, { stdio: "pipe" });
  return { action: "registered" };
}

function registerVscodeMcp(url, apiToken = null) {
  const payload = JSON.stringify({
    name: SERVER_NAME,
    type: "http",
    url,
    ...(apiToken ? { headers: { Authorization: `Bearer ${apiToken}` } } : {}),
  });
  if (DRY_RUN) return { action: `would run: code --add-mcp '${payload}'` };
  const codeCmd = resolveWin32Command("code");
  try {
    execFileSync(codeCmd, ["--add-mcp", payload], { stdio: "pipe" });
    return { action: "registered" };
  } catch (e) {
    if (e.code === "ENOENT") {
      return {
        action: "failed",
        error: `No se pudo ejecutar '${codeCmd}'. Verificá que VS Code esté instalado y 'code' esté en PATH.`,
      };
    }
    throw e;
  }
}

/** Merge directo de JSON para herramientas sin comando CLI de alta (Cursor, Copilot CLI) */
function mergeJsonMcpConfig(configPath, url, apiToken = null) {
  let config = { mcpServers: {} };
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
      if (!config.mcpServers) config.mcpServers = {};
    } catch {
      warn(
        `No se pudo parsear ${configPath} como JSON — se omite para no corromperlo.`,
      );
      return { action: "parse-error" };
    }
  }

  const already = !!config.mcpServers[SERVER_NAME];
  config.mcpServers[SERVER_NAME] = {
    type: "http",
    url,
    ...(apiToken ? { headers: { Authorization: `Bearer ${apiToken}` } } : {}),
  };

  if (DRY_RUN)
    return {
      action: already ? "would-update (dry-run)" : "would-add (dry-run)",
    };

  if (existsSync(configPath)) backupFile(configPath);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return { action: already ? "updated" : "added" };
}

function unregisterClaudeMcp() {
  if (DRY_RUN)
    return { action: "would run: claude mcp remove team-memory -s user" };
  try {
    execFileSync("claude", ["mcp", "remove", SERVER_NAME, "-s", "user"], {
      stdio: "pipe",
    });
    return { action: "removed" };
  } catch {
    return { action: "not-found" };
  }
}

function unregisterFromJsonConfig(configPath) {
  if (!existsSync(configPath)) return { action: "not-found" };
  if (DRY_RUN) return { action: "would-remove (dry-run)" };
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    if (config.mcpServers?.[SERVER_NAME]) {
      backupFile(configPath);
      delete config.mcpServers[SERVER_NAME];
      writeFileSync(
        configPath,
        JSON.stringify(config, null, 2) + "\n",
        "utf-8",
      );
      return { action: "removed" };
    }
    return { action: "not-registered" };
  } catch {
    return { action: "parse-error" };
  }
}

// ── Validación de conectividad y auth ─────────────────────────────────────────

async function checkServerHealth(mcpUrl) {
  try {
    const healthUrl = mcpUrl.replace(/\/mcp\/?$/, "/health");
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { ok: false, auth: false };
    const data = await res.json();
    return { ok: true, auth: data.auth === "enabled" };
  } catch {
    return { ok: false, auth: false };
  }
}

// ── Flujo de autenticación ────────────────────────────────────────────────────

async function registerWithInvite(serverUrl, inviteToken) {
  head("Registro con invite token");

  const suggestedUser = userInfo().username || "";
  const suggestedDevice = hostname();

  const username = await promptLine(
    `  ¿Cuál es tu nombre de usuario?`,
    suggestedUser,
  );
  const deviceName = await promptLine(
    `  Nombre de este dispositivo`,
    suggestedDevice,
  );
  const email = await promptLine(
    `  Tu email ${c.gray}(opcional, Enter para omitir)${c.reset}`,
    "",
  );

  if (!username) {
    err("El username es requerido.");
    process.exit(1);
  }

  try {
    const authUrl = serverUrl.replace(/\/mcp\/?$/, "/auth/register");
    const res = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invite_token: inviteToken,
        username,
        device_name: deviceName,
        ...(email ? { email } : {}),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      err(`Error al registrarse: ${data.error ?? res.statusText}`);
      process.exit(1);
    }

    ok(
      `Registrado como ${c.bold}${data.user.username}${c.reset} (rol: ${c.cyan}${data.user.role}${c.reset})`,
    );
    return data;
  } catch (e) {
    err(`Error de conexión al registrarse: ${e.message}`);
    process.exit(1);
  }
}

async function registerWithToken(serverUrl, existingToken) {
  try {
    const meUrl = serverUrl.replace(/\/mcp\/?$/, "/auth/me");
    const res = await fetch(meUrl, {
      headers: { Authorization: `Bearer ${existingToken}` },
    });
    if (!res.ok) {
      err("El token proporcionado no es válido o está revocado.");
      process.exit(1);
    }
    const data = await res.json();
    ok(
      `Token verificado — usuario: ${c.bold}${data.user.username}${c.reset} (rol: ${c.cyan}${data.user.role}${c.reset})`,
    );
    return { token: existingToken, user: data.user };
  } catch (e) {
    err(`Error verificando el token: ${e.message}`);
    process.exit(1);
  }
}

function displayTokenBanner(token) {
  const PAD = 58;
  const line = (content) => `${c.yellow}║${c.reset}  ${content}`;
  const blank = `${c.yellow}║${c.reset}${" ".repeat(PAD + 2)}${c.yellow}║${c.reset}`;

  console.log("");
  console.log(`${c.yellow}╔${"═".repeat(PAD)}╗${c.reset}`);
  console.log(
    `${c.yellow}║${c.reset}  ${c.bold}🔑 TU API KEY PERSONAL${c.reset}${" ".repeat(PAD - 22)}${c.yellow}║${c.reset}`,
  );
  console.log(blank);
  console.log(line(`${c.bold}${c.cyan}${token}${c.reset}`));
  console.log(blank);
  console.log(
    line(`${c.yellow}⚠  Guardá este token en un lugar seguro.${c.reset}`),
  );
  console.log(
    line(`${c.gray}   Si cambiás de máquina y no lo tenés,${c.reset}`),
  );
  console.log(
    line(`${c.gray}   necesitarás pedirle uno nuevo al admin.${c.reset}`),
  );
  console.log(blank);
  console.log(
    line(`${c.gray}Este mensaje no se va a volver a mostrar.${c.reset}`),
  );
  console.log(blank);
  console.log(line(`${c.gray}Para instalar en otro dispositivo:${c.reset}`));
  console.log(
    line(
      `${c.gray}npx github:tu-org/team-memory install --token ${token.slice(0, 24)}...${c.reset}`,
    ),
  );
  console.log(`${c.yellow}╚${"═".repeat(PAD)}╝${c.reset}`);
  console.log("");
}

// ── Protocolo ────────────────────────────────────────────────────────────────

const protocolShort = readFileSync(
  join(__dirname, "protocol-short.md"),
  "utf-8",
);
const protocolSkill = readFileSync(
  join(__dirname, "protocol-skill.md"),
  "utf-8",
);

// ── Instaladores por herramienta ──────────────────────────────────────────────

function reportFileResult(label, path, res) {
  if (res.action === "unchanged") {
    skip(`${label} → sin cambios (ya estaba actualizado)`);
  } else {
    ok(
      `${label} → ${res.action}${res.backupPath ? ` (backup: ${res.backupPath})` : ""}`,
    );
  }
  for (const w of res.warnings ?? []) {
    warn(`  Posible tensión detectada en ${path}: ${w}`);
  }
}

async function installClaude(url, apiToken = null) {
  head("Claude Code");

  const mcp = registerClaudeMcp(url, apiToken);
  ok(`MCP server (scope: user/global) → ${mcp.action}`);

  const claudeMdPath = join(HOME, ".claude", "CLAUDE.md");
  const res = upsertMarkerBlock(claudeMdPath, protocolShort);
  reportFileResult(
    "CLAUDE.md (instrucciones siempre activas)",
    claudeMdPath,
    res,
  );

  const skillRes = writeSkillFile(
    join(HOME, ".claude", "skills", SERVER_NAME),
    protocolSkill,
  );
  ok(`Skill ${SERVER_NAME} → ${skillRes.action}`);
}

async function installVscode(url, apiToken = null) {
  head("VS Code (GitHub Copilot)");

  const mcp = registerVscodeMcp(url, apiToken);
  if (mcp.action === "failed") {
    warn(`VS Code MCP → ${mcp.error}`);
    warn(
      "Omitiendo configuración de VS Code. Registrá el servidor MCP manualmente.",
    );
    return;
  }
  ok(`MCP server (perfil global) → ${mcp.action}`);

  skip(
    "Instrucciones siempre-activas: usa el skill global de Copilot (instalado abajo)",
  );
}

async function installCopilotCli(url, apiToken = null) {
  head("GitHub Copilot CLI");

  const mcpConfigPath = join(HOME, ".copilot", "mcp-config.json");
  const mcp = mergeJsonMcpConfig(mcpConfigPath, url, apiToken);
  ok(`MCP server (~/.copilot/mcp-config.json) → ${mcp.action}`);

  const instructionsPath = join(HOME, ".copilot", "copilot-instructions.md");
  const res = upsertMarkerBlock(instructionsPath, protocolShort);
  reportFileResult("copilot-instructions.md (global)", instructionsPath, res);

  const skillRes = writeSkillFile(
    join(HOME, ".copilot", "skills", SERVER_NAME),
    protocolSkill,
  );
  ok(
    `Skill ${SERVER_NAME} (~/.copilot/skills, portable a VS Code) → ${skillRes.action}`,
  );
}

async function installCursor(url, apiToken = null) {
  head("Cursor");

  const mcpConfigPath = join(HOME, ".cursor", "mcp.json");
  const mcp = mergeJsonMcpConfig(mcpConfigPath, url, apiToken);
  ok(`MCP server (~/.cursor/mcp.json, global) → ${mcp.action}`);

  warn(
    'Cursor no permite escribir las "User Rules" globales desde archivo — paso manual requerido:',
  );
  info("1. Abrí Cursor → Settings → Rules");
  info('2. Pegá esto en "User Rules":');
  console.log(`${c.dim}${"-".repeat(60)}${c.reset}`);
  console.log(protocolShort.split("\n").slice(0, 8).join("\n") + "\n  ...");
  console.log(`${c.dim}${"-".repeat(60)}${c.reset}`);
  info(
    `Protocolo completo disponible en: ${join(__dirname, "protocol-skill.md")}`,
  );
}

// ── OpenCode ──────────────────────────────────────────────────────────────────

function registerOpencodeMcp(url, apiToken = null) {
  const configPath = join(HOME, ".config", "opencode", "opencode.json");

  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      warn(`No se pudo parsear ${configPath} — se omite el registro MCP.`);
      return { action: "parse-error" };
    }
  }

  if (!config.mcp) config.mcp = {};
  const already = !!config.mcp[SERVER_NAME];
  config.mcp[SERVER_NAME] = {
    type: "remote",
    url,
    enabled: true,
    ...(apiToken ? { headers: { Authorization: `Bearer ${apiToken}` } } : {}),
  };

  if (DRY_RUN)
    return {
      action: already ? "would-update (dry-run)" : "would-add (dry-run)",
    };

  if (existsSync(configPath)) backupFile(configPath);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return { action: already ? "updated" : "added" };
}

function addOpencodeInstructions(protocolPath) {
  const configPath = join(HOME, ".config", "opencode", "opencode.json");

  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      warn(
        `No se pudo parsear ${configPath} — se omite la sección instructions.`,
      );
      return { action: "parse-error" };
    }
  }

  const existing = Array.isArray(config.instructions)
    ? config.instructions
    : [];
  if (existing.includes(protocolPath)) return { action: "unchanged" };

  const updated = { ...config, instructions: [...existing, protocolPath] };
  if (DRY_RUN)
    return { action: `would add "${protocolPath}" to instructions (dry-run)` };

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
  return {
    action: existing.length
      ? "appended to existing instructions"
      : "added instructions field",
  };
}

function removeOpencodeInstructions(protocolPath) {
  const configPath = join(HOME, ".config", "opencode", "opencode.json");
  if (!existsSync(configPath)) return { action: "not-found" };
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const existing = Array.isArray(config.instructions)
      ? config.instructions
      : [];
    if (!existing.includes(protocolPath)) return { action: "not-registered" };
    if (DRY_RUN) return { action: "would-remove (dry-run)" };
    backupFile(configPath);
    config.instructions = existing.filter((p) => p !== protocolPath);
    if (config.instructions.length === 0) delete config.instructions;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    return { action: "removed" };
  } catch {
    return { action: "parse-error" };
  }
}

async function installOpenCode(url, apiToken = null) {
  head("OpenCode");

  const mcp = registerOpencodeMcp(url, apiToken);
  ok(
    `MCP server (~/.config/opencode/opencode.json, type: remote) → ${mcp.action}`,
  );

  const protocolDir = join(HOME, ".config", "opencode");
  const protocolPath = join(protocolDir, "team-memory-protocol.md");

  if (DRY_RUN) {
    ok(`Protocolo → would write ${protocolPath} (dry-run)`);
  } else {
    mkdirSync(protocolDir, { recursive: true });
    const existed = existsSync(protocolPath);
    writeFileSync(protocolPath, protocolShort, "utf-8");
    ok(`Protocolo → ${existed ? "updated" : "created"}: ${protocolPath}`);
  }

  const instrRes = addOpencodeInstructions(protocolPath);
  ok(`instructions[] → ${instrRes.action}`);

  if (instrRes.action !== "unchanged") {
    info(
      "OpenCode fusiona configs — las instrucciones existentes se preservan.",
    );
  }
}

// ── Desinstalación ────────────────────────────────────────────────────────────

async function uninstallAll(tools) {
  head("Desinstalando team-memory");

  if (tools.claude) {
    const r = unregisterClaudeMcp();
    ok(`Claude Code MCP → ${r.action}`);
    const fileRes = removeMarkerBlock(join(HOME, ".claude", "CLAUDE.md"));
    ok(`CLAUDE.md → ${fileRes.action}`);
    removeSkillFile(join(HOME, ".claude", "skills", SERVER_NAME));
  }

  if (tools.vscode) {
    info(
      'VS Code: remové el servidor manualmente con "MCP: List Servers" → Remove (no hay flag CLI estable de remoción)',
    );
  }

  if (tools.copilotCli) {
    const r = unregisterFromJsonConfig(
      join(HOME, ".copilot", "mcp-config.json"),
    );
    ok(`Copilot CLI MCP → ${r.action}`);
    const fileRes = removeMarkerBlock(
      join(HOME, ".copilot", "copilot-instructions.md"),
    );
    ok(`copilot-instructions.md → ${fileRes.action}`);
    removeSkillFile(join(HOME, ".copilot", "skills", SERVER_NAME));
  }

  if (tools.cursor) {
    const r = unregisterFromJsonConfig(join(HOME, ".cursor", "mcp.json"));
    ok(`Cursor MCP → ${r.action}`);
    warn(
      "Cursor: remové manualmente el bloque de team-memory de Settings → Rules → User Rules",
    );
  }

  if (tools.opencode) {
    const configPath = join(HOME, ".config", "opencode", "opencode.json");
    const protocolPath = join(
      HOME,
      ".config",
      "opencode",
      "team-memory-protocol.md",
    );

    let mcpAction = "not-found";
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        if (config.mcp?.[SERVER_NAME]) {
          if (!DRY_RUN) {
            backupFile(configPath);
            delete config.mcp[SERVER_NAME];
            writeFileSync(
              configPath,
              JSON.stringify(config, null, 2) + "\n",
              "utf-8",
            );
          }
          mcpAction = DRY_RUN ? "would-remove (dry-run)" : "removed";
        } else {
          mcpAction = "not-registered";
        }
      } catch {
        mcpAction = "parse-error";
      }
    }
    ok(`OpenCode MCP → ${mcpAction}`);

    const instr = removeOpencodeInstructions(protocolPath);
    ok(`OpenCode instructions[] → ${instr.action}`);
    if (!DRY_RUN && existsSync(protocolPath)) {
      backupFile(protocolPath);
      writeFileSync(protocolPath, "", "utf-8");
      ok(`team-memory-protocol.md → cleared`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `${c.bold}╔══════════════════════════════════════════╗${c.reset}`,
  );
  console.log(
    `${c.bold}║   team-memory — Universal Installer      ║${c.reset}`,
  );
  console.log(
    `${c.bold}╚══════════════════════════════════════════╝${c.reset}`,
  );
  if (DRY_RUN)
    console.log(
      `${c.yellow}Modo dry-run — no se escribirá ningún archivo${c.reset}`,
    );

  const tools = detectTools();
  const detected = Object.entries(tools)
    .filter(([, v]) => v)
    .map(([k]) => k);

  if (detected.length === 0) {
    err(
      "No se detectó ninguna herramienta soportada (Claude Code, VS Code, Copilot CLI, Cursor, OpenCode).",
    );
    process.exit(1);
  }

  console.log(`\nDetectado: ${detected.join(", ")}`);

  // ── Desinstalación ──────────────────────────────────────────────────────────
  if (UNINSTALL) {
    const proceed = await confirm(
      "\n¿Confirmás la desinstalación de team-memory en las herramientas detectadas?",
    );
    if (!proceed) {
      console.log("Cancelado.");
      return;
    }
    await uninstallAll(tools);
    console.log(`\n${c.green}Desinstalación completa.${c.reset}`);
    return;
  }

  // ── Advertencia stdio ───────────────────────────────────────────────────────
  if (IS_STDIO) {
    console.log("");
    warn("Estás usando --transport=stdio.");
    warn(
      "Este modo está pensado para quien administra el servidor team-memory,",
    );
    warn("no para devs del equipo que consumen la memoria compartida.");
    warn(
      "En modo stdio el cliente necesita las credenciales del servidor (DB, Ollama).",
    );
    warn("Para uso en equipo usá el modo http (default) — las credenciales");
    warn("quedan en el servidor y el dev solo necesita la URL.");
    console.log("");
    const proceed = await confirm("¿Confirmás que querés continuar con stdio?");
    if (!proceed) {
      console.log(
        `\nAlternativa: npx github:tu-org/team-memory install --url http://IP:3100/mcp`,
      );
      return;
    }
  }

  // ── Resolver URL ────────────────────────────────────────────────────────────
  const { url: SERVER_URL, source: urlSource } = resolveServerUrl();

  if (!SERVER_URL) {
    err("No se encontró la URL del servidor. Tres formas de proveerla:");
    info(
      "1. Flag explícito:      npx github:tu-org/team-memory install --url http://IP:3100/mcp",
    );
    info(
      '2. Config del repo:     editar team-memory.config.json → "defaultUrl"',
    );
    info(
      "3. Variable de entorno: TEAM_MEMORY_URL=http://IP:3100/mcp npx github:tu-org/team-memory install",
    );
    process.exit(1);
  }
  if (urlSource === "team-memory.config.json")
    info(`Usando URL por defecto del repo (${urlSource}): ${SERVER_URL}`);
  if (urlSource === "TEAM_MEMORY_URL")
    info(`Usando URL de variable de entorno (TEAM_MEMORY_URL): ${SERVER_URL}`);

  // ── Health check y detección de auth ───────────────────────────────────────
  head("Verificando conectividad con el servidor");
  const { ok: healthy, auth: authEnabled } =
    await checkServerHealth(SERVER_URL);

  if (healthy) {
    ok(`Servidor respondiendo en ${SERVER_URL}`);
    if (authEnabled) {
      ok(`Autenticación habilitada en el servidor`);
    } else {
      info(`Servidor sin autenticación (AUTH_ENABLED=false)`);
    }
  } else {
    warn(
      `No se pudo verificar /health en ${SERVER_URL} — ¿estás conectado a la VPN/red interna?`,
    );
    const proceed = await confirm("¿Continuar igual con la instalación?");
    if (!proceed) {
      console.log("Cancelado.");
      return;
    }
  }

  // ── Flujo de autenticación ──────────────────────────────────────────────────
  let apiToken = null;

  if (authEnabled) {
    if (EXISTING_TOKEN) {
      // Dispositivo extra — el usuario ya tiene un token
      head("Verificando token existente");
      const result = await registerWithToken(SERVER_URL, EXISTING_TOKEN);
      apiToken = result.token;
    } else if (INVITE_TOKEN) {
      // Registro nuevo con invite token
      const result = await registerWithInvite(SERVER_URL, INVITE_TOKEN);
      apiToken = result.token;
      displayTokenBanner(result.token);
    } else {
      err(
        "El servidor requiere autenticación. Necesitás un invite o un token.",
      );
      info(
        "Si es tu primera vez:  npx github:tu-org/team-memory install --invite inv-abc123",
      );
      info(
        "Si ya tenés un token:  npx github:tu-org/team-memory install --token sk-writer-abc123",
      );
      process.exit(1);
    }
  }

  // ── Confirmación e instalación ──────────────────────────────────────────────
  if (!DRY_RUN) {
    const proceed = await confirm(
      `\nSe va a registrar el MCP "${SERVER_NAME}" (${SERVER_URL}) y modificar archivos de configuración global ` +
        `(con backup automático) en: ${detected.join(", ")}. ¿Continuar?`,
    );
    if (!proceed) {
      console.log("Cancelado.");
      return;
    }
  }

  if (tools.claude) await installClaude(SERVER_URL, apiToken);
  if (tools.vscode) await installVscode(SERVER_URL, apiToken);
  if (tools.copilotCli) await installCopilotCli(SERVER_URL, apiToken);
  if (tools.cursor) await installCursor(SERVER_URL, apiToken);
  if (tools.opencode) await installOpenCode(SERVER_URL, apiToken);

  console.log(`\n${c.bold}${c.green}✅ Instalación completa${c.reset}`);
  console.log(
    `${c.gray}Iniciá una nueva sesión en cualquiera de las herramientas detectadas para que tome efecto.${c.reset}`,
  );
  if (DRY_RUN)
    console.log(
      `${c.yellow}Esto fue un dry-run — corré sin --dry-run para aplicar los cambios.${c.reset}`,
    );
}

main().catch((e) => {
  err(`Error fatal: ${e.message}`);
  process.exit(1);
});
