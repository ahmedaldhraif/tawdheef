# Start Tawdheef

Find jobs that fit your CV and build career profiles for future opportunities, even when no suitable job is open.

**Prefer your agent to handle setup?** Open this folder in Codex or Claude Code and use the single prompt in the [setup guide](FIRST-RUN.md). It handles local installation and checks while you complete your own sign-ins. In the app, open **Connections** and choose **Copy setup request**. Choose your assistant in the same panel and use **Check connections** to verify it and your CV.

The instructions below are the manual route.

For the source edition, install **Node.js 26 LTS** (patched Node 24 is also supported), download/extract or clone this repository, and open a terminal in that folder. A platform app package includes Node; extract it fully and open **Tawdheef.exe** on Windows or **Tawdheef.app** on Mac. App packages never install developer tools or rebuild the screen. See [desktop releases](DESKTOP-RELEASE.md) for candidate and signing status.

```sh
npm start
```

In the source edition, Start installs missing locked dependencies without optional bridges, builds only the tracker, starts its background process and opens your browser. On Windows, double-click **Start Tawdheef.cmd** instead. On macOS/Linux, `npm start` works from a terminal; the macOS `.command` and Linux `.sh` launchers are also provided. OS execution permissions may apply. The source's first launch needs internet; later launches reuse the build until app files change. All tracker data stays in `.local` beside this folder unless `APPLY_TRACKER_DATA` chooses another local folder. Optional browser/provider integrations install only when requested.

The UAE tab contains a dated research directory. Its links are leads, not proof of current vacancies or completed applications. Add another directory with the **+** beside the tabs, choose a flag or icon, then import a spreadsheet or add companies.

## Connect your accounts

Open **Connections**, choose Gmail or Outlook, complete **One-time setup** with your own developer OAuth registration, then sign in. No shared publisher Google/Microsoft client ID is included in this release. The form links to the provider's setup instructions. Your tracker works without these connections; add them when you need email or calendar actions. See [connection choices](INTEGRATIONS.md).

**iCloud Mail** is also available. Enter your iCloud Mail address and an Apple app-specific password in its local form. It uses encrypted IMAP/SMTP; no developer registration is needed.

Choose **Tabbio CV** in Connections for Tabbio sign-in. A readable connected CV is required for Run; browsing and editing the directory work without it. Tabbio is an online service; the tracker and its saved CV response remain local. Connect only the account you intend to use.

Connections also offers **Google Calendar**, **Outlook Calendar** and **iCloud Calendar**. Calendar permission is separate from email. After connecting, choose a calendar to view upcoming events or add an interview when you ask. iCloud uses an app-specific password generated in your Apple Account, entered only in the private local connection form. Signing in never creates an event.

To use the installed Google CLI instead of native Gmail, run this once:

```sh
npm run setup -- --login google-cli
```

The CLI has its own isolated credentials under `.local/google-cli`. It still needs Google OAuth client setup. The app uses its Gmail commands through the same guarded tracker send/reply actions. Native Gmail and Google CLI are alternative owners of the selected mailbox connection.

## Connect a coding agent

For Codex, run `npm run agent -- codex`. For Claude Code, run `npm run agent -- claude-code`. Both commands create project-only MCP settings with real local paths and install the Tawdheef skill. Open this folder in that client and accept its project/server trust prompt, then start a new chat. Add `--check` for a read-only preview. Setup refuses to replace existing custom settings. It does not install the AI client, sign into it or grant mailbox access.

For browser form work from that chat, first run `npm run setup -- --browser`, then add `--browser` to the chosen setup command, for example `npm run agent -- codex --browser`. This includes the Playwright MCP server. If you already have custom project settings, export with `--include playwright` below and merge only the missing entries. The app's Run button supplies its own browser tools without this client-config step.

Codex uses `.codex/config.toml`; Claude Code uses `.mcp.json`. Both generated files are ignored by Git. If an existing client-level server uses the same `apply-tracker` name, inspect `/mcp` and its data path before using it. Client policies and configuration precedence still apply.

For existing custom settings or another stdio client, ask your agent to call `get_client_config`, use `node bin/apply-tracker.mjs client-config`, or export reviewable files:

```sh
npm run setup -- --export-config ./agent-config
```

This creates `codex-mcp.toml` and `claude-mcp.json` in the chosen folder, refuses to overwrite them, and leaves client settings unchanged. Merge the entries into your client's configuration and approve its project/server trust prompt. Treat generated configuration as machine-specific; do not commit absolute local paths.

