# Connections in your actual client

The default **native** mode keeps every external connection in the selected
Codex or Claude Code client: Tabbio MCP/CV, email, calendar, browser/computer use
and the password manager. Tawdheef stores local guidance, selected scope,
non-secret reference metadata and evidenced outcomes. It does not create another
provider OAuth session or launch another model during native Run.

Connections keeps six familiar rows. **Assistant** chooses the client once.
**Tabbio CV** offers a create-CV link and a request to connect Tabbio MCP in that
client. **Email** and **Calendar** show provider choices, then a copyable setup
request. **Browser & computer use** checks those capabilities separately.
**Passwords** uses the person's existing supported browser/password manager.
Paste each requested setup task into the existing client conversation; sign-in,
trust, unlock and consent happen through that client's supported flow.

The native panels contain no tracker OAuth or password fields. The user never
needs to send secrets in a chat. An actual client may require its own supported
provider setup, account plan, app integration or approval; Tawdheef cannot grant
or bypass that access.

## What connection status proves

`get_native_client_status` returns the selected assistant's capability reports.
`report_native_connection` saves only bounded non-secret observations after an
actual client check: available/needs_you/unknown, observation time, provider/account
identity, CV reference/update metadata or selected calendar IDs. Available is
shown as **Client reported**, not independently verified Connected. Reports age
out after 24 hours; an expired report remains Unknown with its observation date.
A configured URL, saved username or report alone is not fresh provider access.

Actual `get_agent_context`/`get_capabilities` use is recorded separately as
**Tracker used**. It proves a local tracker tool call was observed, not an AI
model response, native browser/computer control, provider sign-in or a schedule.
The default Run does not require an installed assistant CLI or a CLI model test.

Use a fresh check in the actual client before acting. If a provider, trust rule,
identity prompt or missing tool blocks access, record one actionable **Needs you**
step. Checking a connection authorizes no applications, profiles, CV sharing,
messages, calendar writes or schedules.

## Primary email and career credentials

New career registrations use the fresh main account email actually observed
through the selected client's email tools. Never derive it from CV text or a
configured username. Reuse existing career accounts and their original login,
even when the current main mailbox differs. Do not create a mailbox or change
an account email to make a Run proceed.

Website passwords stay in the person's supported browser or password manager.
The person handles unlock, consent and identity prompts. Never export a vault,
request a master password, or put career passwords/recovery codes in tracker
records, prompts or logs. A non-secret manager reference and actual login email
may accompany confirmed account evidence.

## Native Run, email and submission evidence

Run snapshots the explicitly selected actions and company scope, then copies a
request to the existing client. The app waits; the client claims one saved target
at a time and uses its own authorized external tools. Form submissions still
require `prepare_form_submission` immediately before final Submit and a real
confirmation before resolution. Account/profile/CV milestones remain separate
from job applications.

For native mail, reserve the active company/send with `prepare_native_email`,
inspect `maySend`, send through the actual client only when authorized, then use
`resolve_native_email` with the actual provider receipt. An unknown result must
be inspected against the original send intent; never invent a fresh key to
bypass an unresolved outcome. A draft, filled form, saved record or opened page
is not proof that anything was sent or submitted.

**Stop** revokes Tawdheef authority. Stop remaining work in the actual client too;
the tracker cannot terminate another application's task.

## Optional original CV file

Under **Tabbio CV → Original CV for uploads**, save the original PDF or DOCX,
at most 10 MB, for sites that require a file. This optional local convenience
stores exact private bytes with a SHA256 and sanitized filename. It does not
verify CV facts or remove active content. Readable CV facts come directly from
the actual client's authorized Tabbio/CV source.

`get_cv_file` reads metadata. `prepare_cv_attachment` stages an existing file only
for an active authorized company/action. The actual client must have supported
file access and perform the authorized upload. Staging is not an upload or an
email attachment; missing files, tool limitations and client path restrictions
require the person. Never generate a replacement or invent a share/download URL.

## Browser, calendar and monitoring

A browser test does not prove OS computer control, employer sign-in or password
manager access. The setup request asks the actual client to inspect supported
tools and use only a blank page for its browser check. Preserve its normal
permissions and approval boundaries.

Calendar choices come from actual client-reported calendar IDs, not a tracker
provider reader. In [Monitoring](MONITORING.md), `check_updates` returns a bounded
`readRequest`; the actual client performs that exact read and returns fresh
`sourceRead` evidence and source-backed observations. Mail is limited to tracked
threads in their original provider/account; calendar reads use the selected ID
and at most the next 14 days. Missing/incomplete reads remain unknown/partial,
even when they produced no update records. No applications, registrations,
profile/CV changes, sending or calendar writes are authorized by monitoring.
The native client owns any separately requested local schedule. Saving settings,
copying instructions and recorded task reports do not independently verify it.

