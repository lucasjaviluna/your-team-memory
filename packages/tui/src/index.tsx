#!/usr/bin/env tsx
import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import { checkHealth } from "./client.js";
import { resolveServerUrl, resolveProjectSlug, parseArgs } from "./config.js";

async function main() {
  const { url: urlArg, project: projArg } = parseArgs();

  const serverUrl = resolveServerUrl(urlArg);
  if (!serverUrl) {
    console.error("\n✗ No se encontró la URL del servidor.\n");
    console.error("  memory-tui --url http://IP:3100/mcp");
    console.error("  TEAM_MEMORY_URL=http://IP:3100/mcp memory-tui\n");
    process.exit(1);
  }

  const projectSlug = resolveProjectSlug(projArg);
  if (!projectSlug) {
    console.error("\n✗ No se encontró el project_slug.\n");
    console.error("  memory-tui --project nombre-del-proyecto");
    console.error("  Agregar .team-memory.json al root del repo\n");
    process.exit(1);
  }

  const healthy = await checkHealth(serverUrl);
  if (!healthy) {
    console.error(`\n✗ El servidor no responde en ${serverUrl}`);
    console.error("  Verificá la VPN y que el servidor esté corriendo.\n");
    process.exit(1);
  }

  render(<App url={serverUrl} project={projectSlug} />, { exitOnCtrlC: true });
}

main().catch((e) => {
  console.error("✗ Error:", (e as Error).message);
  process.exit(1);
});
