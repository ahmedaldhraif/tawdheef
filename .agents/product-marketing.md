# Tawdheef product marketing context

**Document version:** v6
**Last updated:** 2026-11-13
**Status:** Initial source-backed implementation; owner can revise wording.

## Product overview

Tawdheef is a free, MIT-licensed local company directory and job application
tracker for people and their agents. The screen, CLI and stdio MCP share one
SQLite store. Codex or Claude Code supplies the model and browser tools.
The tracker does not include its own model or require its own model API key.

## Audience and jobs

Start with jobseekers using Codex or Claude Code, particularly in the UAE.
They need a researched starting list, a current CV, a shortlist that fits their
preferences, evidence of actual submissions and a clear next action.
The first pack contains 772 organisation/source records from 10 November 2026.
People can import their own country or industry lists.

## Positioning

Primary line: **A free, open-source app to apply for jobs.**
Descriptor: **Find companies, apply and track replies with your ChatGPT or
Claude agent.**

Center the hero and put the original ChatGPT and Claude marks inline with
their names in the descriptor. No separate audience row or extra labels.
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

Search/repo/personal content → practical country directory or workflow →
download/setup Tawdheef → install skill/connect agent → use a real shortlist →
optionally create/connect a free Tabbio digital CV → discover paid Tabbio help
only when useful. Keep the free route fully usable and the relationship clear.

Primary conversion: downloaded source or completed local setup.
Secondary: skill install, directory pack use and a Tabbio CV visit.
No baseline, conversion rate, installs or live analytics is established.
The website has no tracking pixels. Outbound Tabbio links carry explicit UTM
parameters; they do not prove a resulting signup or upgrade.

## Objections

- Free? Yes for the tracker; provider and AI costs remain separate.
- Technical? Node.js24+ and initial terminal setup are required.
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
