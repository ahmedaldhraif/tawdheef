# Native client connections

Native mode is the default. Your actual Codex or Claude Code client owns every external connection: Tabbio/CV, email, calendar, browser/computer tools and password manager. Tawdheef supplies local guidance, Run scope, claims, records and results. It starts no second assistant or provider session in Native mode. The client and its model/provider services may process data online under their own permissions and privacy policies.

## Connect in the actual client

| Connection | Native responsibility |
|---|---|
| Tabbio / CV | Read the actual authorized CV source in the client. Report source metadata, never raw CV text or credentials. |
| Email | Use the client's authorized mailbox tools and freshly observed provider/account identity. New registrations use its observed primary email; existing career accounts keep their original login. |
| Calendar | Use the client's separately authorized calendar tools. Monitoring reads only saved calendars; an application Run never authorizes a calendar write. |
| Browser / computer | Use supported client tools with their normal approvals. Sign-in, CAPTCHA and identity checks may require the person. |
| Password manager | Keep passwords and career-account sessions in the client's supported workflow, never tracker fields. |
| Assistant | Connect the selected client to local Tawdheef MCP. Local tool use or a connection report does not prove model/provider access independently. |

The production core has six direct dependencies: `@modelcontextprotocol/sdk`, `csv-parse`, `express`, `fast-xml-parser`, `jszip` and `zod`. Mail/calendar SDKs are developer dependencies for source tests and optional private add-ons for compatibility mode. Native mode needs no tracker-managed browser install, OAuth registration, separate model API key or assistant CLI. An optional user-selected original PDF/DOCX can be stored and staged locally; the actual client performs any authorized upload.

```sh
npm run agent -- codex
npm run agent -- claude-code
npm run agent -- both
npm run agent -- codex --tabbio
```

These commands create project-only settings and install the Tawdheef skill. Each client's tracker connection has its own bound identity. Unrelated settings are preserved; unchanged owned entries may be upgraded with private backups, while edited or ambiguous entries require review. Use `--check` to preview. The explicitly selected `--tabbio` adds `https://server.tabbio.com/api/mcp` directly to the actual client; it installs no Tabbio CLI and does not sign in or prove access. [Tabbio connection guide](https://www.tabbio.com/en/mcp).

For reviewable configuration files without changing an installed client's settings:

```sh
npm run setup -- --export-config ./agent-config
npm run setup -- --export-config ./agent-config-tabbio --include tabbio
```

Native export supports only the explicitly selected `tabbio` include. Codex uses TOML and Claude Code uses JSON, with the actual Node executable, absolute server path, private data directory, mode and per-client actor. Other compatible clients can use the local stdio server, but another model/client has not necessarily been live tested. Review its supported settings and permissions. [Agent guide](AGENT-GUIDE.md) · [First setup](FIRST-RUN.md).

Start with `get_agent_context` and `get_capabilities`, then a small company page. Inspect the actual client's external tools and report only observed metadata through `report_native_connection`; missing reports stay unknown. After an explicit user-started `start_native_run`, claim one target and keep its token. Reserve browser/email intents before the external action, use the client's own authorized tools once, then record actual confirmation. `prepare_native_email` does not send. Unknown outcomes need inspection before any retry. Native monitoring has a separate read-only catalog and never authorizes sends, profile changes, uploads or new Runs.


## Upgrading older installations

App-managed provider adapters and the managed assistant runner have been retired. Existing tracking, settings, private credential files and historical rules/results are preserved. These saved credentials and rules are inert: Tawdheef does not read their sessions or run their actions. Configure external connections in the actual Codex or Claude Code client. Do not copy tokens, passwords or vault contents into Tawdheef.
