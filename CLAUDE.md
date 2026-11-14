# Claude Code

@AGENTS.md

Follow [AGENTS.md](AGENTS.md). Help the person find jobs that fit their CV and create or complete career profiles for future opportunities, even when no suitable vacancy is open. Act only within their explicit run and its saved choices; profile progress is not a job application.

Start with `get_agent_context` and `get_capabilities`. Use `node server/mcp.mjs` for stdio MCP, or `node bin/apply-tracker.mjs help` for the CLI.

- [First setup](docs/FIRST-RUN.md): inspect readiness, install missing project tools and preserve existing settings.
- [Provider setup](docs/CONNECTIONS.md): account sign-in, local credentials and mappings.
- [Agent guide](docs/AGENT-GUIDE.md): Claude `.mcp.json`, scoped runs, recovery and evidence.
- [Schedules and reports](docs/AGENT-GUIDE.md#background-connections-and-schedules): tracked replies and reports without new applications or profile work.

These details belong in agent guidance. The screen keeps the person's choices, account actions and actionable status; it does not display configuration or the full operator prompt.
