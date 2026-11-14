# Tawdheef product marketing context

**Document version:** v14
**Last updated:** 2026-11-14
**Status:** Initial source-backed implementation; owner can revise wording.

## Product overview

Tawdheef is a free, open-source **Auto Job Apply & Application Tracker**.
People choose companies; their own agent applies through supported email or
browser routes, and Tawdheef tracks outcomes and replies locally.
The screen, CLI and stdio MCP share one
SQLite store. Codex or Claude Code supplies the model and browser tools.
The tracker does not include its own model or require its own model API key.

## Audience and jobs

Start with job seekers using Codex or Claude Code, in any country.
They need a researched starting list, a current CV, a shortlist that fits their
preferences, evidence of actual submissions and a clear next action.
Six current GCC packs contain 13,714 organisation/source records dated
13 November 2026. The original 772-record UAE starter snapshot is preserved
separately and overlaps expanded UAE. These are dated research lists, not
live vacancies. People can import or contribute country or industry lists.

## Positioning

Approved category: **Auto Job Apply & Application Tracker**.
Approved hero: **Find matching jobs. Build career profiles.**
Supporting line: **A free, open-source job-search app for you and your Codex or Claude Code agent.**

Keep the approved category intact in naming and search context. It is a
descriptor; the sentence reads more naturally as a hero headline. Auto-apply
means an explicitly started run through the user's local agent and authorized
connections. It does not mean every website, every job or unattended success.

Center the hero and put the original ChatGPT and Claude marks inline with
their names where familiar provider identification is useful. No separate
audience row or extra labels. Keep free/open source visible in the main copy.
Actual local Codex and Claude Code requirements belong on setup and workflow
pages. Do not imply that browser chat products can access local stdio settings.

The core value is a shared working record for the person and their agent.
Country packs make starting easier. The skill teaches the workflow; the local
MCP supplies actual tools. Avoid implying that installing a skill installs or
authenticates the tracker.

## Brand voice and architecture

Tawdheef.com is the canonical product home, including Skills, guides, research,
directories and contribution routes. Ahmed's personal channels introduce the
project. Tabbio is the connected CV service; its own supporting integration
page should link back to Tawdheef and explain the CV step with distinct copy.
Infrastructure hosting does not change the public product identity. The owner
deferred domain connection on 14 November 2026; prepared deployment files and
local verification do not mean the domain is live.

Keep the centered hero and approved words. Add a useful Skills overview,
an authored About page and a short product walkthrough. The marketing site
explains what the person gets; task guides help them do it, and the agent
reference links the actual contracts and data. Reuse canonical instructions
instead of creating conflicting setup steps. See the guide architecture below.

Use `tawdheef.com` in the English wordmark, Tawdheef in prose, توظيف in Arabic.
Calm, useful and concrete. Arabic identity; developer-friendly distribution.
Ahmed AlDhraif is the named author and Tabbio founder. Link to his real profile;
avoid unsupported rankings, audience sizes or testimonials.
Tabbio appears in the CV integration section. Omit Powered by Tabbio from the website, brand guide and app footers.
Use Ahmed's supplied official portrait, Built by Ahmed AlDhraif and a small
original LinkedIn favicon in one quiet link to his verified profile URL.
Omit Founder of Tabbio from this byline. Keep the ت mark in the header and
favicon, without repeating it in the hero. Show the product near the main action.
Tabbio is available worldwide. Present the free CV for recruiters and agents:
permissioned CLI/MCP access, public web discovery and employer/Open-to-work
visibility. UAE PASS is optional for eligible users and verifies identity,
not CV experience. Public indexing and AI recommendations are not guaranteed.
Tabbio CLI/MCP edits remain separate from Tawdheef's CV-read mapping.
Use the owner-supplied full English violet wordmark in the Tabbio section.
Use three distinct benefits: agent CV updates/sharing with MCP/CLI marks,
public discovery with Google/Bing marks, and Open to work with the Tabbio
symbol. Avoid a separate protocol row or repeated permission copy. Keep
UAE PASS as the smaller optional note and search eligibility as one short line.

## Free and paid boundaries

Tawdheef code is MIT licensed and the app is free. AI clients, model usage,
mail providers and other connected services may have independent costs.
Tabbio's public FAQ says its free plan includes building, sharing and exporting
a digital CV. Its current plans define paid AI features. The local tracker
supports authorised CV read mappings. Do not claim integrated CV editing,
recruiter attribution or analytics merely from Tabbio marketing.

## Funnel and conversion

Offer two useful starting points. Public company research uses the country packs,
their evidence and the [research example](../docs/examples/README.md), without
installing the app or creating a CV account. A private
[job-search brief](../docs/examples/job-search-brief.md) helps name role,
location and sector preferences; it does not connect or update a CV.

