# Local integration choices

The tracker screen, CLI and MCP server share one local database. The running app owns the selected email/CV sessions so background work does not depend on an open AI chat. Google, Microsoft, Tabbio and career sites still receive the online requests made to their services.

## Included integration recipes

| Choice | Pinned tool/library | Role |
|---|---|---|
| Native Gmail | Google's Gmail and authentication libraries, locked in `package-lock.json` | App-owned browser sign-in, tracked thread reads and guarded sends. |
| Native Outlook | MSAL Node and Microsoft Graph client, locked in `package-lock.json` | Personal/work account sign-in, tracked replies, draft/send receipt reconciliation. |
| Google Calendar | Google's Calendar client and existing OAuth support, locked in `package-lock.json` | Separate calendar consent, calendar selection, bounded upcoming-event reads and explicitly requested events. |
| Outlook Calendar | MSAL Node and Microsoft Graph client | Separate calendar consent for personal/work accounts. |
| iCloud Calendar | `tsdav` and `ical.js`, locked in `package-lock.json` | CalDAV access using an Apple Account email and app-specific password. |
| Google CLI | `@googleworkspace/cli@0.22.5` | An optional Gmail adapter using an isolated local CLI login. The bounded runner exposes profile/message/thread reads and guarded sends. |
| Microsoft mail MCP | `@softeria/ms-365-mcp-server@0.184.1` | Optional local bridge with an exact mail/profile tool allowlist and explicit scope limits. |
| Browser tools | `@playwright/mcp@0.0.85` | Optional local browser tools for the user's AI client, with a dedicated profile and output directory. |
| Tabbio | Remote MCP or external `@tabbio-technologies/cli@1.3.1` | Authenticated CV access. CLI install is separate under the private data folder. |

