---
name: memory-skill
description: Instructions for managing persistent project memory via the team-memory MCP server. Covers bootstrap retrieval and consolidation persistence.
---

# Memory Skill

## Purpose

Preserve project learnings so future pipelines improve and avoid repeated mistakes.

> **Authoritative reference**: The complete trigger table, self-evaluation checklist, deduplication rules, writing format, and output contracts are defined in `.claude/agents/memory.md`. This file summarizes the key operational points and adds context for reading and writing each memory category.

## Memory categories (team-memory MCP)

Memory is no longer stored in local files. It lives in the team-memory MCP server, shared across the whole team and across projects. Each category below maps to an MCP `type` + `area` + tags, queried and written through MCP tool calls instead of file reads/writes.

| Legacy file | MCP type | area | Update when |
|---|---|---|---|
| `catalog.md` (components) | `REPOSITORY_NOTE` | `frontend` | A component is newly confirmed, corrected, has a hidden runtime requirement, or a new structural artifact is created (T1, T2, T7, T8) |
| `conventions.md` (rules) | `PATTERN` | `frontend`/`general` | A convention is NEW or INCORRECT and corrected (T3) |
| `conventions.md` (pending) | `TASK_CONTEXT` | `general` | An instruction gap is detected (T6) |
| `anti-patterns.md` | `ANTI_PATTERN` | `frontend` | A repeatable subagent mistake is identified or recurs (T4). Always note `(last observed: YYYY-MM-DD)` in content. |
| `milestones.md` | `SUMMARY` | `frontend`/`general` | A user-facing feature, new route/module, NgRx slice, or structural refactor is completed (T5). Pure bug corrections go to ANTI_PATTERN only. |

Subagent attribution (previously a header inside `anti-patterns.md`, e.g. "HTML Agent") is now a **tag** on the entry (`html-agent`, `css-agent`, `ts-agent`, `test-agent`), since MCP `area` only distinguishes frontend/backend/infra/general.

## Project identification

Resolve `project_slug` once per session following the mandatory flow defined in `memory.md` (Project Identification section). Summary:

1. Search for `.team-memory.json` climbing from current dir to repo root (`.git`)
2. **Case A** — file exists with `project_slug` → use it directly, report to dev
3. **Case B** — file exists without `project_slug` → interactive flow → update file
4. **Case C** — file doesn't exist → interactive flow → create file

Interactive flow: detect candidates (git remote, package.json name, folder name), present up to 3 options + free input, normalize to kebab-case, write to `.team-memory.json`, confirm to dev with reminder to commit the file.

Always display the active slug and its source at session start.

## Bootstrap mode

### Step 1: Load context from the MCP

- `get_context({ project_slug, area: 'frontend', limit: 20 })` — returns `priority_entries` (SUMMARY + TASK_CONTEXT first) and `entries`.
- `search_memory({ query: USER_TASK, project_slug, type, area, limit })` — one call per category (REPOSITORY_NOTE, PATTERN, ANTI_PATTERN), plus an explicit `type: 'SUMMARY'` search if feature-specific milestone history is needed beyond what `get_context` already loaded.

### Step 2: Filter by relevance

Same criteria as before, now applied to MCP search results instead of full file contents:

- **CATALOG_NOTES**: Include entries for any component selector or module name mentioned or implied in the task. Include all components related to the feature domain. When in doubt, include.
- **CONVENTIONS**: Always include SCSS `@use` rules and Angular component rules if present in the loaded context. Include other thematic results only if the task touches their domain.
- **ANTI_PATTERNS**: Include entries tagged with every subagent that will be invoked. If HTML is involved → entries tagged `html-agent`; CSS involved → `css-agent`; etc.
- **RECENT_WORK**: Include SUMMARY entries for the same feature name/tag or domain. Always include the 2 most recent SUMMARY entries for structural consistency context.

### Step 3: Return structured output

Use the Memory agent output contract from `memory.md` (Mode 1: Bootstrap). Keep it concise but sufficient.

## Consolidation mode

### Step 1: Parse pipeline context

Required fields (if missing, evaluate conservatively from `PIPELINE_OUTPUTS` and note the gap):
- `USER_TASK`
- `PIPELINE_OUTPUTS`
- `FIXED_ERRORS` (use "none" if no errors)
- `USED_COMPONENTS` (use "none" if no catalog components used)

Optional:
- `COMPLETED_FEATURE`

### Step 2: Evaluate triggers

See the full trigger table in `memory.md`. Summary (conditions unchanged from the legacy system; only the action target changed):

- **T1**: New catalog component used → `save_memory` as `REPOSITORY_NOTE`
- **T2**: Component misuse corrected → `update_memory` on the existing `REPOSITORY_NOTE` + evaluate T4 for `ANTI_PATTERN`
- **T3**: Convention is NEW or was INCORRECT and corrected → `save_memory`/`update_memory` as `PATTERN`
- **T4**: Subagent produced incorrect output → `save_memory` as `ANTI_PATTERN` (new) or `update_memory` appending `(last observed: date)` (recurrence)
- **T5**: User-facing feature/route/module/NgRx slice/structural refactor completed → `save_memory` as `SUMMARY`
- **T6**: Instruction gap detected → `save_memory` as `TASK_CONTEXT` tagged `instruction-gap`
- **T7**: Runtime error reveals hidden component requirement → `update_memory` appending a ⚠️ warning to the `REPOSITORY_NOTE`
- **T8**: New service/model/NgRx slice/standalone module created → `save_memory` as `REPOSITORY_NOTE` tagged `structure`

### Step 3: Persist via MCP

- The server runs automatic duplicate detection inside `save_memory` — no manual `search_memory` pre-check needed
- If `save_memory` returns `duplicate_detected: true`, evaluate `duplicate.content_preview` with conversational context and either use `update_memory` on the returned `entry_id`, or call `save_memory` again with `force: true` if genuinely different. Never ignore this response silently.
- `SUMMARY` and `TASK_CONTEXT` are exempt from the duplicate check — they always insert directly
- Use `update_memory` for corrections/extensions to existing entries; use `save_memory` only for genuinely new knowledge
- Never overwrite — `update_memory` supports `append_content` specifically to avoid destructive edits
- For `ANTI_PATTERN`: always include `(last observed: YYYY-MM-DD)` in content
- For `TASK_CONTEXT` (T6) entries: use the `**Gap** / **Suggested fix** / **Evidence**` format defined in `memory.md`
- Never call `update_memory` on an `archived` entry — fall back to `save_memory` instead

### Step 4: Report consolidation

Return using the output contract from `memory.md` (Mode 2: Consolidation):
- Per-category changes (with `entry_id`) or explicit no-change reason
- `TRIGGERS_EVALUATED: T1=<yes/no>, T2=<yes/no>, T3=<yes/no>, T4=<yes/no>, T5=<yes/no>, T6=<yes/no>, T7=<yes/no>, T8=<yes/no>`
- `INSTRUCTIONS_TO_ESCALATE`: list or "none"
- `STATUS: complete | partial | failed`

## Rules

- Persist only through team-memory MCP tools — never write local files
- Do not add speculative entries
- Do not duplicate existing entries — always search before saving
- Do not delete or destructively overwrite valid historical entries — prefer `append_content` over `content` replacement when extending an entry
- If the MCP server is unreachable, report `STATUS: failed` and proceed without historical context rather than blocking the pipeline
