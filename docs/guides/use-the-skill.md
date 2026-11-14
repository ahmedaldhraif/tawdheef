# Set up Tawdheef with your agent

Your existing Codex or Claude Code client owns the model, sign-in and external tools. Tawdheef keeps your companies, selected actions and recorded outcomes locally.

## Install {#install}

These steps match the current Native source. The older v0.1.2 download uses a different connection flow.

[app-download]: #

Extract the source, install [Node.js 26 LTS](https://nodejs.org/en/download), then run in the app folder:

```sh
npm start
```

This starts the tracker, not job-search work. Verified platform packages include their runtime; check [desktop release status](https://github.com/ahmedaldhraif/tawdheef-auto-apply-jobs/blob/main/docs/DESKTOP-RELEASE.md) before choosing one.

## Connect your agent {#agent}

1. Open **Connections → Assistant** and choose Codex or Claude Code.
2. Use **Copy setup request** and paste it into that client.
3. Reuse existing tools and connections. Complete project/server trust, sign-in and consent in the client.

[setup-prompt]: #

### If you prefer the terminal {#if-you-prefer-the-terminal}

The copied request is the main path. Manual source connection:

```sh
npm run agent -- codex
```

Use `npm run agent -- claude-code` instead for Claude Code. These configure tracker MCP and its skill, not provider authentication. Packages use their setup request's exact bundled-runtime paths.

## Connect your CV {#cv}

Open **Connections → Tabbio CV**. Create a CV if needed or reuse your account. Copy the request into your agent. It connects Tabbio and reads your real authorized CV through its own tools. Complete sign-in in the client, not a second tracker credential form.

Email, Calendar, Browser & computer use and Passwords have separate requests. Add only what you need. Unknown and Needs you are valid states; a dated Client reported observation is not independent proof of access.

[Create or connect your CV](https://github.com/ahmedaldhraif/tawdheef-auto-apply-jobs/blob/main/docs/guides/connect-your-cv.md).

## Workflow {#workflow}

Review companies and jobs. Choose Run actions and targets, then paste its copied request into the selected client. It uses its own tools and records outcomes in Tawdheef. Applications, career profiles and optional CV-only emails are distinct choices.

Run does not launch another assistant. Stop revokes tracker authority; stop remaining work in the client too.

## Use {#use}

### Already connected? Install just the skill {#already-connected-install-just-the-skill}

{{skill-install}}

This adds instructions only. It does not install the app, connect accounts or authorize applications.

### Prompts {#prompts}

> Read AGENTS.md and call get_agent_context and get_capabilities. Use my actual client's real CV and preferences to suggest a shortlist. Do not send or submit anything.

## Permissions {#permissions}

Only your explicit selected Run actions authorize submissions. Sign-in, CAPTCHA and provider approvals may need you. LinkedIn actions remain manual. Record real receipts, not assumed success.

## Privacy {#privacy}

Private tracking stays locally. External access stays in your actual client. Tawdheef stores references and dated observations, not copies of hidden client sessions or CV text. Keep credentials and private records out of GitHub.
