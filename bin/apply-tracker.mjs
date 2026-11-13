#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildTools,
  closeToolConnections,
  runMcp,
  machineError,
} from "../server/mcp.mjs";

function parse(argv) {
  const positional = [],
    flags = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (!value.startsWith("--")) positional.push(value);
    else {
      const [key, inline] = value.slice(2).split(/=(.*)/s);
      if (inline !== undefined) flags[key] = inline;
      else if (argv[index + 1] && !argv[index + 1].startsWith("--"))
        flags[key] = argv[++index];
      else flags[key] = true;
    }
  }
  return { positional, flags };
}

const usage = `Apply Tracker — local job hunt records\n\nCommands:\n  context | capabilities | tools\n  symbols [--search TEXT] [--category countries|folders|work|education|interests]\n  directories\n  list [--directory ID] [--search TEXT] [--status STATUS] [--attention needs_you|follow_up_due] [--limit 20] [--offset 0] [--full]\n  company get ID\n  company update ID --input-file patch.json\n  directory add --input-file directory.json\n  import --directory ID --file list.csv [--commit]\n  export --directory ID --output list.csv [--format csv|json]\n  applications list COMPANY_ID\n  applications log --input-file event.json\n  run start --input-file run.json\n  run get ID\n  run finish ID\n  replies check\n  cv [--refresh]\n  report [--since ISO_DATE]\n  report generate [--email]\n  send-email --input-file application-email.json\n  settings [--input-file patch.json]\n  call TOOL --input-file arguments.json\n  mcp\n  doctor\n  background start|stop|status|install|uninstall\n\nImport previews until --commit. Report generation stays local unless --email.\nProvider actions use the running local app's connections; record tools work offline.\n--json '{...}' also supplies structured input. All results are JSON.\nPrivate data: APPLY_TRACKER_DATA, or .local beside this checkout.\n`;

