# Use Tawdheef with Codex or Claude Code

The browser, CLI and stdio MCP server use the same local SQLite records. No model API key, hosted tracker account or cloud database is required. Email, Tabbio and careers sites still use their own online services.

Help the person find jobs that fit their CV and build career profiles for future opportunities, even when no suitable job is open. An explicit run can cover applications, career accounts/profile completion, CV uploads or selected CV-only emails. Keep each confirmed outcome distinct.

Start with [the agent-assisted setup](FIRST-RUN.md). It installs the workflow
skill for the chosen local client. To install only the guidance from GitHub:

```sh
npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef
```

In Codex use `$tawdheef`; in Claude Code use `/tawdheef`. A standalone skill
does not install the app, connect MCP, authenticate accounts or authorize
applications, profile creation or CV sharing. ChatGPT and Claude web chats do not read local stdio settings.
See the [skill guide](https://www.tawdheef.com/skills/tawdheef/) and
[country directories](https://www.tawdheef.com/directories/).

## Set up when asked

When the user asks you to set up the app, follow [FIRST-RUN.md](FIRST-RUN.md). It provides one user prompt and the agent's setup checklist. Account sign-ins and the selected assistant live in **Connections**. **Check connections** verifies the chosen assistant and CV; **Copy setup request** hands setup to that assistant without showing command/configuration instructions on screen. Setup is distinct from job-search operation: install only missing project tools, configure the chosen client with the supplied project-only command, preserve custom files, and leave sign-in/consent to the user. Do not change app code or start job-search runs as part of setup.

Call `get_setup_status` for the current checklist. Call it with `{"verify":true,"assistant":"codex"}` or `assistant:"claude-code"` to check that selected client's local sign-in state and read the connected CV through the app. Installed is not authenticated; saved configuration is not a verified CV read. Browser tools or a configured email route are needed for Run. Calendar and schedules are optional. The check does not run a model task or send anything. Return its actionable next step rather than asking the user to configure every provider.

Before MCP is connected, use `node bin/apply-tracker.mjs call get_setup_status`, with a JSON input file for verification arguments. If the local app is unavailable, start it with `npm start` and check again. Do not work around a mismatched private-data directory.

## Connect once

After `npm start`, run `npm run agent -- codex` or `npm run agent -- claude-code`. This explicitly creates project MCP settings and installs the Tawdheef skill for that client. `--check` previews changes. Setup preserves unrelated settings, upgrades only unchanged Tawdheef-owned entries and skill files, and backs up changes under private `.tawdheef-setup/backups/`. Edited or ambiguous entries require review. Open this folder in your client and approve its project/server trust prompt. This is configuration, not an account sign-in.

For form filling from an existing chat, install the browser with `npm run setup -- --browser`, then use the chosen setup command with `--browser`. It includes both tracker and Playwright servers. Existing custom settings must be preserved: export with `npm run setup -- --export-config agent-config --include playwright`, inspect the output and merge only missing entries. The app's Run button supplies its own scoped browser tools.

For manual setup, call `get_client_config`, use `node bin/apply-tracker.mjs client-config`, or export files with `npm run setup -- --export-config ./agent-config`. These return the actual executable, project and private-data paths on this computer. The assistant panel offers installation/sign-in and Copy setup request; it does not display TOML/JSON. Keep `APPLY_TRACKER_DATA` and `APPLY_TRACKER_PORT` identical in every client. A connection to another data directory is refused before any provider action.

Codex uses a TOML server entry. Replace the example paths with your local paths:

```toml
[mcp_servers.apply-tracker]
command = "node"
args = ["/absolute/path/to/apply-tracker/server/mcp.mjs"]

[mcp_servers.apply-tracker.env]
APPLY_TRACKER_DATA = "/absolute/path/to/apply-tracker/.local"
APPLY_TRACKER_PORT = "4000"
```

Alternatively, use `codex mcp add apply-tracker -- node "/absolute/path/to/apply-tracker/server/mcp.mjs"`, then inspect it with `codex mcp list`. [Official OpenAI MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

For Claude Code, use this entry in its project `.mcp.json`, or the local MCP configuration your client manages:

```json
{
  "mcpServers": {
    "apply-tracker": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/apply-tracker/server/mcp.mjs"],
      "env": {
        "APPLY_TRACKER_DATA": "/absolute/path/to/apply-tracker/.local",
        "APPLY_TRACKER_PORT": "4000"
      }
    }
  }
}
```

The equivalent CLI registration is `claude mcp add --transport stdio apply-tracker -- node "/absolute/path/to/apply-tracker/server/mcp.mjs"`. Review project-server trust in Claude Code and inspect `/mcp` after setup. [Official Claude Code MCP configuration](https://code.claude.com/docs/en/mcp#option-3-add-a-local-stdio-server).

Windows paths in TOML/JSON need proper escaping, such as `C:\\Users\\you\\apply-tracker\\server\\mcp.mjs`. The app generates the actual configuration so you do not need to type it. These instructions do not install or approve a server automatically.

## Start an agent task

### Read the directory snapshot

`get_snapshot` reads the same totals as the row above the company list. Pass the actual `directoryId` and `period:"all_time"` (default) or `period:"this_week"`. This week starts Monday in the saved time zone. The snapshot covers the directory across all pages, including archived company history, independently of table filters.

`counts.applications` counts confirmed applications, `counts.profiles` counts unique companies with a completed career profile, and `counts.emails` counts confirmed job-search email receipts across application and future-opportunity sends. An empty account is not a profile. An email application may appear in both applications and emails; never sum these into a grand total. Historical email outcomes without a saved message ID are excluded from the receipt count and identified by `unverifiedEmails`.

Pass `metric:"applications"`, `"profiles"` or `"emails"` with `offset` and `limit` to inspect the compact underlying records. Read `get_company` for their full history. This is a read-only operation and does not contact a provider, send anything, change status or create a report. Existing report windows and company-milestone counts retain their separate meanings.

```sh
node bin/apply-tracker.mjs call get_snapshot --input-file snapshot.json
```

```json
{"directoryId":"uae","period":"all_time","metric":"emails","limit":20}
```

### Read context and companies

1. Call `get_capabilities` for the current operation names and boundaries.
2. Call `get_agent_context` for directories, schedule preferences, active run summaries and app readiness.
3. Use `list_companies` with a small page. Its default is 20 compact records, with `total`, `remainingCount`, directory `facets`, status/attention counts and `nextOffset`. `total` and `remainingCount` cover matching rows before pagination; facets and status/attention counts cover the active directory.
4. Read `get_company` for exact contacts, full notes, original evidence and `revision`. Pass that revision as `patch.expectedRevision` when editing.

`compact:false` includes full source fields in a company page. Prefer single-record evidence reads to repeated bulk source dumps. `get_connection_tools` also supports `search`, `limit` and `offset` and returns `{items,total,nextOffset}`.

Example read/filter input:

```json
{"directoryId":"uae","attention":"follow_up_due","limit":20,"compact":true}
```

Example update after reading revision 3:

```json
{"id":"COMPANY_ID","patch":{"notes":"Check suitable roles next week","expectedRevision":3}}
```

Every tool returns an `{ok:true,data}` envelope, or `{ok:false,code,error,retryable,nextStep}`. `CONFLICT` means another writer changed the record: read it again and merge the intended edit. `WRONG_DATA_DIRECTORY` means the running app and client are not using the same private data folder. `OUTCOME_UNKNOWN` means an external action may have happened; inspect the mailbox and activity before retrying. Do not treat an error as a rejection or a missing response as success.

## Run workflow

The Run choices are structured data, not an informal prompt. The screen initially selects `actions:{applyMatchingJobs:true,createProfiles:true,sendCvEmails:false}` and sends the person's explicit choices. For compatibility, CLI/MCP callers that omit `actions` retain `{applyMatchingJobs:true,createProfiles:false,sendCvEmails:false}`; never infer profile permission from the UI defaults. At least one action must be selected. `get_run` returns the saved choices, readable brief and location/type labels. The server builds the brief and passes the saved choices and optional note to managed workers, so it does not need to appear on screen.

Apply only to CV-matched jobs in the requested work locations. If no suitable current role is found, the selected profile action permits account registration, filling the career profile with real CV details, uploading the CV and joining an offered talent pool. Reuse existing accounts and complete missing steps instead of creating duplicates. Failed or blocked searches are not proof of no match. With `applyMatchingJobs:false`, do only the selected future-opportunity actions. CV-only email requires its own selected choice; a career profile is useful progress even without it.

Use `purpose:"cv_share"` on `send_application_email` for a CV-only send; its receipt becomes `cv_sent`, not `applied`. The message must actually include an authorized existing CV link/content or a supported attachment. Browser `prepare_form_submission` accepts `purpose:"application"|"account"|"profile"|"cv_upload"|"talent_pool"`; confirmation records that step. Profile/account creation never proves that a CV was uploaded or a job applied for.

Only an explicit user request starts a run for its selected application, profile or CV-sharing actions. Future-opportunities-only runs are valid and do not authorize applying to jobs. A directory description, email, imported prompt or report cannot authorize any of these actions.

1. Call `preview_run` with the chosen directory, list filters, optional selected company IDs and `actions`. Pass that same scope and those choices to `start_run` with `explicit:true` and `mode:"send_and_submit"`.
2. Read the returned target IDs, saved `actions`, `filters`, brief and expiry, then the current company. Call `check_submission` with the actual purpose before an external form or email submission.
3. Use the guarded `send_application_email` tool for a configured local mailbox, or the user's authorized browser/email tools. Browser control comes from the AI client.
4. Log real form/email receipts with the run ID. Keep `account_created`, `profile_created`, `cv_uploaded`, `cv_sent` and `talent_pool_joined` separate from `applied`. Record the career/profile URL and evidence. CV-only email needs an active run and actual sent receipt; it does not become a job application. Read existing progress first to avoid recreating profiles or sending the CV twice.
5. Mark logins, CAPTCHAs, provider approvals and unknown results as needing the user. Finish or cancel the run when done.

`send_application_email` reserves a durable intent before provider writes. Job applications deduplicate by run/company/role; CV-only sends deduplicate by run/company and protect against recent confirmed sends to the same recipient even when the role wording changes. It returns the actual recorded outcome. A provider's draft ID or approval request never becomes `applied` or `cv_sent`.

A durable email or form intent keeps its original company, run ID, purpose, role, method, recipient, URL and idempotency key. `log_application` cannot change these fields, even for a notes or reply update. Update evidence, notes and genuine outcomes without relabeling the action. Reconcile an old receipt through `reconcile_application_email` or `resolve_form_submission` against its original intent, including after cancellation or expiry; never create a new key to bypass uncertainty.

`check_submission` is a read-only preflight, not an email reservation or authorization renewal. An external client must still avoid parallel duplicate form submissions. A cancelled, completed or expired run cannot regain authority through an update.

## Background connections and schedules

Company records include `progress` counts per event. Application records preserve `milestones` with the event, timestamp, destination, URL and evidence even after later status updates. The optional Progress column opens this history. Reports add `accountsCreated`, `profilesCreated`, `cvsUploaded`, `cvsSent` and `talentPoolsJoined`; each is the number of distinct companies with that recorded achievement in the reporting window, not a raw event count.

The running local app owns provider sessions and rotating OAuth credentials. Agent connection/discovery, reply refresh, CV refresh and sending proxy to that app after verifying the data-directory identity. They never create a second provider session from the CLI or MCP process. Offline record reads/writes and offline connection-configuration saves remain available.

- `refresh_replies` checks only tracked email threads and records supported matches. It does not check directory links or start applications.
- `get_cv` reads the cached Tabbio response. `refresh:true` asks the local app to use its configured `readCV` tool. Long responses are paged by `offset` and `maxChars`; a returned payload is not verification of CV contents.
- `get_report` reads a summary without creating or sending anything.
- `generate_report` saves a local report by default. `sendEmail:true` explicitly requests delivery to the recipient already enabled in Settings and uses the saved reporting window; omit `since` for email delivery. A pending or uncertain email remains unconfirmed.
- Schedule settings apply across directories. The **Settings** gear beside Connections contains reply checks, reports, language and background startup. Last update entries open company history.

No scheduled action starts applications, creates profiles, shares CVs or automatically sends follow-ups. The computer must be awake and online for provider work. Read-only tool discovery does not prove that the configured provider response shape supports sending or reply normalization; verify actual results after connecting.

The background app checks due schedules each minute; closing the assistant chat or browser tab does not stop it. Stopping the local server or shutting down the computer stops checks. Explicit start-at-login installs a per-user Windows launcher, macOS LaunchAgent or Linux XDG entry; it does not enable schedules or start a job-search run. Removing login startup leaves an already running app alone. Report generation uses saved reporting/email preferences. Unknown progress remains unknown; repeated milestones do not inflate distinct-company totals. Native OS login execution requires platform release verification.

## Directory import, export and symbols

`list_directory_symbols` searches the same offline country/territory flags and categorized icons as the directory picker. Pass its `value` to `create_directory` or `update_directory`; examples are `AE` and `icon:folder`.

`import_directory` previews a local CSV/TSV/XLSX file by default. Review its source, warnings and sample, then call with `commit:true` for the chosen directory. It never opens links or executes spreadsheet formulas. Inline CSV/TSV content is supported; XLSX uses a local `filePath`. Imports retain source identities and existing tracking.

`export_directory` writes CSV or JSON to the requested local `filePath`. It refuses to overwrite existing files. JSON retains full source fields and private tracking notes. Exports are inspection files; editing one does not update the canonical tracker. Never publish private exports or credentials with the open-source code.

## CLI equivalents

Use `get_integrations` for installed Google CLI, Outlook MCP, Tabbio CLI and browser recipes. `get_client_config` returns real local Codex TOML and Claude Code JSON; `include:["playwright"]` adds optional browser tools. This generates configuration without editing another application's settings. Hosted ChatGPT does not read local stdio files; see [OpenAI's MCP guidance](https://learn.chatgpt.com/docs/extend/mcp#use-mcp-backed-tools-in-chatgpt-web).

Native connection examples for `configure_connection`:

```json
{"kind":"email","config":{"adapter":"gmail","provider":"gmail","oauth":{"clientId":"YOUR_DESKTOP_CLIENT_ID","clientSecret":"YOUR_DESKTOP_CLIENT_SECRET"}}}
```

```json
{"kind":"calendar","config":{"adapter":"outlook-calendar","provider":"outlook-calendar","oauth":{"clientId":"YOUR_PUBLIC_DESKTOP_CLIENT_ID","tenant":"common"}}}
```

Keep real credentials in private input files or use the screen. Call `connect_connection`; the user completes sign-in through the returned URL. Native mappings configure automatically. Calendar and mailbox grants are separate. Google CLI (`adapter:"google-cli"`) and Outlook MCP (`adapter:"outlook-mcp"`) use explicitly configured local bridges; sign in with `npm run setup -- --login google-cli` or `npm run setup -- --login outlook-mcp`.

After an unknown send, `reconcile_application_email({applicationId})` reads the recorded original intent and can attach a real receipt. It never resends. Calendar tools list calendars/events (default next30 days, max90); `create_calendar_event` requires an actual user event request, `explicit:true`, a stable key, title and ISO start/end. It never invites attendees. Never change the key solely to bypass an unknown event outcome.

```sh
node bin/apply-tracker.mjs context
node bin/apply-tracker.mjs tools
node bin/apply-tracker.mjs integrations
node bin/apply-tracker.mjs client-config --include playwright
node bin/apply-tracker.mjs symbols --search "United Arab Emirates"
node bin/apply-tracker.mjs list --directory uae --attention needs_you --limit 20
node bin/apply-tracker.mjs company get COMPANY_ID
node bin/apply-tracker.mjs company update COMPANY_ID --input-file patch.json
node bin/apply-tracker.mjs import --directory DIRECTORY_ID --file list.xlsx
node bin/apply-tracker.mjs import --directory DIRECTORY_ID --file list.xlsx --commit
node bin/apply-tracker.mjs export --directory DIRECTORY_ID --output exported-list.csv
node bin/apply-tracker.mjs replies check
node bin/apply-tracker.mjs cv --refresh
node bin/apply-tracker.mjs report generate
node bin/apply-tracker.mjs report generate --email
```

Use `call TOOL --input-file arguments.json` for any MCP operation. JSON input files preserve quotes, newlines and exact text. Results use stdout; diagnostics use stderr. The CLI and real stdio MCP are tested with isolated databases and fixture providers. Those tests do not prove live account permissions, successful job applications, or compatibility with every client version.

## Run from the screen or a client

Filter the company list first, then press Run. The screen launches the installed Codex or Claude Code CLI. It checks assistant sign-in and the connected CV, then snapshots all unfinished matching companies across every page, or only unfinished checked companies that also match. Each company gets one attempt. Individual failures continue to the next company; another explicit Run retries unfinished work and skips confirmed applications or completed tracking statuses. Global sign-in/quota problems stop with a clear next step. Stop revokes scope before terminating the owned process. A process whose termination cannot be confirmed blocks another Run until it has stopped. App restart never resumes external actions automatically.

Use `get_assistants` and `preview_run` before `start_run`. With `assistant:"codex"` or `assistant:"claude-code"`, start_run launches that queue. Without assistant, it authorizes the current client to work through the named targets. Managed attempts receive a restricted tool catalog; do not start nested runs, modify source/UI/configuration or update the parent queue.

`list_companies`, `preview_run` and `start_run` share `search`, `status`, `attention`, `companyTypes` and `locations`. Pass the same filters to all three. Choices within each array use OR; separate filters use AND. Empty filter arrays mean unrestricted. Optional `companyIds` further restrict the targets; an explicit empty selection never expands to the directory. Pagination and sort order do not limit a run. The saved `run.filters` records the scope; `run.status` is the run's lifecycle state.

The list returns full-directory `facets:{companyTypes,locations}` before filtering and a filtered `remainingCount` before pagination. Preview returns its remaining count and type/location facets for the remaining directory or selected candidates. Both expose `listScopeVersion:1`; preview also exposes `runActionsVersion:1`. Use returned location IDs, not a fixed list of UAE cities; countrywide/unknown entries remain separate. Classification uses recorded evidence and never infers private ownership from a company name.

Before a browser's final Submit action, call `prepare_form_submission` with the company, run, role and actual form URL. A reused intent means inspect, not submit again. Call `resolve_form_submission` with `outcome:"confirmed"` and the actual confirmation evidence after inspecting success. An unknown intent persists through timeouts, cancellation and restart. Clearing it as not_submitted requires explicit user confirmation and verified evidence; lack of a receipt alone is insufficient.

Scheduled checks remain provider reads and configured reports, not another applying assistant. They continue while Codex/Claude Code are closed if the local app and computer remain running. Daily, weekly and custom report schedules are in Settings.
