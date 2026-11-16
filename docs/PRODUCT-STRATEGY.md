# Smart discovery: UX review and repository takeaways

Checked 14 November 2026. Product proposal and implementation review. Competitor findings come from current GitHub READMEs plus representative source, not installed-product testing. No competitor software was installed, executed or copied. This is a relevant landscape of 21 projects, not an exhaustive list of every job-search repository.

The career-ops scope reference was corrected on 16 November 2026 after a separate REA and source review. The other landscape entries were not re-audited in that correction.

## Product direction

Keep one working screen and the person's actual Codex or Claude Code client. The client reads public sources and the authorised CV, reasons about fit and reports evidence. Tawdheef stores discovery facts, bounded version references, decisions and confirmed outcomes. Discovery and a copied review request never authorise applications, profile changes, CV sharing or messages.

The smallest useful loop is: **see a new or changed job → read why it may fit → resolve one concrete blocker → explicitly choose any later action**. Preserve old jobs and old assessments when a source fails. Label a stale assessment as previous, rather than presenting a failed source check or changed CV as a new negative result.

## Journey findings and implementation

| Priority | Finding in the existing Native source | Smallest response |
| --- | --- | --- |
| 1 | Recent updates were inside Settings → Monitoring → Recent updates. Results were hard to find from the daily company table. | A compact Jobs & updates disclosure immediately below the existing confirmed-outcome snapshot. No new navigation. |
| 1 | Generic update titles and summaries could not explain a current CV-backed decision, changed fields or assessment freshness. | A paginated review list with a short client-assessed reason, current/previous label, meaningful changed fields and a conventional detail view. |
| 1 | A blocked source, missing CV fact and an incomplete posting can require different actions. | Preserve the backend's single prioritised next step. Keep source problems separate from retained jobs; keep missing facts unknown. |
| 2 | Existing updates fetched only a first page. | Cursor pagination in pages of 20; full posting/requirement evidence loads only on demand. |
| 2 | Opening the company from an update lost the job's context. | Reuse Jobs & updates inside the existing company dialog. Review there is inline, avoiding a second modal/focus trap. |
| 2 | Role and location preferences were implicit in prose or execution briefs. | Optional Job preferences disclosure in Settings. Explicit Save uses the captured revision; a conflict keeps the draft. |

Keep the existing strengths: six familiar Connections rows, choose the client once, dated client-reported capability status, a separate snapshot of confirmed outcomes, explicit Native Run and Stop, and a clipboard fallback. The discovery loop adds neither an app-owned model nor a provider session.

## All 21: adopt, adapt or skip

Every repository link opens its own README; the code link names the representative implementation checked. Decisions are about useful patterns, not wholesale code reuse or a stars ranking.

