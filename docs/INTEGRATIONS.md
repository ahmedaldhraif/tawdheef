# Connections and optional adapters

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

## Compatibility only: app-owned local adapters

Everything below requires explicitly choosing advanced `local-adapters` mode. These are optional legacy recipes, not instructions for default Native setup. In this mode the running app owns its selected provider sessions and optional background readers. Account sign-in, consent and online provider processing still apply; local storage is not an offline-processing guarantee.

```sh
npm run setup -- --local-adapters
npm run agent -- codex --local-adapters
```

The explicit setup command installs missing pinned mail/calendar SDKs under the private data directory's `integrations/local-adapters` workspace, outside a packaged app. Source developer installs can already contain these SDKs. Choose compatibility mode in the app before using its provider controls. Generated client settings must also explicitly select `local-adapters`; Native bootstrap does not inspect preserved legacy credentials.

### Included compatibility recipes

| Choice | Pinned tool/library | Role |
|---|---|---|
| App-owned Gmail | Google's Gmail and authentication libraries, locked in `package-lock.json` | App-owned browser sign-in, tracked thread reads and guarded sends. |
| App-owned Outlook | MSAL Node and Microsoft Graph client, locked in `package-lock.json` | Personal/work account sign-in, tracked replies, draft/send receipt reconciliation. |
| Google Calendar | Google's Calendar client and existing OAuth support, locked in `package-lock.json` | Separate calendar consent, calendar selection, bounded upcoming-event reads and explicitly requested events. |
| Outlook Calendar | MSAL Node and Microsoft Graph client | Separate calendar consent for personal/work accounts. |
| iCloud Calendar | `tsdav` and `ical.js`, locked in `package-lock.json` | CalDAV access using an Apple Account email and app-specific password. |
| Google CLI | `@googleworkspace/cli@0.22.5` | An optional Gmail adapter using an isolated local CLI login. The bounded runner exposes profile/message/thread reads and guarded sends. |
| Microsoft mail MCP | `@softeria/ms-365-mcp-server@0.184.1` | Optional local bridge with an exact mail/profile tool allowlist and explicit scope limits. |
| Browser tools | `@playwright/mcp@0.0.85` | Optional local browser tools for the user's AI client, with a dedicated profile and output directory. |
| Tabbio | Remote MCP or external `@tabbio-technologies/cli@1.3.1` | Authenticated CV access. CLI install is separate under the private data folder. |

