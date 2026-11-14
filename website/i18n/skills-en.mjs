export default {
  hero: {
    line1: "Find matching jobs.",
    line2: "Build career profiles.",
    subtitle: "Use your real CV with Codex or Claude Code. Tawdheef connects your agent to your local tracker through its built-in CLI and MCP.",
    installNote: "App setup below already installs this skill. Use this command if you only need its workflow guidance.",
    setupLink: "App setup below",
    source: "Read the skill source",
    license: "MIT licensed",
    release: "Release"
  },
  commandRows: [
    { request: "Read the local context", tool: "get_agent_context" },
    { request: "Show the available tools", tool: "get_capabilities" },
    { request: "Show my country directories", tool: "list_directories" },
    { request: "Show companies in this directory", tool: "list_companies" },
    { request: "Read this company's original sources", tool: "get_company" },
    { request: "Check my saved connections", tool: "list_connections" },
    { request: "Check what setup needs next", tool: "get_setup_status" },
    { request: "Review my recorded progress", tool: "get_report" }
  ],
  cvShortcut: "Create or connect your CV",
  start: {
    title: "Get started",
    body: "Download the app, let your agent set it up, then connect your CV.",
    download: "Download the app",
    repository: "View or clone on GitHub",
    steps: [
      {
        title: "Open the app folder",
        body: "Extract the source ZIP and open its folder in your installed, signed-in Codex or Claude Code."
      },
      {
        title: "Connect your agent",
        body: "Copy the setup request into your agent, or run these Codex commands in the app folder."
      },
      {
        title: "Create or connect your CV",
        body: "Create your free digital CV on Tabbio, or connect the one you already have."
      }
    ],
    nodeRequirement: "Node.js 24 or newer is required.",
    cliIntro: "For a manual Codex setup:",
    claudeAlternative: "Using Claude Code? Replace the second command with:",
    cliNote: "These prepare the app, connect its local MCP tools and install the workflow skill.",
    setupPrompt: "Copy the setup request",
    cvCreate: "Create your free CV",
    cvConnect: "Connect your CV",
    cvPath: "In Tawdheef, open Connections → Your CV → Tabbio CV, then complete sign-in.",
    cvCheck: "Choose your assistant and use Check connections.",
    cvReadNote: "Your agent uses your connected CV when you start Run."
  },
  guideGroups: {
    Start: "Get started",
    Use: "Using Tawdheef",
    Fix: "When you need help",
    Reference: "For your agent"
  },
  guides: {
    title: "Guides",
    body: "Set up, find matching jobs and build career profiles for future opportunities."
  },
  cardLabels: {
    run: "Run",
    replies: "Check replies",
    doctor: "npm run doctor",
    agents: "MCP / CLI"
  }
};
