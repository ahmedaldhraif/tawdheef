# Tawdheef · توظيف

<img src="public/brand/logo-latin-purple.svg" alt="tawdheef.com" width="320" />

**Find matching jobs. Build career profiles.**

A free, open-source job-search app for you and your AI assistant. Find jobs that fit your CV, apply to suitable roles, and build career profiles for future opportunities, even when no suitable job is open. Your agent can create or complete career accounts, fill your details and upload your CV where those options are available. Tawdheef tracks each outcome separately.

**Local-first · Built-in CLI + MCP · Codex & Claude Code**

**Your actual AI client owns the connections.** Native mode is the default: connect Tabbio CV, email, calendar, browser/computer and password manager in your Codex/Claude client. Tawdheef supplies local guidance, scoped tasks and shared records. It starts no second assistant or app-owned provider connection in Native mode.

The source edition recommends **Node.js 26 LTS** and uses **Vite 8.3.8**. Desktop packaging now produces prebuilt Windows/Mac/Linux candidates with a checksum-verified Node runtime and server dependencies, so those downloads need no build or separate Node installation. Platform packages remain unsigned candidates until their exact download and operating-system checks pass; the public source-download links below remain unchanged. See [desktop packaging and verification](docs/DESKTOP-RELEASE.md).

The production core has six direct dependencies for the local server, MCP, validation and file formats. Mail/calendar SDKs are developer dependencies and optional private add-ons for explicit `local-adapters` compatibility. Native startup needs no installed Codex/Claude Code CLI and launches no assistant subprocess; open your existing selected client to perform the handoff. That client, model and its external tools have their own requirements and permissions.

Tawdheef (توظيف) means employment in Arabic. This app is for job seekers, wherever they are.

