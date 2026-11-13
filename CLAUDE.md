# Claude Code

@AGENTS.md

Read and follow [AGENTS.md](AGENTS.md) before operating this app. It defines the shared local records, explicit application-run authority, source handling, submission evidence and schedule boundaries.

Connect `node server/mcp.mjs` as a stdio MCP server, or use `node bin/apply-tracker.mjs help`. Use the user's authorized email and browser/computer-use connections for external actions. This app does not embed Claude or assume that a tool listed in another client is available to its local background process.

Start with `get_agent_context`. Read compact company pages, then fetch one record for source evidence and its revision before editing. For mailbox/CV operations, use the tracker tools that proxy to its running local background app; do not create competing OAuth refresh sessions. Import is preview-first and report generation stays local unless email is explicitly requested.

See [docs/AGENT-GUIDE.md](docs/AGENT-GUIDE.md) for the verified Claude Code `.mcp.json`/CLI setup and complete shared operation contract.