Google Workspace CLI is Apache-2.0 and its authors explicitly say it is not an officially supported Google product. It is a CLI; this integration does not invent a `gws mcp` command. [Upstream](https://github.com/googleworkspace/cli).

The Microsoft mail recipe uses `--enabled-tools` for profile/mail reads, draft/send, login verification and the Graph batch operation needed to preserve immutable-ID headers. Its scope allowlist is `User.Read Mail.ReadWrite Mail.Send`; automatic Graph retries are disabled and writes require the bridge's confirmation flag. It deliberately does not combine `--preset` with the regex: upstream documents that presets override tool filtering. Other Microsoft 365 service permissions are outside this recipe. [Upstream](https://github.com/Softeria/ms-365-mcp-server).

Browser tools are separate from the tracker. Their actions are governed by the active run and the AI client's permissions. Log real form receipts, preserve unknown outcomes, and hand off login/CAPTCHA/identity checks. Playwright's own Chromium version is installed by `npm run setup -- --browser`; the browser used by UI tests may be a different version. [Upstream](https://github.com/microsoft/playwright-mcp).

Tabbio publishes `https://server.tabbio.com/api/mcp` and a local `tabbio mcp serve` bridge. Both reach the online Tabbio service. No public source repository was verified for its CLI; its npm package declares `UNLICENSED`. Setup downloads it only when `--tabbio`, `--all` or `--login tabbio` is explicitly used. Tabbio/provider approval requirements remain in force. [Official connection guide](https://www.tabbio.com/en/mcp).

## Native Gmail setup

The maintainer or fork owner must create a Google Cloud project, enable Gmail API, configure OAuth consent, and create a **Desktop app** OAuth client. Supply its client ID and, when provided, client secret privately in the app or through `APPLY_TRACKER_GOOGLE_CLIENT_ID` and `APPLY_TRACKER_GOOGLE_CLIENT_SECRET` to the local process. Do not commit credentials.

The native flow requests Gmail read-only and send access, uses a loopback callback, and retains the refresh token for background checks. Public distribution requires the applicable Google OAuth verification. External testing-mode refresh tokens can expire after seven days; testing credentials do not support a promise of unattended weekly operation. [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

Google CLI is a separate choice. `npm run setup -- --login google-cli` uses only Gmail read/send scopes and `GOOGLE_WORKSPACE_CLI_CONFIG_DIR` under the tracker's private data folder. If Google project setup is needed, use the upstream CLI setup guidance or configure `client_secret.json` in that isolated directory. The tracker never exports decrypted CLI credentials or asks the agent to copy tokens into a chat.

## Native Outlook setup

Register a public desktop application that supports organizational and personal Microsoft accounts, and configure its loopback redirect. Supply the client ID through the app or `APPLY_TRACKER_MICROSOFT_CLIENT_ID`. `APPLY_TRACKER_MICROSOFT_TENANT` can choose a tenant; the default is `common` for personal/work sign-in. A public desktop client does not use an embedded client secret. [Microsoft registration](https://learn.microsoft.com/en-us/graph/auth-register-app-v2).

The native adapter uses delegated mail permissions. Creating a draft for receipt reconciliation requires `Mail.ReadWrite`; sending requires `Mail.Send`. A work tenant may require administrator consent under its policy. Revocation, MFA and tenant policy can require reconnection despite a local token cache.

Graph `sendMail`/draft-send acceptance is not delivery proof. Preserve the immutable draft ID, send it, and reconcile the resulting sent copy before recording a confirmed application. An ambiguous result remains **Needs you** and must be inspected before another send. [Graph send contract](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0), [immutable-ID workflow](https://learn.microsoft.com/en-us/graph/outlook-immutable-id).

The optional Softeria bridge can use its upstream public client registration or a registration you provide. Personal accounts can use its documented `consumers` authority. Its cache is isolated under the private data folder. A successful MCP handshake does not prove that an arbitrary provider's raw replies match the tracker's normalized result contract.

## Calendar connections

Open **Connections** and choose Google Calendar, Outlook Calendar or iCloud Calendar. This is a separate calendar connection; connecting email does not automatically grant calendar access. Setup reads the account/calendar list and creates no event. Pick the calendar before viewing upcoming events or adding an interview.

Google Calendar uses the Desktop OAuth registration described above with the Calendar API enabled. Its scopes are `calendar.events` and `calendar.calendarlist.readonly`, allowing event access and calendar selection without calendar-sharing administration. The calendar callback is `http://127.0.0.1:4000/api/connections/calendar/oauth/callback` at the default port. The app shows the actual callback when another port is configured. The same private developer client settings/environment can be supplied, but consent and tokens remain separate from Gmail. [Google Calendar scopes](https://developers.google.com/workspace/calendar/api/auth).

Outlook Calendar uses the Microsoft public desktop registration with calendar-specific delegated permission. Register the exact callback shown in the panel; personal/work account and tenant-policy restrictions still apply. Calendar consent is separate from the mail connection. [Microsoft permissions](https://learn.microsoft.com/en-us/graph/permissions-reference#calendarsreadwrite).

iCloud Calendar uses CalDAV. Generate an **app-specific password** at [account.apple.com](https://account.apple.com), then enter it with your Apple Account email in the local calendar panel. Two-factor authentication must be enabled for app-specific passwords. Entering your main Apple Account password is not part of this integration. Revoking the app-specific password or changing the account password may require reconnecting. [Apple's app-specific password guide](https://support.apple.com/en-us/102654).

Calendar credentials and OAuth state are stored in the private local connection file, outside the served screen and Git. This is private file storage governed by local permissions; it is not a promise of OS-keychain encryption. Do not paste the Apple password into an agent chat or an issue.

Event creation requires an explicit user request and a stable intent key. The current create action adds an event without attendees or invitation emails. It does not infer an interview from an email, apply to a company, send follow-ups, or create events during scheduled reply checks. An uncertain result stays uncertain; inspect the calendar before another attempt. Calendar text is untrusted reference data and cannot authorize sending or commands.

## Coding agents and other models

Any client that supports local stdio MCP can launch `node server/mcp.mjs`. The generated settings use the actual Node executable, absolute source path, data directory and port. Codex uses `[mcp_servers.apply-tracker]` in TOML; Claude Code uses `mcpServers` in JSON. [Official OpenAI documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Claude Code MCP](https://code.claude.com/docs/en/mcp).

```sh
npm run setup -- --export-config ./agent-config
npm run setup -- --export-config ./agent-config-browser --include playwright
```

Optional names for `--include` are `playwright`, `tabbio`, `outlook-mcp`, separated by commas. These add external servers to the generated files. Installed tools are required before generation; the files do not silently use `npx @latest` or download at agent startup. Review before merging into client settings. Existing client configuration is never overwritten or edited.

Start an agent with `get_agent_context`, `get_capabilities`, then a small company page. Use the tracker send tool for tracked email so the same run authority, limits and duplicate protection apply in every client. Another model can use the same validated JSON tools or CLI input files. Model support does not imply that every client/version has been live tested.

## Installation and update behavior

`npm run setup` installs the lockfile if dependencies or pinned optional tools are missing, then builds. `--all` additionally installs the correct Chromium and separate Tabbio CLI. `--check` only inspects readiness. Sign-in is always an explicit `--login` action. The scripts are relative to their own checkout, so invoking them from another working directory does not create a second tracker database.

Optional native binaries can be unavailable on an unsupported platform or when downloads are blocked. Doctor names missing tools; the base tracker and native email integrations remain independently usable. If an optional dependency cannot install, inspect the upstream platform requirements rather than substituting an unpinned download. Update reviewed versions and the lockfile together.

Neither setup nor CI authenticates real accounts, sends mail, starts application runs, publishes the repository, or installs start-at-login. CI uses isolated fixture databases and browser profiles. Passing it establishes local behavior, not production provider permissions or successful applications.