function booleanFlag(value) {
  if (value === undefined || value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  throw new Error("Boolean flags accept true or false.");
}

async function inputFrom(flags) {
  if (flags["input-file"]) {
    const path = resolve(flags["input-file"]);
    const info = await stat(path);
    if (!info.isFile() || info.size > 30 * 1024 * 1024)
      throw new Error("Use an input JSON file smaller than 30 MB.");
    return JSON.parse(await readFile(path, "utf8"));
  }
  if (typeof flags.json === "string") return JSON.parse(flags.json);
  return {};
}

export async function main(argv = process.argv.slice(2)) {
  const {
    positional: [command, subcommand, id],
    flags,
  } = parse(argv);
  if (!command || command === "help" || flags.help) {
    process.stdout.write(usage + '\nConnections and calendar:\n  integrations\n  client-config [--include playwright,tabbio,outlook-mcp]\n  reconcile-email APPLICATION_ID\n  calendar list\n  calendar events --input-file range.json\n  calendar add --input-file event.json\n\nFresh checkout: npm run setup; npm start; npm run doctor.\n');
    return;
  }
  if (command === "mcp") {
    await runMcp();
    return;
  }
  if (command === "background") {
    const { backgroundCommand } = await import("../scripts/background.mjs");
    return backgroundCommand(subcommand || "status");
  }
  const { openStore } = await import("../server/store.mjs");
  const store = openStore({ dataDir: process.env.APPLY_TRACKER_DATA });
  try {
    const input = await inputFrom(flags);
    const tools = buildTools(store);
    const call = async (name, args = {}) => {
      const tool = tools.find((entry) => entry.name === name);
      if (!tool)
        throw new Error(
          `Unknown tool ${name}. Available: ${tools.map((entry) => entry.name).join(", ")}`,
        );
      return tool.handler(args);
    };
    if (command === "doctor") {
      const context = await call("get_agent_context");
      const integrations = await call('get_integrations');
      return {
        integrations,
        node: process.version,
        nodeSupported: Number(process.versions.node.split(".")[0]) >= 24,
        storage: "local SQLite",
        dataDir: store.dataDir,
        app: context.app,
        localUrl: context.localUrl,
        directories: context.directories.map(({ id, name, count }) => ({
          id,
          name,
          count,
        })),
        nextStep:
          context.app === "running"
            ? "Use context or tools to inspect the shared local contract."
            : "Start the local app for provider actions. Record tools still work offline.",
      };
    }
    if (command === "tools")
      return tools.map(({ handler, ...definition }) => definition);
    if (command === "context") return await call("get_agent_context");
    if (command === "capabilities") return await call("get_capabilities");
    if (command === 'integrations') return await call('get_integrations');
    if (command === 'client-config') return await call('get_client_config', { include: typeof flags.include === 'string' ? flags.include.split(',') : [] });
    if (command === 'reconcile-email') return await call('reconcile_application_email', { applicationId: subcommand });
    if (command === 'calendar') return await call(subcommand === 'list' ? 'list_calendars' : subcommand === 'events' ? 'list_calendar_events' : subcommand === 'add' ? 'create_calendar_event' : 'unsupported_calendar_command', input);
    if (command === "symbols")
      return await call("list_directory_symbols", {
        ...(flags.search ? { search: flags.search } : {}),
        ...(flags.category ? { category: flags.category } : {}),
        ...(flags.locale ? { locale: flags.locale } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
    if (command === "call") return await call(subcommand, input);
    if (command === "directories") return await call("list_directories");
    if (command === "list")
      return await call("list_companies", {
        ...(flags.directory ? { directoryId: flags.directory } : {}),
        ...(flags.search ? { search: flags.search } : {}),
        ...(flags.status ? { status: flags.status } : {}),
        ...(flags.attention ? { attention: flags.attention } : {}),
        ...(flags.sort ? { sort: flags.sort } : {}),
        ...(flags.direction ? { direction: flags.direction } : {}),
        compact: !booleanFlag(flags.full),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        ...(flags.offset ? { offset: Number(flags.offset) } : {}),
      });
    if (command === "import")
      return await call("import_directory", {
        ...input,
        directoryId: flags.directory || input.directoryId,
        ...(flags.file || input.filePath
          ? { filePath: flags.file || input.filePath }
          : {}),
        commit:
          flags.commit !== undefined
            ? booleanFlag(flags.commit)
            : input.commit === true,
      });
    if (command === "export")
      return await call("export_directory", {
        ...input,
        directoryId: flags.directory || input.directoryId,
        filePath: flags.output || input.filePath,
        format: flags.format || input.format || "csv",
      });
    if (command === "company" && subcommand === "get")
      return await call("get_company", { id });
    if (command === "company" && subcommand === "update")
      return await call("update_company", { id, patch: input });
    if (command === "directory" && subcommand === "add")
      return await call("create_directory", input);
    if (command === "applications" && subcommand === "list")
      return await call("list_applications", { companyId: id });
    if (command === "applications" && subcommand === "log")
      return await call("log_application", input);
    if (command === "run" && subcommand === "start")
      return await call("start_run", input);
    if (command === "run" && subcommand === "get")
      return await call("get_run", { id });
    if (command === "run" && subcommand === "finish")
      return await call("update_run", { id, patch: { status: "completed" } });
    if (command === "replies" && subcommand === "check")
      return await call("refresh_replies");
    if (command === "cv")
      return await call("get_cv", {
        refresh: booleanFlag(flags.refresh),
        ...(flags.offset ? { offset: Number(flags.offset) } : {}),
        ...(flags["max-chars"] ? { maxChars: Number(flags["max-chars"]) } : {}),
      });
    if (command === "send-email")
      return await call("send_application_email", input);
    if (command === "report")
      return await call(
        subcommand === "generate" ? "generate_report" : "get_report",
        {
          ...(flags.since ? { since: flags.since } : {}),
          ...(subcommand === "generate"
            ? { sendEmail: booleanFlag(flags.email) }
            : {}),
        },
      );
    if (command === "settings")
      return Object.keys(input).length
        ? await call("update_settings", { patch: input })
        : await call("get_settings");
    throw new Error(`Unknown command. Run apply-tracker help for examples.`);
  } finally {
    await closeToolConnections(store);
    store.close();
  }
}

main()
  .then((data) => {
    if (data !== undefined)
      process.stdout.write(`${JSON.stringify({ ok: true, data }, null, 2)}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${JSON.stringify(machineError(error))}\n`);
    process.exitCode = 1;
  });
