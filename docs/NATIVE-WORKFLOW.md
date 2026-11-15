# Set up once, continue in your agent

Tawdheef keeps the job-search plan, progress and submission evidence on your
computer. Your existing Codex or Claude Code client reads the CV, uses the
browser and mailbox, and completes the work. It keeps those connections and
their credentials. The local app is the shared view of the same work.

## First use

1. Open Tawdheef and choose your actual client in **Connections → Assistant**.
   Connect the local tracker MCP with the supplied project-only setup request.
   Keep unrelated client settings and existing accounts.
2. Use **Check setup** in Connections and paste its request into that client.
   The agent inspects what already works and guides only missing access.
3. Confirm the intended mailbox. The agent compares it with the account its
   actual mail or browser tool observes. A Gmail plugin and a browser tab can
   expose different accounts. Availability in one does not prove the other.
4. The agent reads the selected real CV and identifies its source and version.
   It obtains a real upload file through supported export/file tools when
   needed, or you can select the original PDF/DOCX under Tabbio CV. Readable
   facts and an upload file are separate capabilities.
5. The agent reuses a working browser session. Browser or computer access can
   support the work; both are not required. Calendar and password-manager
   access remain optional. Password operations depend on the actual client's
   supported tools, rules and any required unlock.
6. Set the search brief under **Job preferences**: roles, job locations and any
   notes such as the employer types to consider. Connections links to the same
   Preferences form. The agent reads these saved preferences before matching.
   Empty roles/locations mean unrestricted; they do not mean missing CV facts.

Onboarding guides the person through missing choices once. The agent should
reuse an existing brief, or bundle any useful questions together rather than
asking again for every company. Saving preferences does not start a Run or
authorize sending. Company filters and the explicit Run still set its targets.

One check covers these preparations. Fresh reports can be reused; changing the
account, CV version, upload file or client access requires the relevant recheck.
Reports expire. Tawdheef labels them as client-reported and does not independently
sign into providers to verify them. Setup never starts job-search actions.

Tabbio MCP is useful but a supported, signed-in Tabbio browser can also provide
the authorized CV. Record the method actually used. Do not repeatedly reconnect
a working account just because a different route is unavailable.

**Passwords** guides the actual client's credential handling. Reuse existing
accounts and their original logins. Where that client permits creating and
saving credentials through a supported manager, use a unique password per site.
Keep only the non-secret account email and career/account reference in the
journey. Tawdheef has no shared-password preference and stores no passwords or
vault contents. A required unlock or unsupported credential step is a specific
handoff, not a reason to ask the person to complete every profile manually.

## A normal Run

Choose companies and actions in the app, or explicitly request them in your
existing agent conversation. Matching jobs and career profiles are independent
choices. CV-only emails stay off unless selected. The app saves the scope and
provides one handoff; it does not launch another assistant.

The agent then:

1. Reads the saved Run and claims one company.
2. Inspects the company's saved journey, account/profile progress and original
   submission intents. It reuses an existing account with its original login.
3. Checks actual vacancies and compares requirements with the current CV.
   Required unknown facts remain unknown. An unavailable page does not prove
   that no suitable jobs exist.
4. Performs the selected routine steps using its own authorized tools: account
   steps where supported, CV-backed profile fields, original-file uploads and
   suitable applications. Profile work remains useful when no job is open.
5. Reserves each form/email action before final submission and records the real
   confirmation. It saves separate account, profile, upload and application
   milestones, then continues to the next company.

The initial explicit Run covers its saved routine actions. Do not ask for a
generic approval at each company. Client-required approvals, new credentials,
consent, CAPTCHA, identity checks and declarations still keep their applicable
requirements. Full computer access does not grant an unauthenticated website
session or remove those requirements.

## When something needs you

A useful handoff names the company, exact step, blocker and one action. For
example: “MOIAT: sign in in the existing browser tab, then continue the profile.”
It should not ask the person to do a whole profile because one sign-in is missing.
Use a blocker only after observing it; do not presume every registration needs
manual work. Attempt ordinary authorized steps when supported by the client.

The agent saves a bounded checkpoint containing the stage, actual career URL,
non-secret account identity, next step and original intent reference where
relevant. It never saves passwords, verification codes, cookies, OAuth links or
CV text. A checkpoint is a continuation note, not a receipt or new authority.
It does not increase confirmed outcome counts.

Finish or stop a blocked attempt rather than leaving the app displaying work
that is no longer happening. Continue other readable companies when the saved
Run and client access permit it. A global client failure needs one clear handoff.

## Resume without repeating work

When the original Run has ended, **Resume** explicitly starts a fresh Run for
that original company, assistant and actions. The company must still meet the
original search, type and location scope. The original filters remain in the
history; status and attention filters do not block continuation just because the
first attempt changed those values. Resume does not restart the whole directory.
A running Run must finish or be stopped before another starts.

On the new claim, read the saved journey before acting. Inspect the original
account and any uncertain submission first. A user saying “done” is useful
context; the agent still checks the actual signed-in page or provider receipt.
Do not silently switch to a different tab, mailbox or account.

If a submission might already have happened, inspect its original outcome.
Do not change the role, URL, purpose or key to make another attempt. Only verified
evidence and the existing resolution rules can clear uncertainty. Stopping,
expiry and app restart revoke authority but preserve checkpoints and intents.

The actual tools and schemas are in [tools.json](tools.json); the operational
contract is in [AGENTS.md](../AGENTS.md) and [the agent guide](AGENT-GUIDE.md).

## What a readiness check does not promise

Ready means that the selected client's dated observations cover the requested
preparations. It does not guarantee every employer accepts automated actions,
offers a career profile, has a suitable job or uses the same form. It does not
prove an external scheduler is running. Monitoring remains separately selected,
read-only work and cannot start applications or edit profiles.