## Advanced compatibility: local adapters

The remainder of this guide applies only after an explicit Connections → Advanced compatibility → Tawdheef local adapters choice. These older app-owned providers and custom MCP bridges have separate local credentials. Existing private settings are preserved, but no native-client connection is automatically shared with this mode. App-owned Google/Microsoft sign-in uses state and PKCE; calendar grants are separate from mail. App-owned iCloud access uses an Apple app-specific password, never the main account password.

The tracker connects to an MCP server supplied by the user. Gmail and Outlook
are mailbox labels, not bundled provider credentials. An existing connection in
Codex, Claude Code or ChatGPT is not automatically available to this separate
local process. The background runner needs its own sign-in or a local MCP bridge
that already owns the sign-in.

The Tabbio default address is `https://server.tabbio.com/api/mcp`, as published in
[Tabbio's connection guide](https://www.tabbio.com/en/mcp). The app discovers the
actual tools after signing in. It makes no assumption about free-tier analytics,
per-company view attribution or permission to send through Tabbio.

## Setup

For native Google/Microsoft sign-in, create the appropriate desktop OAuth registration using [INTEGRATIONS.md](INTEGRATIONS.md), then enter or import its credentials under One-time setup. The callback is the app's actual loopback origin plus `/api/connections/email/oauth/callback` or `/api/connections/calendar/oauth/callback`; the default origin is `http://127.0.0.1:4000`. Preserve existing working registrations and sign-ins. The user completes consent in the provider page. iCloud Mail and Calendar instead use an Apple app-specific password, not the main account password.

Use `list_connections`, `configure_connection`, `connect_connection` and `get_connection_tools` through the tracker. An agent setting up a custom bridge must discover its real schemas and supported results, not invent an endpoint, tool name or permission. Preserve working configuration and local credentials. Setup never authorizes a test message or application, career-page work, CV editing or a schedule change.

For a remote server, enter its HTTPS MCP address. Leave the access token empty
to use the server's MCP OAuth discovery and browser sign-in. HTTP is accepted
only for a server on this computer. A bearer token is also supported when the
provider offers one. OAuth tokens retain the SDK's issuer binding and refresh
through the provider's normal OAuth flow.

For a local server, enter the executable, arguments and required environment
variables. The app starts the executable directly, without a shell. Do not put
tokens in command arguments. Use the environment object or the provider's own
private credential file. Only the SDK's safe default environment and explicitly
provided variables reach the child process.

Connecting performs the MCP handshake and lists all tool pages. It does not
read a CV, read a mailbox or send anything. The status becomes **Connected**
only after both handshake and tool discovery succeed. A sign-in redirect is
**Sign-in required**. A saved URL by itself is **Disconnected**.

## Tool mappings

Providers choose their own tool names and input schemas. Choose a discovered
tool and map its arguments instead of assuming Gmail, Outlook and Tabbio expose
identical APIs. Example for a fixture provider:

```json
{
  "sendEmail": {
    "tool": "fixture.send",
    "arguments": {
      "to": "{{to}}",
      "subject": "{{subject}}",
      "body": "{{body}}"
    }
  },
  "readThread": {
    "tool": "fixture.thread",
    "arguments": { "id": "{{threadId}}" }
  }
}
```

These are examples, not real provider tool names. The exact placeholder preserves
its type, including arrays and numbers. An embedded placeholder becomes text.
A missing value fails before calling the provider. Application and scheduling
code must validate the returned provider result, including `isError`, approval
requirements and actual submission evidence. A timeout is an unknown outcome,
not proof that a send failed. The connector never retries a write automatically.

The report sender supplies `to`, `subject`, `body`, `reportId` and `idempotencyKey`. Application sending also
supplies `role`, `companyId`, `applicationId`, `runId` and `idempotencyKey`.
Thread refresh supplies `threadId` and `applicationId`. Use the exact placeholder
names for the action; the tracker does not invent unavailable fields.

Thread refresh expects the provider or local MCP bridge to return this normalized
shape, directly as structured content or as JSON in a text result:

```json
{
  "replies": [
    {
      "id": "provider-message-id",
      "threadId": "recorded-thread-id",
      "from": "careers@example.test",
      "receivedAt": "2026-11-13T08:30:00Z",
      "body": "Example reply text"
    }
  ]
}
```

A `messages` array is also accepted when each incoming message sets
`isReply: true`. A provider-specific Gmail/Outlook response needs a bridge that
normalizes its fields; argument mappings alone do not transform the response.
Only the recorded thread, recipient/sender and valid incoming timestamps match.
Unmatched output does not prove that the company has not replied.

For application sends, `server/email-send.mjs` reserves an intent before calling
the provider. An arbitrary `id`, a draft, a pending approval, an error or plain
text alone is not a confirmed send. Standard receipts need a message ID plus a
sent/accepted/submitted marker, an explicit successful message receipt or Gmail's
`SENT` label. For another provider shape, configure the send mapping's receipt:

```json
{
  "receipt": {
    "messageIdPath": "delivery.messageId",
    "statusPath": "delivery.status",
    "successValues": ["sent", "accepted"],
    "threadIdPath": "delivery.threadId"
  }
}
```

These paths are relative to the parsed tool result, not the MCP envelope. An
unconfirmed result remains **Needs you** and blocks an automatic resend until
the existing application is reconciled. A receipt arriving after a run ends
still records the actual submission.

## Local credential storage

`connections.private.json` lives in the app's private data directory, outside
the served frontend. It contains the endpoint/configuration and sign-in needed
for unattended work. Unix files use mode 0600 and the directory uses 0700.
Windows relies on the user's profile/directory ACLs. The file is private local
storage, not OS-keychain encryption. Keep it out of Git, shared directories,
exports and public backups.

The public connection state omits tokens, environment values, OAuth client
secrets and command arguments. Provider stderr is drained without logging.
Known credential values are redacted from connection errors.

The app rereads saved connection settings so CLI configuration changes become
visible without restarting. While the web app is running, use its connection
routes as the single owner of active OAuth sessions; two independent processes
refreshing a provider's rotating token at the same instant may conflict.

Disconnect clears the app's stored bearer/OAuth credentials and disables
automatic reconnects. It retains the endpoint and mappings for later setup.
It does not revoke credentials at the provider or erase a local MCP bridge's
own sign-in. Revoke that access in the provider or bridge when needed.

## Server integration contract

```js
const manager = new ConnectionManager({ dataDir, baseUrl });
manager.list();                         // Sanitized state array
await manager.save('email', config);    // Save only; no provider call
await manager.connect('email');         // Handshake + discover tools
await manager.tools('email');           // Discovered tool definitions
await manager.call('email', name, args);
await manager.callMapped('email', 'readThread', context);
await manager.disconnect('email');
await manager.close();                 // Shutdown; retain sign-in
```

OAuth callbacks use `GET /api/connections/:kind/oauth/callback` and must call
`manager.oauthCallback(kind, query)`. The callback validates one-time state,
expires it after ten minutes, exchanges the PKCE code and then establishes a
fresh MCP connection. The UI should open a returned `authUrl` only as a direct
result of the user's Connect action.

Supported connection kinds are `email`, `tabbio` and `calendar`. Public statuses are
`not_configured`, `disconnected`, `connecting`, `auth_required`, `connected` and
`error`. Public state includes `kind`, `label`, `provider`, `configured`,
`canAutoConnect`, `transport`, endpoint/executable where present, `hasToken`,
environment key names, mappings, discovered tool count, last successful
connection time and the latest redacted error. `authUrl` is present only during
an interactive sign-in.

The connector tests use loopback HTTP and stdio fixtures. They do not authenticate
real mailboxes, submit applications or verify live Tabbio account behavior.

## iCloud Mail

Choose iCloud Mail in Connections. Supply the full mail address and an app-specific password from your Apple Account's Sign-In and Security page. The password stays in private local connection settings and never appears in public API results. Apple requires two-factor authentication for app-specific passwords.

The adapter uses Apple's fixed IMAP TLS endpoint `imap.mail.me.com:993` and SMTP endpoint `smtp.mail.me.com:587` with required STARTTLS and certificate verification. Connecting verifies both without sending. Sending reserves a durable intent first. Only a positive SMTP acceptance for the exact recipient counts as accepted, not delivered. An uncertain send is never repeated automatically. Reconciliation reads Sent for the original exact Message-ID, sender and recipient. Tracked reply checks read Inbox/Archive messages tied to that original ID, with bounded downloads; large or ambiguous messages require inspection in Mail.

Sources: [Apple iCloud Mail settings](https://support.apple.com/en-us/102525), [Apple app-specific passwords](https://support.apple.com/en-us/102654).

The iCloud send-intent ledger is private local tracking data, separate from OAuth/password storage. Disconnect removes credentials while retaining account-bound receipts so reconnecting the same mailbox can resume tracked reply checks. Operations have a total deadline and abort owned IMAP/SMTP sockets; an interrupted transmission remains unknown until inspected.
