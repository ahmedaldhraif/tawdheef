export default {
  "hero": {
    "line1": "Find matching jobs.",
    "line2": "Build career profiles.",
    "subtitle": "Your agent owns its connections and tools. Tawdheef keeps companies, jobs and applications in one local record through CLI and MCP.",
    "installNote": "App setup below already installs this skill. Use this command if you only need its workflow guidance.",
    "setupLink": "App setup below",
    "community": "The app, directory packs and agent skills grow together. Help improve Tawdheef on GitHub.",
    "source": "Read the skill source",
    "license": "MIT licensed",
    "release": "Previous release"
  },
  "commandRows": [
    {
      "request": "Read the local context",
      "tool": "get_agent_context"
    },
    {
      "request": "Show the available tools",
      "tool": "get_capabilities"
    },
    {
      "request": "Show my country directories",
      "tool": "list_directories"
    },
    {
      "request": "Show companies in this directory",
      "tool": "list_companies"
    },
    {
      "request": "Read this company's original sources",
      "tool": "get_company"
    },
    {
      "request": "Check my saved connections",
      "tool": "list_connections"
    },
    {
      "request": "Check what setup needs next",
      "tool": "get_setup_status"
    },
    {
      "request": "Review my recorded progress",
      "tool": "get_report"
    }
  ],
  "cvShortcut": "Create or connect your CV",
  "start": {
    "title": "Get started",
    "body": "Start the app, choose your assistant in Connections, then copy its setup request.",
    "requirement": "These steps match the current Native source. The older v0.1.2 download uses a different setup.",
    "researchAlternative": "Explore company data first",
    "download": "Get current source",
    "repository": "View or clone on GitHub",
    "steps": [
      {
        "title": "Start Tawdheef",
        "body": "Download and extract the source, then run npm start in its folder."
      },
      {
        "title": "Choose your assistant",
        "body": "Open Connections → Assistant and choose Codex or Claude Code. Copy the setup request into that client."
      },
      {
        "title": "Connect your CV through your agent",
        "body": "Open Connections → Tabbio CV. Copy its request into your agent and complete provider sign-in and consent in that client."
      }
    ],
    "nodeRequirement": "Use Node.js 26 LTS for source.",
    "cliIntro": "For a manual Codex setup:",
    "claudeAlternative": "For manual Claude Code setup instead of Codex:",
    "cliNote": "These are optional local connection commands. Reuse your client’s existing connections; do not create a second mailbox or browser session in Tawdheef.",
    "setupPrompt": "Copy the setup request",
    "cvCreate": "Create your free CV",
    "cvConnect": "Connect your CV",
    "cvPath": "CV, email, calendar, browser and password-manager access stay in your actual client.",
    "cvCheck": "Connections shows Unknown, Needs you or a dated Client reported status.",
    "cvReadNote": "Run copies a scoped request for your agent. Review its actions and companies before pasting."
  },
  "guideGroups": {
    "Start": "Get started",
    "Use": "Using Tawdheef",
    "Fix": "When you need help",
    "Reference": "For your agent"
  },
  "guides": {
    "title": "Guides",
    "body": "Set up, find matching jobs and build career profiles for future opportunities."
  },
  "cardLabels": {
    "run": "Run",
    "replies": "Check replies",
    "doctor": "npm run doctor",
    "agents": "MCP / CLI"
  }
};
