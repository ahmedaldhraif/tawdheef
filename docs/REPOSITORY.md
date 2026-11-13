# How Tawdheef is organized

There is one app and one local database. You and your agent use the same records.

```text
You use the screen ────────┐
                          ├─ validated domain operations ─ SQLite in .local/
Your agent uses MCP / CLI ┘
                          └─ running local app ─ your authorized providers
```

## What teaches an agent?

| File or interface | Purpose |
| --- | --- |
| `AGENTS.md` | Shared operating rules: how to start, read evidence, apply, record results and recover safely. Codex reads this project instruction file. Use the plural, uppercase filename. |
| `CLAUDE.md` | Claude Code's entry point. Imports `AGENTS.md` so both clients follow the same rules. |
| `docs/FIRST-RUN.md` | One user prompt and a rerunnable setup checklist, including when the user needs to sign in. |
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
| `server/index.mjs` | Loopback web server and provider session owner. |
| `server/mcp.mjs` | 43 tool definitions and stdio MCP transport. |
| `bin/apply-tracker.mjs` | CLI over those same definitions; every tool supports `call TOOL --input-file FILE`. |
| `server/providers/` | Gmail, Outlook, iCloud Mail, calendars and local bridge adapters. |
| `server/agent-runner.mjs`, `server/operator-contract.mjs` | One assistant subprocess per company, durable queue outcomes and scoped operating tools. |
| `server/setup-status.mjs` | Connection readiness shared by the Connections panel, CLI and MCP, with explicit sign-in/CV verification. |
| `server/scheduler.mjs` | Tracked-thread refreshes and reports while the computer is awake. |
| `server/email-send.mjs`, `server/calendar.mjs` | Guarded provider actions and recovery. |
| `data/uae-directory.json` | Original public research seed, never the user's tracking database. |
| `directories/` | Shareable directory packs and provenance. |
| `scripts/` | Launch, explicit agent setup, doctor, packaging and verification. |
| `docs/` | Setup, provider details, agent guide and generated tool schemas. |
| `website/`, `public/` | Separate public website, local artwork and downloadable assets. |
| `tests/`, `.github/` | Automated checks and draft-release workflow. |
| `.local/` | Private tracking, OAuth tokens, provider caches and logs. Never commit or publish. |

The public product is **Tawdheef**. `apply-tracker` remains the stable internal CLI/MCP identifier for compatibility.

## CLI or MCP?

Use MCP when the client supports local stdio tools. Use the CLI for scripts, terminal agents or a client without MCP. Both return structured JSON and use the same validation. Use one interface per operation; do not issue it twice through different interfaces.

```sh
node bin/apply-tracker.mjs context
node bin/apply-tracker.mjs tools
node bin/apply-tracker.mjs list --directory uae --limit 20
node bin/apply-tracker.mjs call TOOL_NAME --input-file arguments.json
```

The contract covers setup checks, directories, companies, statuses/notes, imports/exports, runs, application evidence, email, calendar, CV reads, connections, settings, schedules, activity and reports. See [`tools.json`](tools.json) for all 43 schemas. Background lifecycle and installation use local CLI commands, not provider tools. Browser form filling comes from the user's agent/computer tools; LinkedIn actions remain manual.

Only the running local app owns provider sessions. The CLI/MCP can edit offline records, but live provider operations proxy to the app with a matching private-data directory. Local records and connected online services are distinct.

## A normal first conversation

For a new installation, start with the single setup prompt in [FIRST-RUN.md](FIRST-RUN.md). `get_setup_status` exposes the readiness behind the Connections panel's **Check connections** action. The agent reads these files directly; the app keeps account setup in Connections. After setup, try:

> Read AGENTS.md, call get_agent_context and get_capabilities, and help me shortlist suitable companies in the UAE directory. Use my authorized CV and ask for any missing role or location preferences. Do not send or submit anything.

For an application run, the person explicitly names or selects the targets. The agent checks scope, acts through authorized tools and logs real evidence. Scheduled refreshes never start new applications.

Client conventions: [OpenAI MCP configuration](https://learn.chatgpt.com/docs/extend/mcp#connect-codex-to-an-mcp-server), [Claude Code project MCP](https://code.claude.com/docs/en/mcp#project-scope), [Claude instruction imports](https://code.claude.com/docs/en/memory).
