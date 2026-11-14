# Start Tawdheef

Find jobs that fit your CV and build career profiles for future opportunities.
Your existing **Codex or Claude Code client** owns all external access. Tawdheef
keeps local guidance, the selected scope and recorded evidence.

**Prefer agent-led setup?** Use [FIRST-RUN.md](FIRST-RUN.md). Setup preserves
working settings, and you complete sign-in and consent in your actual client.

## Start the local app

A platform package includes Node and the browser interface. Extract it fully and
open **Tawdheef.exe** on Windows or **Tawdheef.app** on Mac; Linux has its supplied
launcher. See [desktop releases](DESKTOP-RELEASE.md) for target/signing status.

For source, install **Node.js 26 LTS** (patched Node 24 also works), download or
clone the source, and run from its folder:

```sh
npm start
```

Source Start installs missing locked core dependencies, builds the screen and
starts the local app. On Windows, **Start Tawdheef.cmd** is also available.
macOS/Linux `.command`/`.sh` launchers may need normal execution permission.
The first source launch needs internet. Later launches reuse the existing build
until app files change. Source data defaults to `.local`; `APPLY_TRACKER_DATA`
can select another private local folder. Packaged apps use their documented
external data location and never write private data inside a signed app bundle.

## Connect your actual client

In **Connections → Assistant**, choose Codex or Claude Code and **Copy setup
request**, then paste it into the client you already use. Follow its normal MCP
trust and account consent flow. Tawdheef does not launch a second model, read
another app's hidden credentials or need its own model API key.

For manual source setup:

```sh
npm run agent -- codex
# Or choose this client instead:
npm run agent -- claude-code
```

These commands create project-only tracker MCP settings and install its skill.
`--check` previews changes. They preserve custom/global settings and do not sign
into a client account. Open the configured folder in that client and approve
normal project/server trust. Codex uses `.codex/config.toml`; Claude Code uses
`.mcp.json`. Generated local configuration is ignored by Git.

If supported by the selected client, `--tabbio` adds the published Tabbio MCP
entry to that same project configuration. Reuse an existing connection first;
the user completes Tabbio's own sign-in. Provider access stays in the actual
client, not a second Tawdheef OAuth session.

For a custom MCP setup, use `get_client_config`,
`node bin/apply-tracker.mjs client-config`, or:

```sh
npm run setup -- --export-config ./agent-config
```

Review the generated machine-specific files and merge only missing entries.
Do not commit absolute local paths or overwrite custom client settings.
Tell the client: **Read AGENTS.md, call get_agent_context and get_capabilities.**
The tracker MCP and screen share the same local records.

## Connect external services in that client

Connections keeps six familiar rows: **Assistant, Tabbio CV, Email, Calendar,
Browser & computer use, Passwords**. Email/Calendar provider choices open setup
requests rather than local credential forms. Tabbio has a create-CV link and
native MCP request. Browser and computer access are checked separately; website
passwords stay in your supported browser or password manager. Unlock, sign-in,
identity and provider approvals remain your responsibility.

Native status is **Unknown**, **Needs you** or a dated **Client reported**
observation. Local tracker tool use, model access and provider authentication
are distinct facts. The app does not independently verify external reports.
A fresh main email must be observed by the client before new career registrations;
existing accounts retain their original login. Email and calendar are optional.

You may save an original PDF/DOCX up to 10 MB under **Tabbio CV** for authorized
file uploads. Readable CV facts still come from your actual client connection.
Saving/staging a file is neither a submission nor proof of an email attachment.

## Prepare Run and paste it into your existing chat

Filter companies or select rows, open **Run**, review its three action choices
and optional note, then start. The local app snapshots all matching unfinished
companies across pages, or only matching checked companies. There is no app
count limit. Applications and profiles start selected; CV-only email is off.

Run copies a request bound to those actions, targets and expiry. Paste it into
your existing Codex or Claude Code conversation. Clipboard failure exposes
selectable text. **Waiting for assistant** means no client has claimed the next
company; no installed CLI or app-started assistant process is required.
The client claims one target at a time and records actual confirmations,
profile/CV progress and actionable blockers. It must inspect uncertain outcomes
before retrying. LinkedIn actions remain manual.

**View progress** shows real recorded work. **Stop** revokes local authority;
stop any remaining client work too. Tawdheef cannot terminate an external
conversation. Restarting the local app requires a fresh explicit Run.

## Read-only monitoring and local reports

In **Settings → Monitoring**, choose specific sources, scope and frequency for
the native-client recipe. Calendar uses explicitly selected IDs reported by the
actual client; the read window is at most the next 14 days. Email is limited to
tracked submissions and their original account/thread identity.

Copy the request to your client to set up its supported local automation.
Copying/saving does not create or independently verify a schedule. The client,
computer and local tracker must remain available. Actual client tools perform
bounded reads; Tawdheef returns read requests and saves source-backed results.
Missing tools or incomplete reads remain unknown/Needs you, including when no
updates were recorded. Monitoring never authorizes sending, applications,
profiles, CV sharing or calendar writes. Local reports remain available.
See [MONITORING.md](MONITORING.md).

## Optional local-adapter compatibility

Only choose **Connections → Advanced compatibility → Tawdheef local adapters**
if you deliberately want the older app-owned providers and CLI runner. This
mode uses separate local credentials and optional adapter packages; it is not
required by the default workflow. Its forms, checks, browser installation,
provider registration and background clocks are documented in
[CONNECTIONS.md](CONNECTIONS.md) and [INTEGRATIONS.md](INTEGRATIONS.md).
Switching modes preserves private settings; stop an active Run first.
Do not install optional bridges or a browser engine just to use native-client
connections.

## Back up or update

Stop the app with `npm run background:stop` and close tracker MCP processes
before copying the entire private data folder to a private backup. Never publish
that backup. Extract an update separately and reuse the existing
`APPLY_TRACKER_DATA` folder. Keep the same port/data path in client configuration.
Retain the previous release and backup until the upgrade is checked.

```sh
npm run doctor
npm run background:status
npm run background:stop
```

Doctor inspects installation/local app state. It does not prove native client
provider access. If Windows blocks `npm.ps1`, use `npm.cmd start` or the supplied
`.cmd` launcher; a global execution-policy change is unnecessary.