Tell the agent: **“Read AGENTS.md, call get_agent_context, and help me with this directory.”** It can inspect the directory, preferences, connections and current runs through the same local records as the screen. Your AI client supplies the model; the tracker does not need a model API key.

## Press Run

Use **Connections → Check connections** to check your chosen assistant's sign-in state and read your CV. A directory and at least one application route are needed: browser tools for forms or a configured email connection. Email is optional when using browser forms; calendar and schedules are always optional. The connection check does not send a test email or application.

Install and sign in to Codex or Claude Code on this computer once. Filter the company list or check specific rows, then open **Run**. Matching applications and career-profile creation start selected; change either before starting. The profile choice creates or completes an account, fills the available career details and uploads your CV when no suitable opening is found. It reuses existing accounts. CV-only email stays off unless you select it. Use **Add a note** for extra role or location preferences, then press **Run**.

Run covers all matching unfinished companies across every page, or only the unfinished checked companies that match. There is no app count limit. Each company gets a separate attempt; failures and blockers are recorded and the queue continues. Confirmed applications and completed tracking statuses are skipped on later runs. Uncertain submissions must be checked before retrying. Account, profile and CV steps remain separate from job applications in progress and reports.

**View progress** shows the current company and actual outcomes. **Stop** cancels further work. Closing the panel does not stop the run; closing/stopping the local app does. The next Run retries unfinished companies. Assistant sign-in or usage-limit failures stop the queue until you resolve them. The tracker stores data locally; the selected assistant and connected providers may process authorized data online under your own accounts.

Project MCP setup above is for using the tracker from an existing chat. The Run button supplies its own scoped tracker tools. For form filling, install the optional browser tools below. Without browser access, blocked forms are recorded as Needs you.

## Add browser tools and the external CLI

```sh
npm run setup -- --all
npm run setup -- --export-config ./agent-config-with-browser --include playwright
```

`--browser` installs only Playwright MCP and Chromium. `--integration google-cli` or `--integration outlook-mcp` installs only that bridge. `--all` explicitly requests all supported bridges, Chromium and the external Tabbio CLI in private local tools; unsupported optional bridges are skipped. None signs in, sends mail, submits applications or changes startup/schedule settings. Tabbio CLI is distributed separately with an `UNLICENSED` package declaration; it is not part of the MIT tracker source.

Optional external sign-ins:

```sh
npm run setup -- --login tabbio
npm run setup -- --login outlook-mcp
```

Only add external mailbox/CV servers directly to the AI client when you need them. For ordinary tracked email actions, use the tracker connection so its active-run checks, reservations and unknown-outcome handling apply.

## Start applying and keep track

Choose companies and explicitly start your selected actions. The agent may send and submit within that named run's choices. It records actual evidence, distinguishes accounts/profiles/CV uploads from applications, and asks for help when a login, CAPTCHA or provider permission requires you. LinkedIn application steps stay manual.

Open the **Settings** gear beside Connections to configure reply checks and reports for all directories. Fresh installs leave automatic checks and reports off; upgrades preserve existing choices. Scheduled work checks tracked threads; it never starts applications, creates profiles, shares CVs or sends follow-ups. The computer and local app must remain running, awake and online. A revoked account permission may require signing in again. Save report preferences before generating a report; generation uses the saved window and email settings. Start-at-login is optional on Windows, macOS and Linux and is installed only when explicitly enabled. Native login execution on each OS requires platform verification before release claims.

```sh
npm run doctor
npm run doctor -- --probe
npm run background:status
npm run background:stop
```

Doctor reports actual installation and local app readiness without printing tokens. `--probe` checks Google CLI credential presence locally; it does not authenticate the mailbox or send anything. See [the agent guide](AGENT-GUIDE.md) for the shared tools and [connection contracts](CONNECTIONS.md) for provider results.

## Back up or update

Stop the app with `npm run background:stop` and close agent MCP processes before copying the entire private data directory to a private backup. Do not publish that backup. Download a new release into a separate folder, point `APPLY_TRACKER_DATA` at your existing data directory, and run `npm start`. Keep the same data path and port in your newly generated client configuration. Retain the previous source and backup until you have verified the upgrade; do not overwrite the only copy of your data.

If startup fails, keep the terminal message and run `npm run doctor`. A port conflict means another app may already be using the selected port. On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd start` or the provided `.cmd` launcher; changing system execution policy is unnecessary.