For personal matching and tracking: GitHub release → local agent-assisted setup →
create a free Tabbio CV or use an existing one → connect it and check readiness →
review a shortlist → choose companies and explicitly start Run → review outcomes.
Introduce the CV at the matching step. Contributions and public data stay ungated.

The GitHub repository is https://github.com/ahmedaldhraif/tawdheef. Read
`website/config.json` for the published download target. Link to /releases or its explicit version while it is a prerelease,
not /releases/latest. The hero’s Get the free app action leads to the setup guide;
the setup download links directly to the official release asset, with a clone
alternative. Keep downloadable source, issues and pull requests easy to find.

Directory/manual tracking is usable without Tabbio. Run requires a connected
Tabbio CV. Tabbio remains a separate CV service, not the operator or warranty
provider of this personally maintained project. Paid Tabbio help is a secondary
option only when useful; the free CV path stays clear.

Useful first result: sourced company leads or a reviewed, CV-informed shortlist.
Local activation: the chosen assistant and connected CV pass readiness checks.
Downloads, skill installs, directory use and Tabbio visits are separate signals;
none proves a unique user, completed setup, signup or CV.
No baseline, conversion rate, installs or live analytics is established.
The website has no tracking pixels. Outbound Tabbio links carry explicit UTM
parameters; they do not prove a resulting signup or upgrade.

The [open-source growth plan](../docs/marketing/OPEN-SOURCE-GROWTH.md)
records the reviewed repository patterns, priorities and measurement limits.

## Guides and public information

- `/examples/` and `/ar/examples/`: the public company research request, rendered
  from the same English/Arabic Markdown used on GitHub. It needs public JSON
  and website access, with clear source and assistant-access limits.
- `/examples/job-search-brief/` and its Arabic counterpart: an optional copyable
  preference brief, with completed copies kept private. These two resources are
  separate from the eight task guides and the one installable skill.

- `/skills/`: the main Skills overview, inspired by the reference’s direct
  presentation. Lead with the real `npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef`
  command and a prominent Get started action for app and CLI setup. Group the
  eight task guides beneath it. There is one installable Tawdheef skill;
  guides are articles, not extra skills.
- `/guides/`: searchable index of the eight guides, reached through All guides.
- `/guides/use-the-skill/`: the main setup and skill article. Lead with the
  app download and canonical agent setup request, then CLI/MCP connection,
  free Tabbio CV connection and verification. Standalone skill install is secondary.
- `/get-started/` and `/guides/get-started/`: permanent redirects to that
  article, with existing setup anchors preserved.
- `/guides/connect-your-agent/`: actual local Codex/Claude Code setup and checks.
- `/guides/connect-your-cv/`: free Tabbio CV creation or existing-account connection;
  distinguish tracker CV reads from a separate Tabbio editing connection.
- `/guides/use-directory-packs/`: public pack discovery, extract/import all CSV
  parts, inspect provenance and contribute researched data for any country.
- `/guides/apply-to-jobs/`: chosen targets/actions, permission, real confirmations
  and handoffs; no universal or unattended-success claim.
- `/guides/replies-and-reports/`: bounded reply checks and real outcomes;
  schedules do not initiate new applications or follow-up messages.
- `/guides/troubleshoot/`: symptoms, checks and recovery, including local setup,
  credentials in Connections, missing tools and uncertain submissions.
- `/guides/for-agents/`: `llms.txt`, live tool discovery, schemas, CLI/MCP,
  directory catalog/index/provenance and authority boundaries.
- `/about/`: canonical text in `website/about.md`; the name, practical purpose,
  Ahmed's verified attribution, independent maintenance and separate Tabbio service.

Use Skills as the main navigation entry. Keep detailed setup at
`/guides/use-the-skill/`, and redirect `/skills/tawdheef/` there. `/skills/` is
the overview and must not redirect. Source guide links must work directly on
GitHub; route architecture does not establish that www.tawdheef.com is deployed.
Use the approved Arabic Grid
SVG at `/brand/mark.svg` beside the skill-guide heading; a typed ت is text,
not the selected logo. Preserve the mark's proportions and two square dots.
Skills are instructions, not new tools or proof of authentication. The homepage
preview uses one real app image without tabs. The homepage uses the compact
skill-install block, a real paste demonstration and a link to actual app setup.
Keep the detailed CLI recipe in Skills and guides, with CV connection in its
relevant step. The preview does not invent activity, connected
accounts, submission receipts or testimonials. Guidance on setup, backups and
updates should follow existing canonical docs. An update to the public website
or GitHub source does not change an already published release asset.

These choices come from reviewed reference patterns and the owner's approval;
they do not establish better conversion, ranking or agent citations.

## Objections

- Free? Yes for the tracker; provider and AI costs remain separate.
- Technical? No coding is needed. Open the folder in Codex or Claude Code and
  copy the agent setup request. Node.js 24+ is required; the guide helps with it.
