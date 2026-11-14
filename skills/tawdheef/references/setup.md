# Native-client setup

Use this only when the person requests setup. A job-search Run does not permit
installation, client-setting edits or code changes.

Start at https://github.com/ahmedaldhraif/tawdheef if the app is missing. Inspect
actual release assets: a country pack is data, and the skill is guidance, not
the app. Read the intended checkout's AGENTS.md and docs/FIRST-RUN.md.

1. Inspect the app/data path and selected existing client. Reuse working parts
   and custom settings; never delete a config to make setup pass. Source uses
   Node.js 26 LTS (patched Node 24 is supported) and npm start. Platform apps include Node
   and the interface: use the launcher and exact bundled runtime, without
   installing developer tools or rebuilding at launch. Preserve existing data.
2. Connect only the local tracker MCP/skill to the actual chosen Codex or Claude
   Code client, using its supported project-only settings. The source commands
   are npm run agent -- codex or npm run agent -- claude-code. --check previews
   changes. Inspect/merge conflicting custom entries; never replace the whole
   file or edit global/home settings. The user accepts client trust and may
   need a new conversation. No assistant CLI is needed for the default handoff.
3. Call get_agent_context and get_capabilities. The app observes these local
   tracker tool calls separately from external connection reports. They do not
   verify model access, provider authentication, browser/computer control or a
   schedule. If local stdio MCP is unsupported in this client, explain the
   supported local-client step; never create a public tunnel or claim a web
   chat loaded local settings.
4. In Connections → Assistant, choose the same actual client once. All external
   services belong there: Tabbio MCP/CV, email, calendar, browser/computer and
   password manager. Reuse their existing authorized tools and sign-ins. The
   user handles normal OAuth, identity, consent and unlock. Do not extract
   another app's credentials or create tracker provider sessions in native mode.
5. For CV, reuse the person's Tabbio account or offer https://www.tabbio.com/en.
   Connect its published remote MCP endpoint using supported client settings;
   the project setup --tabbio option is available when explicitly requested.
   Read the actual authorized CV through the native client. Report only CV
   reference/update metadata, never full CV text. No invented experience,
   visibility change, sharing, publishing or editing to make setup pass.
6. Check selected external tools in this actual client and record bounded
   available/needs_you/unknown observations with report_native_connection.
   Use actual observed account/provider identity and timestamps. Email's main
   address must come from the selected mail account, not CV text. Calendar
   reports contain only real IDs the user chooses. Browser and OS computer
   access are separate; a blank browser page cannot prove OS control. Password
   manager checks must not read/export a vault. get_native_client_status returns
   dated client reports, not independent provider verification; stale reports
   become Unknown. Finish with what was checked and one actionable Needs you.

Do not install a Tawdheef browser engine/provider bridge for native setup.
Client tools, plans and supported integrations may vary; preserve normal
client/provider permission requirements. Missing access stays missing.
The tracker needs no separate model API key.

The person may save an original PDF/DOCX up to 10 MB under Tabbio CV for authorized
file uploads. It is separate from readable native CV facts. Saving/staging does
not upload it, attach it to mail or publish it. Respect client file access;
never manufacture a replacement or invent an export/share URL.

Setup authorizes no applications, registrations, profile edits, CV upload/share,
messages, calendar writes, startup changes or schedules. Run separately saves
explicit actions/scope and copies a handoff into this existing conversation.
No app-started model/CLI queue is part of the native workflow.

Only an explicit Connections → Advanced compatibility → Tawdheef local adapters
choice enables the older provider forms/CLI runner. That mode has separate
local credentials, optional dependencies, Check connections and an optional
explicit CLI model fixture test. Keep that proof separate from native Desktop
or provider access; do not run models during a passive status read. See
CONNECTIONS.md before using it; never choose compatibility automatically to
bypass a native-client restriction.

The CLI is node bin/apply-tracker.mjs; help lists the live contract. Use JSON
input files for structured writes. The stdio MCP is node server/mcp.mjs;
stdout is protocol only. Keep its data path and port identical to the app.
Do not create another private-data folder/provider owner to bypass an error.
Follow docs/MONITORING.md only when read-only native monitoring is requested.
It needs the saved assistant/scope/revision and dedicated workspace; copying
instructions or reporting a task ID does not verify an external schedule.
