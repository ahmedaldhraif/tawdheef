# Let your agent set up Tawdheef

Tawdheef is a local job-search directory and tracker. Find jobs that fit your
real CV and build career profiles for future opportunities. Your existing
**Codex or Claude Code client** supplies the model and every external connection.
Tawdheef supplies local scope, guidance, duplicate protection and evidenced results.
The app is free; your client and connected services may have their own costs.

## Get the app

Use a platform app or `tawdheef-VERSION-source.zip` from the
[GitHub releases](https://github.com/ahmedaldhraif/tawdheef-auto-apply-jobs/releases).
Extract the complete app before opening its launcher. App packages contain Node
and the browser interface; see [desktop release status](DESKTOP-RELEASE.md).
A country directory ZIP contains research data, not the app.

For a source checkout, install [Node.js 26 LTS](https://nodejs.org/en/download)
(patched Node 24 also works), then run:

```sh
git clone https://github.com/ahmedaldhraif/tawdheef-auto-apply-jobs.git
cd tawdheef-auto-apply-jobs
npm start
```

Start installs the locked core dependencies, builds the screen and opens the
local tracker. It does not sign into providers or start job-search actions.

<a id="give-your-agent-one-setup-request"></a>

## Connect the client you already use

Open **Connections → Assistant**, choose Codex or Claude Code once, then use
**Check setup**. Paste its request into your existing client conversation.
Use the local folder specified by the request; a packaged app keeps its writable
assistant workspace outside the installed app bundle. There is no app deep link,
embedded chat or automatic launch of another assistant in the default mode.

If you prefer a manual project-only setup, run `npm run agent -- codex` or
`npm run agent -- claude-code` in the source folder. These commands create the
local tracker MCP settings and skill, preserve custom settings, and require
normal client trust approval. They do not sign into an AI account. See
[QUICKSTART.md](QUICKSTART.md) for configuration and backup details.

A setup request can be:

> Set up Tawdheef in this local workspace using the Codex or Claude Code client I am using. Read AGENTS.md and docs/FIRST-RUN.md. Reuse working project settings and my actual client tools. Connect the local tracker MCP, then call get_agent_context, get_capabilities and get_native_readiness. Check the intended mailbox against the actual signed-in account, read my selected CV and identify a real upload file through your supported tools. Reuse the same working browser session and any supported password-manager access. Report only dated non-secret metadata, then check readiness again and guide only the missing step. Let me complete any required sign-in, trust, consent or unlock in the actual client. Do not copy credentials, browser profiles, vault contents or CV text into Tawdheef. Do not submit applications, create profiles, share a CV, send messages, change calendar events or create schedules during setup.

## Your part

1. **Connect your CV in your client.** Open **Connections → Tabbio CV** for
   **Create a CV in Tabbio** and its setup request. Reuse an existing account.
   Your assistant reads the real authorized CV through Tabbio MCP or your
   signed-in Tabbio website using its supported tools. A broken MCP connection
   does not invalidate a working, authorized browser route. You complete any
   required provider sign-in and consent in that client.
   Tawdheef stores reported reference/update metadata, not a copy of the CV text.
2. **Add the external tools you want.** Email and Calendar lead to provider
   choices and copyable requests. Browser & computer use checks those capabilities
   separately. Passwords uses your existing supported browser/password manager;
   you handle unlock and identity prompts. Availability depends on your actual
   client, account, installed tools and permissions. Check setup checks the
   selected work together. Calendar and password-manager access are optional;
   they do not block unrelated work. A new account may need an available mailbox,
   and an upload needs an actual PDF/DOCX file. Missing access has one next step.
3. **Set your search preferences, then choose companies.** Connections links to
   **Job preferences** for roles, locations and notes. Your agent reuses that
   brief; empty roles/locations mean unrestricted CV-backed matching. The dated UAE snapshot is bundled.
   Import other [directory packs](../directories/README.md) into a selected tab.
   Filter the list or check specific companies before Run; importing never applies.
4. **Choose the actions, then hand off Run.** Matching applications and career
   profiles start selected; CV-only email is off. Run saves those exact choices
   and targets and copies a request for your existing client. Paste it there.
   Tawdheef shows **Waiting for assistant** until that client claims work, then
   the current company and recorded outcomes. It does not start a CLI subprocess.

A profile/account/CV upload is useful progress but is not an application receipt.
Existing career accounts keep their original sign-in. New registrations use the
fresh main email observed by the actual client; never infer it from CV text.
Unknown send/form outcomes require inspection before retrying. LinkedIn actions
remain manual. Login, CAPTCHA, identity declarations and provider approvals may
need you. Ordinary CV-backed fields and selected actions should continue without
another generic approval when the client's tools allow them.

When a company needs help, the agent saves the exact step and the action needed.
Complete that step in the same browser/account, then continue in your agent.
For an ended Run, **Resume** starts a new explicit Run for that company with the
original selected actions and company scope. The agent inspects saved progress and
any uncertain submission before doing more work. It does not recreate an account
or repeat a submission simply because a Run stopped.

**Stop** revokes the local Run authority. Stop any remaining work in your client
too; Tawdheef cannot terminate another app's conversation or task. Restarting the
local app requires a fresh explicit Run for new sending authority.

For file-upload forms you may save your original PDF or DOCX, up to 10 MB, under
**Tabbio CV → Original CV for uploads**. This is an optional local convenience.
Saving/staging a file does not upload it, attach it to mail or publish it.

## Readiness and monitoring

Connections distinguishes **Unknown**, **Needs you** and dated **Client reported**
observations. A tracker tool-use timestamp proves that a local tool call was
observed; it does not prove model access, provider login, browser control or a
native schedule. Readiness uses these dated reports for the chosen actions.
Reuse fresh reports and working sessions; recheck when the account, CV, file,
client access or report freshness changes. Reports are never independent proof.
No installed assistant CLI is required for the default handoff workflow.

See [the Native workflow](NATIVE-WORKFLOW.md) for onboarding, routine work and
resuming a specific blocker. Client permissions and each website still determine
which actions can run unattended; Tawdheef does not remove their requirements.

In **Settings → Monitoring**, opt into specific read-only sources, choose the
scope and actual client-reported calendar IDs, then copy the schedule request.
Your client creates or manages its own local automation when you request it.
Saving preferences or copying a request does not create or verify a task.
The computer, client and Tawdheef must be available. Monitoring does not apply,
create profiles, upload/share CVs, send messages or change calendars.
See [MONITORING.md](MONITORING.md).


## Upgrading older installations

App-managed provider adapters and the managed assistant runner have been retired. Existing tracking, settings, private credential files and historical rules/results are preserved. These saved credentials and rules are inert: Tawdheef does not read their sessions or run their actions. Configure external connections in the actual Codex or Claude Code client. Do not copy tokens, passwords or vault contents into Tawdheef.