- Applications automatic? Only an explicit named run authorises supported
  agent actions. Sign-ins, CAPTCHAs and provider approvals may need the person.
- Phone? Responsive site and UI; the default app runs on the user's computer,
  with loopback access only. Do not market it as a hosted mobile account.
- Private? Tracking is local. Authorised email, CV and AI providers are online.

## Proof and claim rules

Source: local source code, AGENTS.md, docs/QUICKSTART.md and the unchanged UAE
research JSON. Public Tabbio FAQ is a source for plan descriptions, not proof
that every feature is connected or tested in this tracker.
No fabricated vacancy counts, placements, star counts, endorsements or
"first/best" claims. A source is not automatically an employer. A published
route is not necessarily tested. Only real submission evidence means applied.

## Changelog

- v14 (2026-11-14); Owner approved the independent Tawdheef.com product home,
  Ahmed-led launch and contextual Tabbio CV route. Brought public research
  before app/CV setup, rendered the shared resources in English/Arabic, made
  Run's CV requirement explicit before download, and prepared launch/update
  materials and static hosting configuration. Domain connection is deferred;
  personal posts and the Tabbio integration page remain drafts.

- v13 (2026-11-14); Reviewed ten established developer-product repositories.
  Added public research and a private job-search brief as useful first resources,
  kept CV matching contextual, restored Skills/guide metadata to the actual
  architecture, and separated downloads/visits from activation and outcomes.
  No analytics, ranking or conversion result is claimed.

- v11 (2026-11-13); Owner restored Skills as the main overview, with the real
  skill install command, a Get started app/CLI action and grouped task guides.
  Kept one actual skill distinct from eight articles and retained the detailed
  setup route. This supersedes the earlier no-Skills navigation decision.
- v10 (2026-11-13); Combined setup and the skill in one primary guide,
  brought direct CLI connection into the homepage flow and removed preview tabs.
  Kept the searchable guide index and redirected earlier setup/skill links.
- v9 (2026-11-13); Owner placed the skill inside Guides at
  `/guides/use-the-skill/`, with legacy skill-route redirects and no separate
  Skills navigation item. Required the approved SVG mark rather than a typed
  Arabic letter. The guide set now contains nine pages; operating authority,
  tracker behavior and provider permissions are unchanged.
- v8 (2026-11-13); Owner approved Guides, an About page and a real product
  walkthrough after reviewing OpenSEO. Added human task pages and an agent
  reference while preserving the centered hero, GitHub-first local setup,
  free Tabbio CV path and current release boundaries. No invented founder story
  or borrowed adoption claims.
- v7 (2026-11-13); Owner approved Auto Job Apply & Application Tracker
  positioning and a GitHub-first path to local setup, a free connected Tabbio
  CV and a chosen application run. Broadened contributions to any country and
  retained provider, local-client and real-evidence boundaries.
- v6 (2026-11-13); Owner requested three distinct, shorter CV benefits with
  MCP/CLI, Google/Bing and Tabbio marks beside their matching headings. Removed
  the repeated protocol row and approval copy; kept a short search eligibility note.
- v5 (2026-11-13); Owner requested the centered reference layout, a single
  explanation naming ChatGPT/Claude agents and no extra labels. Removed the
  founder affiliation and added a small LinkedIn favicon beside Ahmed's name.
- v4 (2026-11-13); Owner chose plain free, open-source application wording,
  familiar ChatGPT/Claude names and a linked founder handle. Removed the
  purple badge, stacked client captions, profile box and LinkedIn artwork.
  Local-client requirements stay on setup and workflow pages.
- v3 (2026-11-13); Owner requested agent-first worldwide Tabbio positioning,
  real MCP artwork, CLI access, separate web and employer discovery, and
  optional UAE PASS identity verification. Added direct LinkedIn founder credit.
- v2 (2026-11-13); Owner chose tawdheef.com for the English wordmark,
  supplied a founder portrait and requested plainer conversion copy around
  Tabbio, UAE PASS identity, MCP and opt-in discovery.
- v1 (2026-11-13); Initial context from the local product, selected brand,
  owner brief and current public Tabbio material; established funnel and claims.

## Current setup and language navigation

The Skills overview leads with its compact skill install command and brief workflow-guidance note. Get started, the actual app CLI setup and the Tabbio CV step follow it. The homepage uses the same compact skill install block, with a direct app setup link and a small paste demonstration from genuine Claude Code captures. CV actions stay in the dedicated Tabbio section. Detailed CLI setup stays on Skills and guides. The shared English/Arabic header uses native links in a segmented control, preserving the current section. Production has canonical localized URLs, reciprocal language alternates, sitemap.xml and public llms.txt navigation. The local preview stays noindex. Deployment and real indexing are separate checks.

The public website follows the device color scheme by default, preserves a manual color choice and offers a reset to the device theme. Current preview assets use an isolated public GCC dataset with no submitted applications or connected personal accounts.
