# Use the Tawdheef skill

Give Codex or Claude Code a practical workflow for finding companies, applying when you ask and keeping your tracker accurate.

## Install

The recommended [app setup](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/FIRST-RUN.md) already installs the skill for your chosen assistant. If your app is connected and you only need the guidance, run:

```sh
npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef
```

Choose Codex or Claude Code in the installer. Installing guidance does not install Tawdheef, connect its tools or sign into an account.

## Use

1. Open your Tawdheef folder in your signed-in assistant.
2. In Codex, mention `$tawdheef`. In Claude Code, use `/tawdheef`.
3. Give it one task below. Replace bracketed text with your own targets or preferences.

If the tracker tools are missing, follow [Connect your agent](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/guides/connect-your-agent.md).

## Workflow

Your agent reads the directory evidence and your authorised CV, checks the requested scope and records what actually happened. A shortlist does not start applications. An application needs a real receipt or confirmation.

### Prompts

Find a shortlist:

```text
Shortlist 10 companies in [directory] for [role and location]. Check the source evidence and my connected CV. Explain the fit and missing information. Do not apply or send messages.
```

Start an explicit application run:

```text
Start an application run for [company names] in [directory] for [role and location]. Use my real CV, check duplicates and apply to suitable roles within that scope. Record confirmations and anything that needs me.
```

Review existing work:

```text
Check replies for my tracked application threads. Summarise real changes and next actions, then save a local report. Do not start applications, send follow-ups or email the report.
```

## Permissions

Run requires a readable connected Tabbio CV. Setup and skill installation authorise no applications. A requested run covers its named targets; provider permissions still apply. Sign-ins, CAPTCHAs and identity checks may need you. LinkedIn application steps stay manual.

The tracker reads your CV. Editing or publishing through Tabbio MCP or CLI is a separate connection and request.
