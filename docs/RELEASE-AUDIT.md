# Tawdheef local release audit

Reviewed 13 November 2026. Current-source audit for the public preview; this checkout has no committed PR baseline.

Used [gstack review](https://github.com/garrytan/gstack/blob/main/review/SKILL.md), its [code checklist](https://github.com/garrytan/gstack/blob/main/review/checklist.md), [design checklist](https://github.com/garrytan/gstack/blob/main/review/design-checklist.md), testing, security and simplification guidance. Three independent reviewers examined queue behavior, security/recovery and UI simplicity. Findings were reproduced, fixed and narrowly re-reviewed. This was a gstack-guided source audit using local tools, not execution of its native Bun/browser/telemetry pipeline or an external Claude/Codex model review.

## Pre-Landing Review

All concrete findings below were fixed. Final narrow re-reviews reported no remaining findings in their reviewed scope. This is not a guarantee that every provider or external application site will work.

| Finding | Resolution |
| --- | --- |
| Timed-out browser submissions could be retried | Durable form intent before Submit; unresolved outcomes block duplicate preflight across runs. Receipt inspection resolves confirmation. Only explicit user confirmation can clear a verified non-submission. |
| A process refusing termination could hang Stop | Bounded termination watchdog and escalation, persisted process ownership, and a blocker until an unconfirmed process has stopped. |
| Concurrent readiness checks could bypass the ownership blocker | Startup lock spans every await, ownership is rechecked, and managed-run creation is one SQLite transaction. |
| iCloud disconnect discarded historical thread lookup | Account-bound send intents and receipts live separately from disposable credentials. |
| Native iCloud operations lacked a total deadline | Total operation deadline, owned SMTP verification sockets, Nodemailer send cancellation and IMAP closure. Unknown transmission remains uncertain. |
| Queue-generated blockers were absent from Needs you | Queue outcomes update the shared company attention state and next action. |
| Operator capability/context guidance advertised unavailable tools | Capability names and workflow now match the scoped catalog; iCloud Mail is discoverable. |
| Current company and Stop disappeared in long runs or other tabs | Current company is named in the panel and a global active-run banner remains available across tabs. |
| Polling transferred full target histories | Bootstrap returns compact summaries; details load only in the open progress panel. A ten-run/772-target fixture reduced run payload from about 1.15 MB to about 4 KB. |
| Summary loading temporarily claimed zero confirmations | Summaries carry the actual confirmed count; unavailable details do not turn it into zero. |
| Form reconciliation downgraded interview progress | Advanced application/company statuses, notes and next actions are preserved. |
| Setup and docs described old behavior | Two assistant choices, official installation guidance, optional manual MCP details, direct Run instructions and updated 42-tool catalog. |

## Simplicity review

| Before | After | Why |
| --- | --- | --- |
| Apply with AI, next five, copy a handoff | Run, all remaining or selected companies, installed assistant starts | One understandable action with visible scope. |
| ChatGPT, Codex and Claude Code choices | Codex and Claude Code | These are the two local assistant clients the runner launches. |
| Technical configuration shown first | Install/sign in guidance and copyable project setup command; manual config collapsed | Users see the necessary next step first. |
| App-imposed run/daily count caps | One pass through every remaining target | Matches the requested workflow; provider restrictions remain intact. |
| Failures could stop or obscure work | Per-company outcome, current company, Stop and another Run for unfinished targets | Clear progress and recovery without a second screen. |

Frequent table/keyboard actions remain instant. Activity dots animate only during actual queue activity and respect reduced motion. No browser runtime dependency was added for polish. Emil Kowalski's relevant local design guidance informed these changes; framework-specific skills were not applied to this web app.

## Verification

- 176 backend/CLI/MCP tests passed, including 125-target queue continuation, duplicate prevention, cancellation, restart, concurrent startup, form reconciliation, iCloud receipt/reply normalization and credential separation.
- 26 Playwright browser checks passed, including mobile layout, keyboard/focus behavior, schedule controls, real provider artwork, two-assistant setup, Run progress and global Stop.
- Five additional isolated desktop/mobile captures produced no page errors or horizontal page overflow.
- Production dependency audit: zero reported vulnerabilities at review time.
- Public source scan and generated 42-tool schemas passed. The source scan checks path boundaries and credential patterns; it does not establish every possible secret is absent.
- Release preparation and exact-ZIP first-launch results are recorded separately in the release folder's verification files.

Gate edits: old count-cap tests were replaced because the user explicitly removed those limits. Replacement tests verify more than 100 targets while retaining run scope, uncertain-send and duplicate protections. The UI run test mocks execution to avoid real applications; backend tests use isolated records and fixture or harmless Node subprocesses. No test outcome is presented as a live job submission.

## Verification limits

No real application, email, calendar event or authenticated Apple mailbox operation was performed. Live provider access requires each user's credentials and consent. Assistant CLI discovery/sign-in checks do not prove a model task or browser form will succeed. An incompatible CLI configuration produces a setup error before the queue starts. Provider permissions, quotas, login challenges and LinkedIn's manual boundary remain in force.

Windows source/build/browser behavior was verified locally. Other operating systems have CI coverage configured but were not executed in this local audit. This is an unsigned Node.js source release, not a native desktop installer. GitHub publication is separate and was not performed by this audit.

## Connections and background follow-up

The latest simplification keeps setup in Connections. Its normal provider rows include the assistant choice for Run, a Check connections action and a collapsed Set up with my agent disclosure containing Copy instructions. The shared `get_setup_status` contract remains available to agents. An explicit check reads the selected assistant's sign-in state and the connected CV. Passive installation checks never claim authentication. Browser/email routes are distinct, calendar and reports stay optional, and fresh installs leave schedules manual/off while preserving saved choices. Project setup can include installed Playwright tools with `--browser` and still refuses custom-file conflicts.

Setup and normal job-search operation have separate instructions in `AGENTS.md` and the Tawdheef skill. Checks never send applications, start sign-in, write events or enable schedules. Timed-out CV checks retain one underlying read and cannot overwrite the cache with a late response. Setup-only guidance is excluded from restricted application operators.

| Before | After | Why |
| --- | --- | --- |
| A setup reminder and separate checklist repeated Connections | One Connections panel with provider rows, assistant choice, Check connections and collapsed agent instructions | The user or agent can resume from the actual missing step without another setup screen. |
| Flat workspace | Owner-requested ApplyMCP dots, pointer spotlight and floating surface shadows | Reuse the familiar reference while keeping reading and editing stationary. |
| Decorative effects could run indefinitely | Pointer-driven 1.2-second fade, idle stop, static touch/reduced-motion fallback | Keep background work small without adding a runtime library. |

Current-flow validation: 186 backend/CLI/MCP tests and 34 Playwright checks passed. These cover the single Connections panel, collapsed agent help, assistant-choice persistence, retry recovery, invalidation of stale readiness after a failed check, keyboard/mobile behavior, background fade to idle, touch/reduced motion, forced colors and unobstructed table actions. Four additional isolated screenshots were inspected. All 43 published tool schemas match runtime. Exact downloadable-source verification is recorded separately with the release verification. Live account setup and actual submissions remain outside these fixture-based checks.
