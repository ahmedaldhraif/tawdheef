# How Tawdheef is organized

There is one app and one local database. You and your agent use the same records. Native mode is the default: the actual Codex/Claude client owns every external connection and tool.

```text
You use the screen ─────────┐
                           ├─ local coordinator/domain tools ─ SQLite
Your actual AI client ─MCP─┘
         │
         └─ its own CV/mail/calendar/browser/computer/password-manager tools

Optional explicit local-adapters mode:
local app ─ adapter/OAuth sessions ─ authorized providers
```

## What teaches an agent?

| File or interface | Purpose |
| --- | --- |
| `AGENTS.md` | Shared operating rules: how to start, read evidence, apply, record results and recover safely. Codex reads this project instruction file. Use the plural, uppercase filename. |
| `CLAUDE.md` | Claude Code's entry point. Imports `AGENTS.md` so both clients follow the same rules. |
| `docs/FIRST-RUN.md` | One user prompt and a rerunnable setup checklist, including when the user needs to sign in. |
| `docs/MONITORING.md` | Selected read-only sources, local native-client schedules and the difference between reported task metadata and actual check evidence. |
| `skills/tawdheef/SKILL.md` | Reusable job-search workflow: shortlist, explicitly apply, review replies. References expand only when needed. |
| `DESIGN.md` | Rules for developers changing the interface. |
| `.agents/skills/`, `.claude/skills/` | Emil Kowalski development skills, loaded on demand. The agent setup command also places the Tawdheef skill here for the chosen client. These Markdown files do not add browser runtime weight. |
| MCP server instructions and tool schemas | Guidance and validated inputs visible even to clients that do not load repository Markdown. Call `get_agent_context` and `get_capabilities` first. |

Instructions teach behavior. Tools perform actions. A Markdown file does not connect an account, grant permission, send an application or make every AI client behave identically. Important limits also live in validated server code, including explicit run scope, revision checks and send reconciliation.

You do not need another `agent.md`, a prompt for every company, or an embedded model. Keep the main rules in `AGENTS.md`, detailed workflows in the skill, and operation definitions in the actual tools. If a tool changes, regenerate `docs/tools.json` with `npm run tools:catalog`.

## Where the code lives

| Path | Responsibility |
| --- | --- |
| `src/` | React screen, tables, panels, accessible controls. |
| `server/store.mjs` | Shared SQLite records, validation and revisions. |
| `server/index.mjs` | Loopback screen/API and single local authority coordinator. Native bootstrap does not instantiate or inspect external provider connections. Compatibility providers load only after explicit local-adapters selection. |
| `server/mcp.mjs` | Shared tool definitions and stdio MCP transport, with separate operator, monitor and diagnostic catalogs. |
| `server/snapshot.mjs` | Directory snapshot counts and paginated evidence, shared by the screen, CLI and MCP. |
| `bin/apply-tracker.mjs` | CLI over those same definitions; every tool supports `call TOOL --input-file FILE`. |
| `server/native-store.mjs` | Dated client capability metadata, normalized Native targets/claims, durable send plans/receipts and Native monitoring read requests/results. No external I/O. |
| `server/native-client.mjs`, `server/native-guidance.mjs` | Native handoff/setup guidance and local domain facade. The actual client supplies external tools, sign-in and model access. |
| `server/native-mcp-tools.mjs` | Actor-bound Native tool catalog, local-coordinator proxy writes and claim checks. |
| `server/providers/` | Optional compatibility Gmail/Outlook/iCloud/calendar/bridge adapters; these are not Native client connections. |
| `server/agent-runner.mjs`, `server/operator-contract.mjs` | Explicit compatibility CLI subprocess queue and scoped operating tools. Native Run does not launch this runner. |
| `server/setup-status.mjs` | Local setup/readiness and dated Native reports; independent compatibility verification is separate. |
| `server/agent-context.mjs`, `server/assistant-usage.mjs`, `server/agent-check.mjs` | Compact context, allowlisted usage metadata and optional compatibility model/MCP proof. Native context does not fetch/cache raw CVs. |
| `server/cv-artifacts.mjs` | Optional explicit user-selected original-file metadata/storage/staging in either mode, bound to a claimed upload. No provider CV cache or fact verification; the actual client performs sharing/uploading. |
| `server/monitoring-store.mjs` | Revision-bound sources, tokens, namespaces, freshness/evidence validation and paginated updates. Jobs use SQL count/page projection rather than repeated full source decoding. |
| `server/monitoring.mjs`, `server/monitoring-source.mjs` | Compatibility-only app-owned bounded provider/public-page reads. Native monitoring returns precise read requests and performs no external read. |
| `server/client-guidance.mjs` | Native task requests and registration identity derived from actual dated mailbox metadata. The actual client owns its clock. |
| `server/scheduler.mjs` | Optional compatibility tracked-thread/report timers. No Native internal scheduler. |
| `server/email-send.mjs`, `server/calendar.mjs` | Guarded compatibility provider actions and recovery. Native clients perform their own external actions. |
| `data/uae-directory.json` | Original public research seed, never the user's tracking database. |
| `directories/` | Shareable directory packs and provenance. |
| `scripts/` | Launch, explicit agent setup, doctor, packaging and verification. |
| `docs/` | Setup, provider details, agent guide and generated tool schemas. |
| `website/`, `public/` | Separate public website, local artwork and downloadable assets. |
| `tests/`, `.github/` | Automated checks and draft-release workflow. |
| `.local/` / native per-user app data | Private tracking, client-reported metadata, intents/results; preserved compatibility credentials/caches if explicitly configured. Never commit or publish. |

