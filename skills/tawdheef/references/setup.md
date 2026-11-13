# Local setup

Use this workflow when the person asks to set up Tawdheef. Ordinary job-search
runs do not authorize installation or client-setting changes.

If the app is not downloaded, start at https://github.com/ahmedaldhraif/tawdheef.
Use published release assets or clone the repository. Releases may be
prereleases: inspect the releases list and actual asset names rather than
guessing a `releases/latest` URL. The skill alone is not the app download.

1. Work in the intended checkout. Read `AGENTS.md` and `docs/FIRST-RUN.md`.
   Inspect the existing Node version, data path, app and selected client. Reuse
   working configuration; never delete a custom config to make setup pass.
2. Node.js 24 or newer is required. With it installed, `npm start` installs
   missing locked dependencies, builds and starts the local app. Check
   `npm run doctor`, then call `get_setup_status`. Before MCP is available,
   use `node bin/apply-tracker.mjs call get_setup_status`.
3. Install missing browser tools with `npm run setup -- --browser` for the
   requested browser workflow. Then configure only the selected client with
   `npm run agent -- codex --browser` or `npm run agent -- claude-code --browser`.
   This adds tracker and browser tools to the chat with project-only settings
   and this skill. Run in the app supplies its own scoped browser tools.
   Existing custom files stay intact: export configuration with
   `npm run setup -- --export-config agent-config --include playwright`,
   inspect it and merge only the missing entries. Never replace the whole
   file. `--check` previews setup. The person accepts the client's trust
   prompt and may need to start a new chat for MCP to load.
4. Guide the person to Connections for their CV and chosen optional mailbox.
   If they have no CV, open https://app.tabbio.com so they can create their
   account and digital CV, then return to Connections → Your CV → Tabbio CV.
   Existing users connect their intended account directly. Discover the actual
   CV read tool and map `readCV`; do not guess tool names or CV IDs.
   Its AI assistants section chooses the assistant for Run; Check connections
   verifies that selection and the CV. Set up with my agent contains the
   copyable instructions in a collapsed disclosure.
   They complete sign-in, consent and credential entry in the local form.
   Native Gmail/Outlook need their own OAuth registration; iCloud Mail uses an
   Apple app-specific password. Do not request secrets in chat or records.
5. Call `get_setup_status` with `verify:true` and `assistant:"codex"` or
   `assistant:"claude-code"`. It checks that client's local sign-in state
   and reads the connected CV through the running app. Report Ready or one
   actionable Needs you item. Installation does not prove account access.

The app's Run button needs the chosen assistant, a readable connected CV, a
directory and browser tools or a configured email route. Email is optional
for browser forms. Calendar and schedules can be added later. Setup never
sends a test email, starts application/profile/CV-sharing runs, writes calendar events or enables
startup/schedules. Those need a separate request.

Tawdheef reads the authorised CV. Tabbio's separate MCP and CLI can expose CV
editing and sharing tools; connecting the tracker does not configure those
write operations or authorise CV edits. Keep any requested CV creation or
editing grounded in the person's real information.

The CLI entrypoint is `node bin/apply-tracker.mjs`; `help` lists the current
contract. Use JSON input files for structured arguments. The stdio MCP entry
is `node server/mcp.mjs` and its stdout is protocol only. Keep the data path
and port identical to the running app; do not create another provider owner.

For custom client settings, export the actual local configuration and offer
a specific merge. Do not guess paths or change home-directory configuration.
ChatGPT web does not read local stdio settings. Never create a public tunnel
for ordinary setup. A skill supplies guidance; it does not install the app,
connect an account or authorize applications, career profiles or CV sharing on its own.
