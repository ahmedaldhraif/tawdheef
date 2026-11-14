# Local connections

The app supports native Gmail/Outlook/iCloud mail, separate Google/Outlook Calendar OAuth, and iCloud Calendar through CalDAV. Open **Connections** for provider rows and account setup. Each user owns their registrations and account sign-in; this repository has no shared keys. Native adapters provide normalized mappings automatically. See [QUICKSTART.md](QUICKSTART.md) and [INTEGRATIONS.md](INTEGRATIONS.md) for real setup steps, scopes and the optional Google CLI/Outlook MCP/Tabbio/browser tools.

Connections shows account actions, credential fields and observed status. **Copy setup request** copies the setup task for the person to paste into the selected assistant; technical explanations belong in these guides. Native OAuth fields stay under **One-time setup**, and custom endpoints or mappings stay under **Advanced setup**. Enter secrets only in the private local form or a private input file, never in an assistant chat. Only one mailbox and one calendar connection are active at a time; their permissions remain separate.

The app's Run needs a readable connected CV and a signed-in assistant. Email and calendar are optional. Use **Check connections** to verify assistant sign-in and a fresh CV read; a saved connection or installed executable alone is not proof of readiness. The check does not send applications, create career profiles, send email or create calendar events. A successful CV read confirms access, not the accuracy of its contents.

The following sections describe custom MCP connections, which remain available under Advanced. Native providers use the same private storage and single-owner background process. Native account sign-in uses one-time state and PKCE; calendar grants are separate from mail. iCloud requires an Apple app-specific password; no main account password belongs in the app.

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
