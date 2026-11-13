# Tawdheef product marketing context

**Document version:** v7
**Last updated:** 2026-11-13
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
Approved hero: **Auto-apply to jobs. Track your applications.**
Supporting line: **Free, open-source software for you and your ChatGPT or
Claude agent.**

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

Use `tawdheef.com` in the English wordmark, Tawdheef in prose, توظيف in Arabic.
Calm, useful and concrete. Arabic identity; developer-friendly distribution.
Ahmed AlDhraif is the named author and Tabbio founder. Link to his real profile;
avoid unsupported rankings, audience sizes or testimonials.
Powered by Tabbio is an optional separate endorsement.
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

Search/repo/personal content → GitHub release → download and local agent-assisted
setup → create a free Tabbio CV or use an existing one → connect it and check
readiness → choose companies and explicitly start Run → review outcomes and replies.
The GitHub repository is https://github.com/ahmedaldhraif/tawdheef. This source
prepares the v0.1.1 preview. Link to /releases or its explicit version while it is a prerelease,
not /releases/latest. The hero’s Get the free app action leads to the setup guide;
the setup download links directly to the official release asset, with a clone
alternative. Keep downloadable source, issues and pull requests easy to find.

Directory/manual tracking is usable without Tabbio. Run requires a connected
Tabbio CV. Tabbio remains a separate CV service, not the operator or warranty
provider of this personally maintained project. Paid Tabbio help is a secondary
option only when useful; the free CV path stays clear.

Primary conversion: downloaded source or completed local setup.
Secondary: skill install, directory pack use and a Tabbio CV visit.
No baseline, conversion rate, installs or live analytics is established.
The website has no tracking pixels. Outbound Tabbio links carry explicit UTM
parameters; they do not prove a resulting signup or upgrade.

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

- v7 (2026-11-13) — Owner approved Auto Job Apply & Application Tracker
  positioning and a GitHub-first path to local setup, a free connected Tabbio
  CV and a chosen application run. Broadened contributions to any country and
  retained provider, local-client and real-evidence boundaries.
- v6 (2026-11-13) — Owner requested three distinct, shorter CV benefits with
  MCP/CLI, Google/Bing and Tabbio marks beside their matching headings. Removed
  the repeated protocol row and approval copy; kept a short search eligibility note.
- v5 (2026-11-13) — Owner requested the centered reference layout, a single
  explanation naming ChatGPT/Claude agents and no extra labels. Removed the
  founder affiliation and added a small LinkedIn favicon beside Ahmed's name.
- v4 (2026-11-13) — Owner chose plain free, open-source application wording,
  familiar ChatGPT/Claude names and a linked founder handle. Removed the
  purple badge, stacked client captions, profile box and LinkedIn artwork.
  Local-client requirements stay on setup and workflow pages.
- v3 (2026-11-13) — Owner requested agent-first worldwide Tabbio positioning,
  real MCP artwork, CLI access, separate web and employer discovery, and
  optional UAE PASS identity verification. Added direct LinkedIn founder credit.
- v2 (2026-11-13) — Owner chose tawdheef.com for the English wordmark,
  supplied a founder portrait and requested plainer conversion copy around
  Tabbio, UAE PASS identity, MCP and opt-in discovery.
- v1 (2026-11-13) — Initial context from the local product, selected brand,
  owner brief and current public Tabbio material; established funnel and claims.
