# Connections in your actual client

The **native** app keeps every external connection in the selected
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

An optional contact email in the Email detail is a local address hint. It does
not select a sender, verify a connection or replace the fresh main-account
identity reported by the actual client. Existing saved values are preserved.

## What connection status proves

`get_native_client_status` returns the selected assistant's capability reports.
`report_native_connection` saves only bounded non-secret observations after an
actual client check: available/needs_you/unknown, observation time, provider/account
identity, CV reference/update metadata or selected calendar IDs. Available is
shown as **Client reported**, not independently verified Connected. Reports age
out after 24 hours; an expired report is Not checked with its observation date in Connection details.
A configured URL, saved username or report alone is not fresh provider access.

Actual `get_agent_context`/`get_capabilities` use is recorded separately as
**Local connection observed** in the Assistant panel, with dated Connection details. It proves a local tracker tool call was observed, not an AI
model response, native browser/computer control, provider sign-in or a schedule.
The default Run does not require an installed assistant CLI or a CLI model test.

Use a fresh check in the actual client before acting. If a provider, trust rule,
identity prompt or missing tool blocks access, record one actionable **Needs you**
step. Checking a connection authorizes no applications, profiles, CV sharing,
messages, calendar writes or schedules.

## Primary email and career credentials

**Copy setup request** in Connections combines the selected preparations in one
copyable request for the actual client. `get_native_readiness` compares the
intended contact email with the observed mailbox, and distinguishes readable
CV facts, an upload-ready file and browser or computer access. Calendar and
password-manager access are conditional. Fresh observations can be reused until
their account, CV version, file, access or freshness changes. The app performs
no provider probe. See [the Native workflow](NATIVE-WORKFLOW.md).

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


## Upgrading older installations

App-managed provider adapters and the managed assistant runner have been retired. Existing tracking, settings, private credential files and historical rules/results are preserved. These saved credentials and rules are inert: Tawdheef does not read their sessions or run their actions. Configure external connections in the actual Codex or Claude Code client. Do not copy tokens, passwords or vault contents into Tawdheef.
