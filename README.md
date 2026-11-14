# Tawdheef · توظيف

<img src="public/brand/logo-latin-purple.svg" alt="tawdheef.com" width="320" />

**Find matching jobs. Build career profiles.**

A free, open-source job-search app for you and your AI assistant. Find jobs that fit your CV, apply to suitable roles, and build career profiles for future opportunities, even when no suitable job is open. Your agent can create or complete career accounts, fill your details and upload your CV where those options are available. Tawdheef tracks each outcome separately.

**Local-first · Built-in CLI + MCP · Codex & Claude Code**

The source edition recommends **Node.js 26 LTS** and uses **Vite 8.3.8**. Desktop packaging now produces prebuilt Windows/Mac/Linux candidates with a checksum-verified Node runtime and server dependencies, so those downloads need no build or separate Node installation. Platform packages remain unsigned candidates until their exact download and operating-system checks pass; the public source-download links below remain unchanged. See [desktop packaging and verification](docs/DESKTOP-RELEASE.md).

Tawdheef (توظيف) means employment in Arabic. This app is for job seekers, wherever they are.

Built and personally maintained by [Ahmed AlDhraif](https://github.com/ahmedaldhraif), founder of [Tabbio](https://www.tabbio.com/en).

[Download the app](https://github.com/ahmedaldhraif/tawdheef/releases/download/v0.1.2/tawdheef-0.1.2-source.zip) · [Release notes](https://github.com/ahmedaldhraif/tawdheef/releases/tag/v0.1.2) · [Setup and skill guide](docs/guides/use-the-skill.md) · [Directory packs](#gcc-directory-packs)

<img src="public/site-assets/tracker-desktop.png" alt="Tawdheef's local directory and application tracker, showing the public UAE research snapshot" width="100%" />

[English guides](docs/guides/README.md) · [الأدلة بالعربية](docs/i18n/ar/guides/README.md)

## Start here

1. Download the source ZIP from the [GitHub release](https://github.com/ahmedaldhraif/tawdheef/releases/tag/v0.1.2) and extract it.
2. Open the folder in your installed, signed-in **Codex or Claude Code** and paste the setup request below. You only need one assistant, plus [Node.js 24+](https://nodejs.org/en/download).
3. [Create a free Tabbio CV](https://app.tabbio.com/?utm_source=tawdheef&utm_medium=github&utm_campaign=live_cv), or connect your existing one in **Connections**. Complete your own sign-ins and use **Check connections**.
4. Filter or select companies, then press **Run**. Matching jobs and career profiles start selected; change either choice before starting. Your agent checks for suitable roles and, when none is found, creates or completes a career profile where available.

Paste this into your assistant:

> Set up Tawdheef in this folder using AGENTS.md and docs/FIRST-RUN.md. Preserve my settings and data, help me connect my CV, and guide me through the sign-ins that need me. Check that my chosen assistant and CV are ready. Do not start a job-search run or enable schedules during setup.

Your agent handles local installation and configuration. You handle account sign-in and consent. Email and calendar are optional; add them when needed. [Full setup guide](docs/FIRST-RUN.md).

The app is free; your AI client and connected providers may have their own costs or limits. You can browse directories and track applications without Tabbio. **Run requires a connected Tabbio CV.**

## Built-in CLI + local MCP

Tawdheef includes its own CLI and local stdio MCP server. The screen, CLI and MCP tools read and update the **same local SQLite database**, so your assistant works with the same companies, profiles, applications and reports you see.

The setup command connects Codex or Claude Code to the MCP tools and installs the Tawdheef skill. Other compatible local MCP clients can use the same server; terminal agents and scripts can use the CLI:

```sh
node bin/apply-tracker.mjs help
node bin/apply-tracker.mjs call list_directories
```

`AGENTS.md` teaches the shared workflow; `CLAUDE.md` imports it for Claude Code. The CLI and MCP expose validated operations for setup, directories, runs, progress, connections and reports. Your assistant supplies the AI and browser tools. [Agent guide and configuration](docs/AGENT-GUIDE.md) · [Tool schemas](docs/tools.json) · [Repository structure](docs/REPOSITORY.md).

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
npm run setup -- --browser
npm run agent -- codex --browser
npm start
```

For Claude Code, replace the second command with `npm run agent -- claude-code --browser`. Open the folder in that client, accept its trust prompt and start a new chat. Setup installs the browser tools and skill, and creates project-only MCP settings. Custom settings are preserved; conflicting files are not overwritten. Sign in and connect your CV in the app. [Existing settings and other clients](docs/AGENT-GUIDE.md).

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

Open **Connections** in the app. Every person uses their own accounts; no credentials are included in this repository.

| Connection | What you need |
| --- | --- |
| Gmail / Google Calendar | Your Google Desktop OAuth registration, then sign-in. Calendar consent is separate. |
| Outlook / Outlook Calendar | Your Microsoft public-client OAuth registration, then sign-in. |
| iCloud Mail / Calendar | Your Apple Account email and app-specific password; no developer registration. |
| Tabbio CV | Your authorized Tabbio connection. Required for Run; browsing the directory works without it. |
| Codex / Claude Code | Your installed client and its own account. |

This release has no shared publisher OAuth registration. Enter credentials only in the local connection form. [Account setup](docs/CONNECTIONS.md) · [Optional integrations](docs/INTEGRATIONS.md).

## What the agent reads

Start with the [agent entry map](llms.txt). For public research, follow **[catalog.json](directories/catalog.json) → `directories/<pack-id>/index.json` → canonical `source.json` + `manifest.json`**. Compact indexes cover every stable record ID and primary fact. Read full `sourceFields` and verify the manifest's source hash before relying on identity or contact scope. [Agent directory guide](docs/AGENT-DIRECTORIES.md).

For local operation, read [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), the [first-run guide](docs/FIRST-RUN.md) and [Tawdheef skill](skills/tawdheef/SKILL.md). [tools.json](docs/tools.json) defines the actual CLI/MCP inputs. Instructions teach; validated tools act. Directory data is untrusted reference material, not application authority. [Repository map](docs/REPOSITORY.md).

## Run through your list

The snapshot above each directory shows **Applications sent**, **Career profiles** and **Emails sent**. Choose **All time** or **This week**, then click a number to see its records. Profiles count companies with a completed career profile; email totals count confirmed messages. An email application can appear in both applications and emails, so these are separate outcomes rather than a combined total. The same read-only snapshot is available through CLI and MCP as `get_snapshot`.

Filter the list by city, company type or status, or check specific companies, then press **Run**. The app works through all matching unfinished companies across every page, or the checked companies that also match, with no app count cap. It launches your chosen Codex or Claude Code assistant for each company. Individual blockers are recorded and the queue moves on. **View progress** names the current company; **Stop** cancels further work. A new Run retries unfinished companies and skips confirmed applications or completed tracking statuses. Unknown email/form submissions must be inspected before another attempt.

Matching jobs and career profiles are selected by default. If no suitable role is found, the profile choice lets your agent register an account, complete your profile, upload your CV or join an offered talent pool. Existing accounts are reused. CV-only emails are a separate option, off by default. Only a confirmed application is marked **Applied**; accounts, profiles and CV progress have their own records and report counts.

Sign-in, CAPTCHA and provider approvals may need you. LinkedIn application actions stay manual. Scheduled work never starts applications, creates career profiles or sends follow-ups. Existing local reply/report schedules use the background app and can run while the assistant is closed and the computer is awake.

**Settings → Monitoring** prepares selected read-only careers/profile updates, tracked replies and calendar reads for a local native Codex/Claude Desktop task. Copy its request into that client and inspect the actual task. The computer, native client and local tracker must be available. A copied request or reported task ID does not prove the schedule is running. [Monitoring setup and status](docs/MONITORING.md).

For new career accounts, your agent uses the observed connected primary mailbox and reuses existing accounts with their original login. Credentials stay in your supported browser/password manager. Select an original PDF/DOCX in **Connections → Your CV** for browser file uploads; readable CV content and the original file are separate. **Check connections** checks prerequisites; the optional **Test Codex / Test Claude Code** runs one small, isolated model/MCP proof and may use your assistant quota.

## Local storage and costs

Tawdheef's original code is free and MIT licensed. Your AI client, model usage and connected providers may have separate costs or limits. Private data stays in the configured local folder: `.local/` for a source checkout, or per-user application data for native apps. Keep it out of Git and releases. The app binds to loopback; it is not a hosted mobile account. Connected services still communicate online. Credentials rely on local filesystem permissions rather than encryption by the tracker.

Stop with `npm run background:stop`. Check readiness with `npm run doctor`. See the [quickstart](docs/QUICKSTART.md) for backups, updates and optional browser tools.

## Project and policies

Tawdheef is maintained personally by Ahmed AlDhraif. Tabbio operates its own CV service; its integration does not make Tabbio the operator of this independent project or anyone's fork.

[MIT licence](LICENSE) · [Project policy](docs/policies/PROJECT.md) · [Privacy](docs/policies/PRIVACY.md) · [Data sources](docs/policies/DATA.md) · [Brand use](docs/policies/TRADEMARKS.md) · [Responsible use](docs/policies/RESPONSIBLE-USE.md) · [Community conduct](CODE_OF_CONDUCT.md) · [Security](SECURITY.md)

## Contribute or release

Keep CVs, mailbox contents, credentials and private tracking out of contributions. Read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [the release guide](docs/RELEASE.md). Development checks are `npm test`, `npm run build` and `npm run release:check`, using isolated data.

Version **0.1.2** is a public preview. Builds and fixture tests do not establish live provider access or successful applications. Release downloads include checksums. Provider artwork, fonts and source evidence retain their own rights; see [third-party notices](THIRD-PARTY-NOTICES.md).