The public product is **Tawdheef**. `apply-tracker` remains the stable internal CLI/MCP identifier for compatibility.

## CLI or MCP?

Use MCP when the client supports local stdio tools. Use the CLI for scripts, terminal agents or a client without MCP. Both return structured JSON and use the same validation. Use one interface per operation; do not issue it twice through different interfaces.

```sh
node bin/apply-tracker.mjs context
node bin/apply-tracker.mjs tools
node bin/apply-tracker.mjs list --directory uae --limit 20
node bin/apply-tracker.mjs call TOOL_NAME --input-file arguments.json
```

The contract covers setup checks, directories, companies, statuses/notes, imports/exports, runs, application evidence, email, calendar, CV reads/files, registration context, monitoring, connections, settings, snapshots, activity and reports. See [`tools.json`](tools.json) for the generated schemas and `get_capabilities` for the catalog actually exposed in the current role. Background lifecycle and installation use local CLI commands, not provider tools. Browser form filling comes from the user's agent/computer tools; LinkedIn actions remain manual.

In Native mode all provider sessions belong to the actual client. The running app coordinates claim/send authority and validated local records only. Native writes needing fresh authority proxy to its loopback API with matching private data. Capability reports are dated/client-reported, not independent authentication proof. Minimal CV metadata and observed mailbox email do not grant account access.

Only explicit local-adapters compatibility mode makes the running app a provider-session owner. Its live adapter operations proxy to that owner; Native never creates a second adapter session or silently falls back to app credentials.

## A normal first conversation

For a new installation, start with [FIRST-RUN.md](FIRST-RUN.md). Call get_agent_context/get_capabilities, inspect the actual client's own tools, then report dated availability through report_native_connection. The app displays those reports and copyable requests; sign-in/credentials remain in the client. After setup, try:

> Read AGENTS.md, call get_agent_context and get_capabilities, and help me shortlist suitable companies in the UAE directory. Use my authorized CV and ask for any missing role or location preferences. Do not send or submit anything.

For a Native Run the person explicitly selects targets/actions. The app saves scope and provides a handoff, without launching another model process. The actual client claims one target, acts through its own authorized tools and records real receipts. Normalized target rows keep progress updates local and compact; target statuses are separate from confirmed outcome counts. Stop/expiry/app restart revoke authority without erasing ambiguous intents. Native monitoring can only read saved sources and report evidence; it never starts applications or external writes.

Client conventions: [OpenAI MCP configuration](https://learn.chatgpt.com/docs/extend/mcp#connect-codex-to-an-mcp-server), [Claude Code project MCP](https://code.claude.com/docs/en/mcp#project-scope), [Claude instruction imports](https://code.claude.com/docs/en/memory).