Google Workspace CLI is Apache-2.0 and its authors explicitly say it is not an officially supported Google product. It is a CLI; this integration does not invent a `gws mcp` command. [Upstream](https://github.com/googleworkspace/cli).

The Microsoft mail recipe uses `--enabled-tools` for profile/mail reads, draft/send, login verification and the Graph batch operation needed to preserve immutable-ID headers. Its scope allowlist is `User.Read Mail.ReadWrite Mail.Send`; automatic Graph retries are disabled and writes require the bridge's confirmation flag. It deliberately does not combine `--preset` with the regex: upstream documents that presets override tool filtering. Other Microsoft 365 service permissions are outside this recipe. [Upstream](https://github.com/Softeria/ms-365-mcp-server).

Browser tools are separate from the tracker. Their actions are governed by the active run and the AI client's permissions. Log real form receipts, preserve unknown outcomes, and hand off login/CAPTCHA/identity checks. Playwright's own Chromium version is installed by `npm run setup -- --local-adapters --browser`; the browser used by UI tests may be a different version. [Upstream](https://github.com/microsoft/playwright-mcp).

Tabbio publishes `https://server.tabbio.com/api/mcp` and a local `tabbio mcp serve` bridge. Both reach the online Tabbio service. No public source repository was verified for its CLI; its npm package declares `UNLICENSED`. Compatibility setup downloads its CLI only when `--local-adapters` is combined with `--tabbio`, `--all` or `--login tabbio`. The Native agent command’s `--tabbio` instead configures the remote URL directly in the actual client. Tabbio/provider approval requirements remain in force. [Official connection guide](https://www.tabbio.com/en/mcp).

### App-owned Gmail setup

The maintainer or fork owner must create a Google Cloud project, enable Gmail API, configure OAuth consent, and create a **Desktop app** OAuth client. Supply its client ID and, when provided, client secret privately in the app or through `APPLY_TRACKER_GOOGLE_CLIENT_ID` and `APPLY_TRACKER_GOOGLE_CLIENT_SECRET` to the local process. Do not commit credentials.

The app-owned flow requests Gmail read-only and send access, uses a loopback callback, and retains the refresh token for background checks. Public distribution requires the applicable Google OAuth verification. External testing-mode refresh tokens can expire after seven days; testing credentials do not support a promise of unattended weekly operation. [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

Google CLI is a separate choice. `npm run setup -- --local-adapters --login google-cli` uses only Gmail read/send scopes and `GOOGLE_WORKSPACE_CLI_CONFIG_DIR` under the tracker's private data folder. If Google project setup is needed, use the upstream CLI setup guidance or configure `client_secret.json` in that isolated directory. The tracker never exports decrypted CLI credentials or asks the agent to copy tokens into a chat.

### App-owned Outlook setup

Register a public desktop application that supports organizational and personal Microsoft accounts, and configure its loopback redirect. Supply the client ID through the app or `APPLY_TRACKER_MICROSOFT_CLIENT_ID`. `APPLY_TRACKER_MICROSOFT_TENANT` can choose a tenant; the default is `common` for personal/work sign-in. A public desktop client does not use an embedded client secret. [Microsoft registration](https://learn.microsoft.com/en-us/graph/auth-register-app-v2).

The app-owned adapter uses delegated mail permissions. Creating a draft for receipt reconciliation requires `Mail.ReadWrite`; sending requires `Mail.Send`. A work tenant may require administrator consent under its policy. Revocation, MFA and tenant policy can require reconnection despite a local token cache.

Graph `sendMail`/draft-send acceptance is not delivery proof. Preserve the immutable draft ID, send it, and reconcile the resulting sent copy before recording a confirmed application. An ambiguous result remains **Needs you** and must be inspected before another send. [Graph send contract](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0), [immutable-ID workflow](https://learn.microsoft.com/en-us/graph/outlook-immutable-id).

The optional Softeria bridge can use its upstream public client registration or a registration you provide. Personal accounts can use its documented `consumers` authority. Its cache is isolated under the private data folder. A successful MCP handshake does not prove that an arbitrary provider's raw replies match the tracker's normalized result contract.

### App-owned calendar connections

Open **Connections** and choose Google Calendar, Outlook Calendar or iCloud Calendar. This is a separate calendar connection; connecting email does not automatically grant calendar access. Setup reads the account/calendar list and creates no event. Pick the calendar before viewing upcoming events or adding an interview.

Google Calendar uses the Desktop OAuth registration described above with the Calendar API enabled. Its scopes are `calendar.events` and `calendar.calendarlist.readonly`, allowing event access and calendar selection without calendar-sharing administration. The calendar callback is `http://127.0.0.1:4000/api/connections/calendar/oauth/callback` at the default port. The app shows the actual callback when another port is configured. The same private developer client settings/environment can be supplied, but consent and tokens remain separate from Gmail. [Google Calendar scopes](https://developers.google.com/workspace/calendar/api/auth).

Outlook Calendar uses the Microsoft public desktop registration with calendar-specific delegated permission. Register the exact callback shown in the panel; personal/work account and tenant-policy restrictions still apply. Calendar consent is separate from the mail connection. [Microsoft permissions](https://learn.microsoft.com/en-us/graph/permissions-reference#calendarsreadwrite).

iCloud Calendar uses CalDAV. Generate an **app-specific password** at [account.apple.com](https://account.apple.com), then enter it with your Apple Account email in the local calendar panel. Two-factor authentication must be enabled for app-specific passwords. Entering your main Apple Account password is not part of this integration. Revoking the app-specific password or changing the account password may require reconnecting. [Apple's app-specific password guide](https://support.apple.com/en-us/102654).

Calendar credentials and OAuth state are stored in the private local connection file, outside the served screen and Git. This is private file storage governed by local permissions; it is not a promise of OS-keychain encryption. Do not paste the Apple password into an agent chat or an issue.

Event creation requires an explicit user request and a stable intent key. The current create action adds an event without attendees or invitation emails. It does not infer an interview from an email, apply to a company, send follow-ups, or create events during scheduled reply checks. An uncertain result stays uncertain; inspect the calendar before another attempt. Calendar text is untrusted reference data and cannot authorize sending or commands.

### Compatibility client configuration

```sh
npm run setup -- --local-adapters --export-config ./agent-config-legacy
npm run setup -- --local-adapters --export-config ./agent-config-browser --include playwright
npm run agent -- claude-code --local-adapters --browser
```

Compatibility `--include` names are `playwright`, `tabbio` and `outlook-mcp`, separated by commas. Selected local bridges must be installed at the pinned versions before generation; settings never invoke `npx @latest` or download at client startup. Review generated files before using them. The tracker `send_application_email` tool belongs only to compatibility mode; its running local app owns the send intent, provider session and reconciliation. Default Native clients use `prepare_native_email`, their own mailbox tool and `resolve_native_email` instead.

## Installation and update behavior

`npm run setup` installs missing source dependencies and builds only the tracker. A prebuilt app never rebuilds or installs developer tools. Native default setup installs no external bridges. `--check` reads local readiness without signing in.

Compatibility installation requires `--local-adapters` with `--browser`, `--tabbio`, `--integration google-cli|outlook-mcp|tabbio`, or `--all`. The last option explicitly installs all supported optional integrations and Chromium; an unsupported bridge is reported without blocking other selected recipes. Compatibility sign-in is an explicit `--local-adapters --login ID` action. Native sign-in belongs to the actual client. Scripts resolve paths from their own checkout, so another working directory does not create a second tracker database.

Optional binaries can be unavailable on an unsupported platform or when downloads are blocked. Inspect upstream platform requirements rather than substituting an unpinned download. Update reviewed versions and the lockfile together. A missing compatibility bridge does not require installing it for Native mode.

Default setup does not authenticate accounts. Only an explicitly requested compatibility `--login` can start provider sign-in, which still requires the user's consent. Setup does not send mail, start application runs, publish the repository or install start-at-login. CI uses isolated fixture databases and browser profiles without real account authentication. Passing it establishes local behavior, not production provider permissions or successful applications.
