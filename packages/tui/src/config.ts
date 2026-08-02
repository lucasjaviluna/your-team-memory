import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface TeamMemoryConfig {
  project_slug?: string;
  default_area?: string;
  area_map?: Record<string, string>;
}

export function resolveServerUrl(explicit?: string): string | null {
  if (explicit) return explicit;
  if (process.env.TEAM_MEMORY_URL) return process.env.TEAM_MEMORY_URL;
  const paths = [
    join(__dirname, "..", "..", "installer", "team-memory.config.json"),
    join(homedir(), ".config", "team-memory", "config.json"),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const c = JSON.parse(readFileSync(p, "utf-8"));
        if (c.defaultUrl) return c.defaultUrl;
      } catch {
        /**/
      }
    }
  }
  return null;
}

export function readTeamMemoryConfig(): TeamMemoryConfig {
  let dir = process.cwd();
  while (true) {
    const f = join(dir, "team-memory.json");
    if (existsSync(f)) {
      try {
        return JSON.parse(readFileSync(f, "utf-8"));
      } catch {
        return {};
      }
    }
    if (existsSync(join(dir, ".git"))) return {};
    const p = dirname(dir);
    if (p === dir) return {};
    dir = p;
  }
}

export function resolveProjectSlug(explicit?: string): string | null {
  if (explicit) return explicit;
  return readTeamMemoryConfig().project_slug ?? null;
}

export function parseArgs(): { url?: string; project?: string } {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const eq = args.find((a) => a.startsWith(`${flag}=`));
    if (eq) return eq.slice(flag.length + 1);
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return { url: get("--url"), project: get("--project") };
}