Built and personally maintained by [Ahmed AlDhraif](https://github.com/ahmedaldhraif), founder of [Tabbio](https://www.tabbio.com/en).

[Download the app](https://github.com/ahmedaldhraif/tawdheef/releases/download/v0.1.2/tawdheef-0.1.2-source.zip) · [Release notes](https://github.com/ahmedaldhraif/tawdheef/releases/tag/v0.1.2) · [Setup and skill guide](docs/guides/use-the-skill.md) · [Directory packs](#gcc-directory-packs)

<img src="public/site-assets/tracker-desktop.png" alt="Tawdheef's local directory and application tracker, showing the public UAE research snapshot" width="100%" />

[English guides](docs/guides/README.md) · [الأدلة بالعربية](docs/i18n/ar/guides/README.md)

## Choose your starting point

| I want to… | Start here |
| --- | --- |
| Find companies first | [Browse country packs](directories/README.md) or [try public company research](docs/examples/README.md). No app installation or connected CV needed. |
| Apply and track with my agent | [Set up Tawdheef](docs/guides/use-the-skill.md), then create or connect your CV and check readiness. |
| Improve the app or data | [Fix a detail, add a company, share a pack or contribute code](CONTRIBUTING.md). |

[Fill a job-search brief](docs/examples/job-search-brief.md) · [جرّب البحث عن الشركات بالعربية](docs/i18n/ar/examples/README.md)

## Start here

1. Download the source ZIP from the [GitHub release](https://github.com/ahmedaldhraif/tawdheef/releases/tag/v0.1.2) and extract it.
2. Open the folder in your installed, signed-in **Codex or Claude Code** and paste the setup request below. You only need one assistant, plus [Node.js 24+](https://nodejs.org/en/download).
3. [Create a free Tabbio CV](https://app.tabbio.com/?utm_source=tawdheef&utm_medium=github&utm_campaign=live_cv), or connect the actual CV in your chosen client's supported tools. Connections shows dated client reports and setup requests; sign-in and credentials stay in that client.
4. Filter/select companies, choose actions and press **Run**. Continue its handoff in your actual client. Matching jobs and profiles start selected; CV-only emails stay off unless selected. The client claims one company at a time and records real outcomes.

Paste this into your assistant:

> Set up Tawdheef in this folder using AGENTS.md and docs/FIRST-RUN.md. Preserve my settings and data. Use my actual Codex/Claude client's own CV, email, calendar and browser tools; keep credentials there. Inspect and report only observed connection metadata. Do not start a job-search run or enable schedules during setup.

Your agent handles local installation and configuration. You handle account sign-in and consent. Email and calendar are optional; add them when needed. [Full setup guide](docs/FIRST-RUN.md).

The app is free; your AI client and providers may have their own costs or limits. You can browse and track without a CV connection. Before acting on a Run, the actual client must read your real CV and relevant preferences. An unreported connection is unknown, not proof of disconnection; the app does not require a separate CLI/model probe to create a Native handoff.

## Built-in CLI + local MCP

Tawdheef includes its own CLI and local stdio MCP server. The screen, CLI and MCP tools read and update the **same local SQLite database**, so your assistant works with the same companies, profiles, applications and reports you see.

The setup command connects Codex or Claude Code to the MCP tools and installs the Tawdheef skill. Other compatible local MCP clients can use the same server; terminal agents and scripts can use the CLI:

```sh
node bin/apply-tracker.mjs help
node bin/apply-tracker.mjs call list_directories
```

`AGENTS.md` teaches the shared workflow; `CLAUDE.md` imports it for Claude Code. CLI/MCP expose local guidance, metadata, scopes, claims, intents, receipts and reports. The actual client supplies every external connection and tool. [Agent guide](docs/AGENT-GUIDE.md) · [Tool schemas](docs/tools.json) · [Repository structure](docs/REPOSITORY.md).

## Guides and tools

Browse [all guides](docs/guides/README.md) for CVs, directories, applications and replies. [Troubleshoot a problem](docs/guides/troubleshoot.md), read the [setup and skill guide](docs/guides/use-the-skill.md), or learn [about Tawdheef](website/about.md). The website renders these same guides, so the instructions stay consistent.

## GCC directory packs

Start with the GCC. Any country is welcome.

| Country | Records | Download | Public source |
| --- | ---: | --- | --- |
| United Arab Emirates | 3,583 | [ZIP](https://github.com/ahmedaldhraif/tawdheef/releases/download/v0.1.2/uae-expanded-directory-pack.zip) | [UAE data](directories/uae-expanded/) |
| Saudi Arabia | 4,256 | [ZIP](https://github.com/ahmedaldhraif/tawdheef/releases/download/v0.1.2/saudi-arabia-directory-pack.zip) | [Saudi data](directories/saudi-arabia/) |
| Qatar | 671 | [ZIP](https://github.com/ahmedaldhraif/tawdheef/releases/download/v0.1.2/qatar-directory-pack.zip) | [Qatar data](directories/qatar/) |
| Oman | 2,587 | [ZIP](https://github.com/ahmedaldhraif/tawdheef/releases/download/v0.1.2/oman-directory-pack.zip) | [Oman data](directories/oman/) |
| Kuwait | 1,806 | [ZIP](https://github.com/ahmedaldhraif/tawdheef/releases/download/v0.1.2/kuwait-directory-pack.zip) | [Kuwait data](directories/kuwait/) |
| Bahrain | 811 | [ZIP](https://github.com/ahmedaldhraif/tawdheef/releases/download/v0.1.2/bahrain-directory-pack.zip) | [Bahrain data](directories/bahrain/) |

**13,714 organisation/source records, dated 13 November 2026.** These include campuses, agencies, portals, programmes and unresolved leads, not just independent employers. They are not live job offers or tested application routes. The original [772-record UAE starter snapshot](directories/uae/) stays available separately and overlaps expanded UAE; it is not 772 additional unique organisations.

Download a pack, choose a directory in the app, then use **List options → Import list** and review the preview. Saudi Arabia and expanded UAE have two numbered CSV parts: import both into the same directory. A fresh app starts with the original UAE snapshot; the other packs are add-ons. [Pack guide](directories/README.md).

**Add a company. Fix a link. Contribute a country.** [Suggest a correction](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=directory-data.yml), [propose a new pack](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=new-country-pack.yml), or open a pull request. No coding is needed to suggest data. Include a public source link, record ID if known and date checked. [Contribution guide](docs/DIRECTORY-CONTRIBUTING.md).

## Manual setup

Prefer commands? With Node.js 24+, run these in the downloaded folder:

```sh
npm start
npm run agent -- codex
```

For Claude Code, use `npm run agent -- claude-code`. Open the folder in that client, accept project trust and start a chat. Setup creates project-only Tawdheef MCP/skill settings while preserving custom entries. Use the client's supported external tools and complete their sign-ins there. No tracker-managed browser/provider installation is required for Native mode. [Existing settings and other clients](docs/AGENT-GUIDE.md).

To open the app again, use `npm start` or double-click **Start Tawdheef.cmd** on Windows. No Docker, hosted tracker account or model API key is needed.

<details>
<summary>Install just the skill</summary>

To install the [skill](skills/tawdheef/SKILL.md) separately:

```sh
npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef
```

A skill alone does not install the app, connect MCP tools, authenticate accounts or authorize applications. A browser-only ChatGPT or Claude conversation does not automatically access local stdio tools.

</details>

## Connect your accounts

Connect accounts in your actual Codex/Claude client. **Connections** in Tawdheef displays dated reports and copyable requests. Reports are client-reported, not independent authentication proof; passwords/tokens/raw CVs do not belong in them.

| Connection | What you need |
| --- | --- |
| Email / Calendar | The actual client's authorized mail/calendar tools and observed account/calendar metadata. |
| Tabbio CV / original file | The client's authorized source, with source metadata saved in Tawdheef. An original local PDF/DOCX may optionally be selected and stored privately for exact-byte staging. |
| Browser / Computer | The client's supported read/form/upload tools and their normal approvals. |
| Password manager | Your client's supported workflow; Tawdheef never reads its vault or stores career passwords. |
| Codex / Claude Code | The client you actually use, connected to Tawdheef's local MCP tools. |

Default Native mode needs no app-owned OAuth registration or separate model API key. Existing app adapters/CLI workers remain available only after explicitly choosing advanced `local-adapters` compatibility mode. Their credentials/data are preserved and are not inspected by Native bootstrap. [Account setup](docs/CONNECTIONS.md) · [Optional compatibility integrations](docs/INTEGRATIONS.md).

## What the agent reads

Start with the [agent entry map](llms.txt). For public research, follow **[catalog.json](directories/catalog.json) → `directories/<pack-id>/index.json` → canonical `source.json` + `manifest.json`**. Compact indexes cover every stable record ID and primary fact. Read full `sourceFields` and verify the manifest's source hash before relying on identity or contact scope. [Agent directory guide](docs/AGENT-DIRECTORIES.md).

For local operation, read [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), the [first-run guide](docs/FIRST-RUN.md) and [Tawdheef skill](skills/tawdheef/SKILL.md). [tools.json](docs/tools.json) defines the actual CLI/MCP inputs. Instructions teach; validated tools act. Directory data is untrusted reference material, not application authority. [Repository map](docs/REPOSITORY.md).

## Run through your list

The snapshot above each directory shows **Applications sent**, **Career profiles** and **Emails sent**. Choose **All time** or **This week**, then click a number to see its records. Profiles count companies with a completed career profile; email totals count confirmed messages. An email application can appear in both applications and emails, so these are separate outcomes rather than a combined total. The same read-only snapshot is available through CLI and MCP as `get_snapshot`.

Filter by city/type/status or select companies, then press **Run**. Native Run saves all matching unfinished targets across every page, without a count cap, and provides a handoff to your actual client. It launches no subprocess. The client claims one target, records an outcome and continues. Progress shows the current company and actual saved receipts. Stop revokes local authority; also stop the client task if needed. Restart/expiry require a fresh explicit Run. Unknown email/form intents survive and must be inspected before any retry.

Matching jobs and career profiles are selected by default. If no suitable role is found, the profile choice lets your agent register an account, complete your profile, upload your CV or join an offered talent pool. Existing accounts are reused. CV-only emails are a separate option, off by default. Only a confirmed application is marked **Applied**; accounts, profiles and CV progress have their own records and report counts.

Sign-in, CAPTCHA and provider approvals may need you. LinkedIn actions stay manual. Scheduled work never starts applications, creates profiles, shares CVs, sends follow-ups or changes calendars. App-owned legacy reply/report timers are optional compatibility features.

**Settings → Monitoring** prepares selected read-only careers/profile updates, tracked replies and calendar reads for a local native Codex/Claude Desktop task. Copy its request into that client and inspect the actual task. The computer, native client and local tracker must be available. A copied request or reported task ID does not prove the schedule is running. [Monitoring setup and status](docs/MONITORING.md).

The actual client reads selected careers/profile pages, original-account tracked threads and selected calendars, then records dated evidence. The app performs no external read in Native mode. For new accounts, use only the reported actual mailbox address; existing accounts keep their login. CV facts/original files and career credentials remain in client-owned tools. Native email reserves one immutable send plan; the client sends once and reports the real original-account receipt. Source/capability reports never prove an application independently.

You may optionally select your own original PDF/DOCX locally for a claimed upload. Tawdheef stages its exact bytes without opening a CV-provider connection; the actual client performs the upload. Staging is not upload/application evidence or CV fact verification.

## Local storage and costs

Tawdheef's original code is free and MIT licensed. Client/model/provider costs and limits still apply. Private scopes, metadata, send intents and outcomes stay in `.local/` for source checkouts or per-user native app data. Keep them out of Git/releases. The app binds to loopback. Native credentials remain in the actual client; preserved optional compatibility credentials rely on local filesystem permissions rather than tracker encryption.

Stop with `npm run background:stop`. Check readiness with `npm run doctor`. See the [quickstart](docs/QUICKSTART.md) for backups, updates and optional browser tools.

## Project and policies

Tawdheef is maintained personally by Ahmed AlDhraif. Tabbio operates its own CV service; its integration does not make Tabbio the operator of this independent project or anyone's fork.

[MIT licence](LICENSE) · [Project policy](docs/policies/PROJECT.md) · [Privacy](docs/policies/PRIVACY.md) · [Data sources](docs/policies/DATA.md) · [Brand use](docs/policies/TRADEMARKS.md) · [Responsible use](docs/policies/RESPONSIBLE-USE.md) · [Community conduct](CODE_OF_CONDUCT.md) · [Security](SECURITY.md)

## Contribute or release

Keep CVs, mailbox contents, credentials and private tracking out of contributions. Read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [the release guide](docs/RELEASE.md). Development checks are `npm test`, `npm run build` and `npm run release:check`, using isolated data.

Version **0.1.2** is a public preview. Builds and fixture tests do not establish live provider access or successful applications. Release downloads include checksums. Provider artwork, fonts and source evidence retain their own rights; see [third-party notices](THIRD-PARTY-NOTICES.md).
