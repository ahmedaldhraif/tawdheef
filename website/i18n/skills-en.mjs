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
    { request: "Check my client-reported connections", tool: "get_native_client_status" },
    { request: "Check what setup needs next", tool: "get_setup_status" },
    { request: "Review my recorded progress", tool: "get_report" }
  ],
  cvShortcut: "Create or connect your CV",
  start: {
    title: "Get started",
    body: "Download the app, connect your existing client, then use its CV and account tools. The native workflow describes the 0.2 preview; check the selected release version.",
    requirement: "Run hands work to your existing Codex or Claude Code client. It reads the real authorized Tabbio CV before matching or submitting.",
    researchAlternative: "Explore company data first",
    download: "Download the app",
    repository: "View or clone on GitHub",
    steps: [
      {
        title: "Open the app folder",
        body: "Extract the complete app, or open the source folder in your existing Codex or Claude Code client."
      },
      {
        title: "Connect your agent",
        body: "Copy the setup request into your existing client, or run these Codex commands in the source folder."
      },
      {
        title: "Create or connect your CV",
        body: "Create your free digital CV on Tabbio, or connect the one you already have."
      }
    ],
    nodeRequirement: "Source needs Node.js 26 LTS or patched Node 24; app packages include Node.",
    cliIntro: "For a manual Codex setup:",
    claudeAlternative: "Using Claude Code? Replace the second command with:",
    cliNote: "These prepare the app, connect its local MCP tools and install the workflow skill.",
    setupPrompt: "Copy the setup request",
    cvCreate: "Create your free CV",
    cvConnect: "Connect your CV",
    cvPath: "Open Connections → Tabbio CV, copy its setup request and complete sign-in in your actual client.",
    cvCheck: "Reuse that client’s Tabbio MCP connection and check the real CV there.",
    cvReadNote: "Run copies a request for your existing client. Dated connection reports are not independent provider verification."
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