| Repository | Decision for Tawdheef | Concrete pattern and boundary |
| --- | --- | --- |
| [career-ops-hq/career-ops](https://github.com/career-ops-hq/career-ops) | **Adapt** task-first guidance and validated boundaries. | The [skill router](https://github.com/career-ops-hq/career-ops/blob/c531302a52f3053068bdb0273e8ef36bc6138c21/.agents/skills/career-ops/SKILL.md#L221) loads the relevant workflow. [apply-scope.mjs](https://github.com/career-ops-hq/career-ops/blob/c531302a52f3053068bdb0273e8ef36bc6138c21/apply-scope.mjs#L29) guards code/data paths and fresh-browser launch options; it is not a general workflow/permission router. Keep the first task short and preserve Tawdheef's actual-client session reuse. |
| [ajstars1/ai-job-apply](https://github.com/ajstars1/ai-job-apply) | **Adopt** evidence-backed reasons and honest missing answers. | [Core checks](https://github.com/ajstars1/ai-job-apply/blob/main/packages/core/src/check.ts): connect a decision to known facts and expose what cannot be answered. Preserve Tawdheef's stronger submission-receipt boundary. |
| [meetshukla/JobSearch-MCP](https://github.com/meetshukla/JobSearch-MCP) (Hunt) | **Adopt** short new/unscored lists and one-line reasons. | [Tools](https://github.com/meetshukla/JobSearch-MCP/blob/main/server/tools.ts), [row](https://github.com/meetshukla/JobSearch-MCP/blob/main/client/src/jobs/JobRow.tsx), [detail](https://github.com/meetshukla/JobSearch-MCP/blob/main/client/src/jobs/JobDetail.tsx): compact list, lazy full description and a visible verdict note. Adapt hosted collection/storage to the actual Native client's ownership; do not import its cloud clock. |
| [xCirno1/applyer](https://github.com/xCirno1/applyer) | **Adapt** one workspace and readable source-health messages. | [Board fetch record](https://github.com/xCirno1/applyer/blob/main/src/main/browser/ats/boardFetchRecord.ts): explain partial/query-only board coverage instead of pretending every fetch covers a whole board. Do not reuse an error-as-zero convention. Skip Electron, embedded model/terminal and any queued-as-applied implication. |
| [suxrobGM/jobpilot](https://github.com/suxrobGM/jobpilot) | **Adapt** recognisable existing-client setup. | [Codex provider](https://github.com/suxrobGM/jobpilot/blob/main/apps/terminal/Providers/Codex/CodexProvider.cs): clear provider-specific entry points. Tawdheef keeps its copy-to-actual-client flow; skip hosted-account and PTY-host onboarding. |
| [different-ai/openwork](https://github.com/different-ai/openwork/tree/dev) | **Adapt** exact-target permission/problem explanations. | [Permission modal](https://github.com/different-ai/openwork/blob/dev/apps/app/src/react-app/domains/session/chat/permission-approval-modal.tsx), [ownership](https://github.com/different-ai/openwork/blob/dev/apps/app/src/app/lib/session-ownership.ts): show the specific path/URL/operation and meaningful next action. Keep the familiar Connections rows; skip a model picker, embedded engine and universal Allow shortcut. MIT outside separately licensed `ee`; no framework code copied. |
| [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy) | **Adapt** explicit source and coverage diagnostics. | [Models](https://github.com/speedyapply/JobSpy/blob/main/jobspy/model.py): preserve structured source facts. Distinguish empty, partial and failed reads with diagnostics behind disclosure. Do not bundle every adapter or automate LinkedIn. |
| [strelov1/freehire](https://github.com/strelov1/freehire) | **Adopt** meaningful-content change detection. | [Job hash](https://github.com/strelov1/freehire/blob/main/internal/job/jobhash/jobhash.go): unchanged jobs should not fill the review queue again. Skip large ingestion infrastructure and unsupported scale claims in marketing. |
| [feder-cr/Jobs_Applier_AI_Agent](https://github.com/feder-cr/Jobs_Applier_AI_Agent) (AIHawk) | **Adapt** search → select → explicit work. | [Liveness](https://github.com/feder-cr/Jobs_Applier_AI_Agent/blob/main/src/aihawk/liveness.py): keep open, closed and unclear distinct. Market a reviewable workflow, not unattended application volume; keep clients/providers outside Tawdheef. |
| [Pickle-Pixel/ApplyPilot](https://github.com/Pickle-Pixel/ApplyPilot) | **Adapt** persisted stages and stage-specific retry. | [Launcher](https://github.com/Pickle-Pixel/ApplyPilot/blob/main/src/applypilot/apply/launcher.py): show what finished and what needs another attempt. Skip bypass-permission defaults, automatic Gmail/browser setup and volume promises. |
| [Gsync/jobsync](https://github.com/Gsync/jobsync) | **Adapt** canonical duplicate handling. | [Deduplication](https://github.com/Gsync/jobsync/blob/main/src/lib/jobs/jobDedupe.ts): show the existing saved job rather than another copy. Skip extra goal/gamification dashboards and app-owned model/cron ownership. |
| [maerzhase/jobnest](https://github.com/maerzhase/jobnest) | **Adapt** calm local-first expectations and clear import/backup results. | [Desktop entry](https://github.com/maerzhase/jobnest/blob/main/apps/jobnest/src-tauri/src/lib.rs): learn from the understandable local-product promise. Do not replace Tawdheef's lightweight launcher with Tauri merely for polish. |
| [tecnologer/jobtracker](https://github.com/tecnologer/jobtracker) | **Adopt** readable timestamped stage history. | [Store](https://github.com/tecnologer/jobtracker/blob/main/store/store.go): make transitions inspectable. Keep discovery, account/profile/CV milestones and confirmed applications separate. |
| [waddington/job-application-tracker](https://github.com/waddington/job-application-tracker) | **Adapt** useful attention views and understandable exports. | [Snapshot export](https://github.com/waddington/job-application-tracker/blob/main/src/jat/snapshot/export.py): make saved work portable and reviewable. Do not add automatic Git sync for private CVs or attachments. |
| [firyomaefx/job-application-mcp](https://github.com/firyomaefx/job-application-mcp) | **Adapt** preview versus explicit action. | [Submission approval](https://github.com/firyomaefx/job-application-mcp/blob/main/src/submission/approval.ts): make the authority boundary visible. A local approval or prepared record is not an employer submission. |
| [Servation/job-search-mcp](https://github.com/Servation/job-search-mcp) | **Adapt** quick shortlist triage. | [Store](https://github.com/Servation/job-search-mcp/blob/main/db.ts): review/skip is familiar and cheap. Do not treat an Applied button or score as evidence of submission or eligibility. |
| [girmmy/agent-opportunity-tracker](https://github.com/girmmy/agent-opportunity-tracker) | **Adapt** qualitative fit with an Unknown state. | [Client skill](https://github.com/girmmy/agent-opportunity-tracker/blob/main/skill/SKILL.md): plain reasons and a timeline are more useful than an invented percentage. Skip a move to Supabase for this single-user local case. |
| [romprod/application-tracker](https://github.com/romprod/application-tracker) | **Adapt** opportunity/application separation and auditable evidence. | [MCP audit](https://github.com/romprod/application-tracker/blob/main/src/application/mcp_audit.ts): preserve who recorded what without conflating an opportunity with an application. Skip multiuser/admin complexity. Elastic 2.0 is source available; do not treat it as permissive open-source code to copy. |
| [zot/frictionless](https://github.com/zot/frictionless) | **Adapt** a shared visible state for human and agent. | [Job-tracker example](https://github.com/zot/frictionless/blob/main/apps/job-tracker/app.lua): both should see the same saved result. Skip its Lua/framework replacement and ordinary-agent source-editing workflow. |
| [garrytan/gstack](https://github.com/garrytan/gstack) | **Adapt** one useful first task and evidence-backed walkthroughs. | [Browser skills](https://github.com/garrytan/gstack/blob/main/browse/src/browser-skills.ts): show what a tool actually did. Skip engineering personas, browser daemon setup and global tooling as job-seeker onboarding. |
| [GodsScion/Auto_job_applier_linkedIn](https://github.com/GodsScion/Auto_job_applier_linkedIn) | **Skip** bot/volume positioning. | [Bot entry](https://github.com/GodsScion/Auto_job_applier_linkedIn/blob/main/runAiBot.py): only the distinction between dry-run and a real outcome is useful here. Do not copy automatic LinkedIn actions or default eligibility answers. |

## Six close projects: practical synthesis

Hunt is the closest guide for an inexpensive review surface: show a short row, a one-line decision and age, then fetch the full posting when opened. Applyer contributes a useful source-coverage explanation, but its desktop/model runtime is not needed. Career-ops and ai-job-apply show how a small actual-client workflow can remain task-first and fact-backed. JobPilot helps make the chosen client's name recognisable during setup. OpenWork is the strongest general interaction reference for showing an exact permission problem; its engine, model selection and permission override surface are a different product.

The shared lesson is **progressive evidence**, not another agent host: concise rows first, full source/requirement references on demand, one exact next step, explicit selected actions later. None of these source reviews proves a live job source works for this user, that an employer will reply, or that a copied request creates a schedule.

## Marketing proposals for review only

The initial audience is a job seeker already using Codex or Claude Code. The
main problem is repeated, fragmented job-search work: rediscovering the same
postings, guessing whether they fit, losing career-profile progress and not
knowing what actually finished. Tawdheef is one product with three entry
points: public research/packs, an agent skill plus CLI/MCP, and the local
tracker. Tabbio is a separate CV product, not a required account for public
research or a second agent engine.

Ship the practical loop before expanding the product surface. This change
implements discovery, update-only review, cited client assessments and clear
attention states. The next small improvements to evaluate with real users are:

1. One English/Arabic walkthrough showing the first useful shortlist and one
   honest blocker. Keep existing Connections as the single setup destination.
2. Task- and country-specific public research examples with dated sources,
   followed by contextual app/CV setup when personal matching is needed.
3. A contribution loop for corrections and new country packs, with provenance
   and review instead of unsupported claims of live vacancy coverage.
4. Measure the journey during consented usability sessions: time to first
   useful shortlist, repeated records avoided, unresolved blockers, and
   confirmed outcomes. Downloads, copied prompts, reported connections,
   profiles, applications and hiring outcomes remain separate measures.

These are prioritised experiments, not shipped growth features or measured
conversion improvements. No analytics SDK, mailing list, cloud account,
subscription flow or public deployment was added. Keep the local app small;
avoid embedding a second agent, universal browser, password vault or another
chat interface. A focused product that reliably saves work is the aim; this
review does not establish superiority over competitors.

Keep the approved headline: **Find matching jobs. Build career profiles.**

Possible supporting line: **Your Codex or Claude Code agent finds what fits. Tawdheef keeps the results.**

Possible discovery benefit: **New matches. Meaningful changes. One clear next step.**

A useful demonstration is one changed posting, one CV-grounded reason, an honest Needs you handoff, then a separately chosen action and its real confirmation. Label synthetic demonstration data. Do not promise replies, interviews, ATS success, unrestricted computer use or unattended application volume. No hero, brand assets or landing layout were changed for these proposals.

## Applicable Checklist Design review

Source review first; captures and fixture browser checks verify the rendered result separately. Amicro informed restrained hierarchy and interaction states; Tawdheef's system font, original brand, native controls and reduced-motion rules remain authoritative. No catalog library was installed.

| Checklist row | Result in this change |
| --- | --- |
| Table header | Jobs uses a plain semantic list, not another data table. Title, company/location, decision and observed time keep a stable reading order. |
| Row style | Thin separators and text hierarchy; no decorative cards. |
| Spacing | Consistent row padding; compact summary beside the existing table. |
| Search | Deferred: current page/filter scope is explicit, review categories and pagination are available. The existing company search remains unchanged. No claim of job-title search. |
| Actions | Open posting and copy a read-only request only; Run authority is unchanged. |
| Filter and sort | To review / Needs you / All; server cursor order. No unsupported sort UI. |
| Responsiveness | Wrapped title/status/counts, safe long-text wrapping; English/Arabic captures at 320 and 1440. |
| Pagination | 20 items per page, opaque cursor stack, disabled boundaries, focus moved to the loaded list after user pagination. |
| Alert descriptive message | Missing route calls for restart; failed read and empty result are distinct; source failures have actual next steps. |
| Alert placement/stacking | Beside the relevant disclosure/list/save; old jobs remain visible separately from source problems. |
| Alert dismissible option | Actionable errors persist until retry or close. A nonessential dismiss control was not added. |
| Alert icon reinforcement | Text explicitly names Needs you / Source needs attention; colour is not the only signal. No decorative icon required. |
| Alert semantic variants | Loading uses status, failures use alert, empty is explanatory text. Fit states are plain labels, not success claims. |
| Alert inline action | Retry, restart guidance or the bounded read-only request sits with its relevant problem. |
| Accordion header | Jobs & updates, Job preferences and evidence labels describe their content. |
| Accordion indicator | Native details semantics with a direction-aware summary chevron for the main disclosure. |
| Accordion content | Counts and next action first; source and assessment evidence are progressively disclosed. |
| Accordion states | Native keyboard semantics and focus outlines retained; no entrance animation. |
| Accordion expanding logic | Independent sections may remain open for comparison; no wizard or exclusive step order. |

## Evidence limits

Browser checks use isolated fixture records and mocked discovery responses, not the person's CV, accounts or actual job-site sign-in. Server, SDK, package and actual-client validation belong to the coordinating task. Browser captures verify layout and honest labels; they do not prove a live source, model judgement or external native schedule.
