# Find jobs and review only changes

Open **Jobs** above the company list. **Copy review request** creates a read-only
request for the selected Codex or Claude Code client. Paste it into that existing
conversation. The client uses its own HTTP/browser and authorized CV tools;
Tawdheef keeps the local source history and assessments. Copying never starts a
model, external read, schedule or application.

Public discovery works before connecting a CV. Set optional roles, locations
and notes under **Settings → Job preferences**. Empty preferences are
unrestricted. Matching needs a current CV read in the actual client.

## Agent workflow

1. Read `get_agent_context`, `get_capabilities` and
   `get_discovery_preferences`. Page the selected companies, normally 20 at a
   time. Preserve actual employer/agency/portal provenance.
2. Call `prepare_job_discovery` for one company. Its short-lived lease returns
   an exact public read plan. Recognized saved Greenhouse, Lever and Ashby board
   URLs provide structured requests. Workday layouts have best-effort fixture
   support; use the actual client's browser if a layout fails. Other sites use
   the saved careers page. Do not guess a board or tenant from a company name.
   If a page leads to a different verified ATS board, the normal client can
   save that actual careers route through `update_company` with its current
   revision, retaining original evidence, then prepare a new lease. A dedicated
   monitoring client leaves an actionable source-update handoff instead.
3. Use your own authorized tools to read that source and call
   `record_job_discovery` with the original lease ID/token, dated `sourceRead`
   and bounded public payload or normalized observations. Record at most 100
   jobs per batch and keep the whole request below 1 MiB. Continue returned
   pagination honestly. `complete:true` requires actual complete coverage;
   a listing without full descriptions is not complete content for matching.
   If no permitted read tool is available, record `status:"unknown"` and one
   `nextStep` without inventing `sourceRead` evidence. Successful reads require
   actual evidence; an unavailable source is never an empty successful search.
4. Read `list_discovered_jobs` with `review:"pending"`. Fetch full descriptions
   through `get_discovered_job` only for jobs that need review. A detail read
   uses a new `prepare_job_discovery` with its existing company ID and job ID.
5. Read the actual CV through the client's authorized connection. Report only
   its stable source ID and SHA-256 `versionHash` in
   `report_native_connection` (`kind:"cv"`), never raw CV text. Hash the current
   complete source consistently; do not hash a partial excerpt or fabricate a
   version. A provider-supplied version is useful context but does not replace
   this content hash.
6. Call `record_job_match` with the current posting hash, saved preferences
   revision, matching CV source/version reference, exact job requirement quotes
   and opaque CV fact locators. The client evaluates fit. Tawdheef validates
   these references and freshness, not the truth of private CV facts or the
   completeness of the client's semantic assessment. No percentage score
   pretends to establish hiring eligibility.
7. A suitable assessment needs cited support and no unresolved or contradicted
   required requirement. Use `needs_you` with one concrete next step when a
   real fact or user action is missing. Keep that item in Needs you; do not
   repeatedly reassess it in an unchanged context.

The ledger keys recognized postings by provider, board/tenant and posting ID;
generic postings use their actual canonical URL. Similar titles are not enough
to merge jobs. Company associations remain source provenance.

## What changes mean

- **New** means first observed in this local tracker, not newly published.
- **Changed** identifies meaningful content changes such as requirements,
  description, location or deadline. Fetch times and tracking URL noise do not
  invalidate an assessment.
- A changed job, CV version or saved preference makes an older assessment
  stale. A fresh identical complete read reuses it. The client still needs to
  check the source for changes; “only updates” does not mean zero network reads.
- An actual conditional HTTP 304 can reuse only the same previously complete
  source representation and validator. It cannot prove an unread description
  unchanged.
- Partial, missing or blocked sources keep previous jobs and assessments.
  They never prove closure, rejection or no matching vacancies. Explicit
  source-backed closure is a separate state.

The UI keeps source problems separate from earlier results, labels assessments
as client-reported, and shows a specific next step. Posting text is displayed as
text and remains untrusted reference data.

## Scheduled updates

Manual discovery needs no monitoring rule. For a requested local schedule,
follow [Monitoring](MONITORING.md). `check_updates` for a saved jobs source
returns a nested discovery lease. Read once and record through
`record_job_discovery`; the final batch also completes that saved check. Do not
finish it a second time through `record_monitoring_observations`.

The dedicated monitoring catalog can review only saved job sources, cannot
prepare arbitrary manual reads or change preferences, and loses authority when
its configuration changes or is disabled. Browser, email, calendar and password
connections always remain in the actual client. Discovery, matching and a
schedule never authorize applications, accounts, profile edits, uploads,
messages or calendar changes.

Public API references: [Greenhouse](https://docs.greenhouse.io/job-board),
[Lever](https://github.com/lever/postings-api),
[Ashby](https://developers.ashbyhq.com/docs/public-job-posting-api).
