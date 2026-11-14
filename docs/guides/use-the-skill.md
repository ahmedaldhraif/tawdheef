# Set up Tawdheef with your agent

Find matching jobs and build career profiles, including when no suitable job is open. Tawdheef is a local-first app with its own CLI and local MCP server. Codex or Claude Code does the work using your connected CV and accounts.

## Install

Download the package matching your OS/architecture from [GitHub Releases](https://github.com/ahmedaldhraif/tawdheef/releases), when available. Extract the whole folder and open its launcher. Prebuilt packages include Node and the interface. Read the release's signing status; a preview is not a signed distribution.

[app-download]: #

The source ZIP is an alternative: open it in your existing **Codex or Claude Code** client. Source users need [Node.js 24 or newer](https://nodejs.org/en/download); the agent can guide setup. The native workflow below describes the 0.2 preview; inspect the selected release's actual version and capabilities.

## Agent

Copy [the setup request](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/FIRST-RUN.md#give-your-agent-one-setup-request) into your assistant with the Tawdheef folder open. It checks existing setup, starts the app and connects the local tools and workflow skill.

[setup-prompt]: #

Choose the assistant in **Connections** and paste **Copy setup request** into that existing client. Sign-in, consent, Tabbio CV, mail, calendar, browser/computer tools and password-manager access belong to the actual client. Accept its normal project/server trust prompts. Tawdheef records dated reports and local tracker tool use without independently verifying external access.

Use the local Codex or Claude Code client; ChatGPT and Claude web chats do not read the app's local MCP settings.

### If you prefer the terminal

For the source edition, run these from the extracted folder to start the app and connect Codex:

```sh
npm start
npm run agent -- codex
```

For Claude Code, replace the second command with:

```sh
npm run agent -- claude-code
```

This creates project-only settings for Tawdheef's local **stdio MCP server** and installs the skill. Existing custom settings are preserved; follow the reported merge instructions if they conflict. Reopen the project or start a new chat so your assistant loads the tools.

The app also has its own CLI: `node bin/apply-tracker.mjs help`. The screen, CLI and MCP use the same local records. MCP lets a compatible local agent call tools directly; the CLI supports terminal agents and scripts. [See the tool reference](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/AGENT-GUIDE.md).

External tools are reused in the chosen client. Add `--tabbio` to its agent command only when you want a direct Tabbio MCP entry. App-owned provider adapters and browser bridges require an explicit **Advanced compatibility** choice and `--local-adapters`; they are excluded from the ordinary app runtime. See [Connect your agent](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/connect-your-agent.md).

## CV

1. [Create your free CV](https://app.tabbio.com/?utm_source=tawdheef&utm_medium=setup&utm_campaign=live_cv) on Tabbio, or use your existing account. Add and review your real experience, education and skills.
2. Open **Connections → Tabbio CV → Copy setup request** and paste it into the selected client.
3. Reuse or configure that client's Tabbio connection, complete sign-in/consent there and read the real CV. Report only source/update metadata to Tawdheef.

A real readable CV is required for matching decisions. You can browse and track records without one. See [Create or connect your CV](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/connect-your-cv.md) if access needs attention.

Your agent can inspect local setup status with `get_setup_status`. Native `verify:true` still performs no model/CLI/provider check; the actual client checks its tools and reports observations. For a local status read, save this as `.local/setup-check.json`, replacing `codex` with `claude-code` if needed:

```json
{"verify":true,"assistant":"codex"}
```

Then run:

```sh
node bin/apply-tracker.mjs call get_setup_status --input-file .local/setup-check.json
```

Use your configured private data folder if you changed `APPLY_TRACKER_DATA`.

Follow the [official Tabbio connection guide](https://www.tabbio.com/en/mcp) for the actual client tools. Native Tawdheef does not own another Tabbio session or cache the CV. Editing, publishing, visibility changes and sharing each require the corresponding user request.

## Workflow

Choose the bundled UAE directory or [add a country pack](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/use-directory-packs.md). Filter the list by city, company type or status, and select individual companies if you want a smaller scope. Open **Run** to review the matching company count and actions.

Matching jobs and career profiles are selected by default. Your agent checks vacancies against your CV. When no suitable job is open, it can create or complete a career account, fill your profile and upload your CV where supported. You can change these choices before starting; CV-only emails are optional and off by default.

Press Run, then paste its copied request into the existing client chat. Tawdheef waits for that client and launches no second model or CLI. Career profiles, CV uploads and confirmed applications remain separate. Stop revokes new tracker authority; stop any remaining task in the client too. [Read the run guide](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/apply-to-jobs.md).

## Use

In Codex, mention `$tawdheef`. In Claude Code, use `/tawdheef`. Give your agent a task below, replacing bracketed text with your own targets or preferences.

### Already connected? Install just the skill

App setup already installs the skill. If you only need its guidance in another supported assistant, run:

```sh
npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef
```

Choose your assistant in the installer. This adds guidance; it does not install the app, connect MCP tools, sign into accounts or authorise job-search actions. [Read the actual skill source](https://github.com/ahmedaldhraif/tawdheef/blob/main/skills/tawdheef/SKILL.md).

### Prompts

Find a shortlist:

```text
Shortlist suitable companies in [directory] for [role and location]. Check the source evidence and my connected CV. Explain the fit and missing information. Do not apply or send messages.
```

Start a run for matching jobs and career profiles:

```text
Start a run for [company names] in [directory] for [role and location]. Use my real CV and apply to suitable jobs. If no suitable job is open, create or complete my career profile and upload my CV where supported. Reuse existing accounts and check for duplicates. Leave CV-only emails off. Record real outcomes and anything that needs me.
```

Review existing work:

```text
Check replies for my tracked application threads. Summarise real changes and next actions, then save a local report. Do not start applications, send follow-ups or email the report.
```

## Permissions

Setup and skill installation do not authorise applications, profiles or CV sharing. A requested run covers only the targets and actions you requested. Sign-ins, CAPTCHAs and provider approvals may need you; LinkedIn application steps remain manual. An application needs a real receipt or confirmation, while profile work keeps its own evidence.

## Privacy

Tracking records stay in the private local data folder. Native provider credentials and browser/password-manager sessions stay with the actual client/provider. AI, CV and mail services still process online requests under their own permissions and terms; local-first does not mean those services work offline. Never paste credentials into tracker records, chat or public issues.

Tawdheef is free; your assistant account and connected services may have their own costs. [Read the privacy guide](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/policies/PRIVACY.md).
