import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openStore } from "../server/store.mjs";
import {
  buildTools,
  closeToolConnections,
  machineError,
} from "../server/mcp.mjs";
import { backgroundCommand } from "../scripts/background.mjs";
import { main as runCli } from '../bin/apply-tracker.mjs';

const root = fileURLToPath(new URL("..", import.meta.url));
const run = promisify(execFile);
const temp = () => mkdtemp(join(tmpdir(), "apply-tracker-machine-"));
const unpack = (result) =>
  result.structuredContent || JSON.parse(result.content[0].text);

test('general CLI fails closed for scoped monitoring and retired roles before opening data', async () => {
  const dataDir = await temp(), keys = ['APPLY_TRACKER_DATA', 'APPLY_TRACKER_MONITOR', 'APPLY_TRACKER_MONITOR_ASSISTANT', 'APPLY_TRACKER_OPERATOR_RUN', 'APPLY_TRACKER_OPERATOR_COMPANY', 'APPLY_TRACKER_DIAGNOSTIC', 'APPLY_TRACKER_DIAGNOSTIC_RECEIPT'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    process.env.APPLY_TRACKER_DATA = dataDir;
    for (const role of [{ APPLY_TRACKER_MONITOR: '1', APPLY_TRACKER_MONITOR_ASSISTANT: 'codex' }, { APPLY_TRACKER_MONITOR_ASSISTANT: 'codex' }, { APPLY_TRACKER_OPERATOR_RUN: 'old-run', APPLY_TRACKER_OPERATOR_COMPANY: 'old-company' }, { APPLY_TRACKER_DIAGNOSTIC: '1' }, { APPLY_TRACKER_DIAGNOSTIC_RECEIPT: 'old-receipt' }]) {
      Object.assign(process.env, role);
      for (const command of [['tools'], ['call', 'start_native_run', '--json', '{}'], ['background', 'start']]) await assert.rejects(runCli(command), /configured restricted stdio MCP/);
      for (const key of Object.keys(role)) delete process.env[key];
    }
    await assert.rejects(readFile(join(dataDir, 'tracker.sqlite')), { code: 'ENOENT' });
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
  }
});

test("real Native stdio MCP shares records while retired adapter environment cannot expose provider actions", async () => {
  const dataDir = await temp();
  const seed = openStore({ dataDir, seed: false });
  seed.close();
  // A disposable old-version fixture, not the user's database or an application write path.
  const legacyDb = new DatabaseSync(join(dataDir, 'tracker.sqlite'));
  const originalSettings = legacyDb.prepare('SELECT payload FROM settings WHERE id = ?').get('main').payload;
  const savedSettings = JSON.stringify({ ...JSON.parse(originalSettings), connectionMode: 'local-adapters' });
  legacyDb.prepare('UPDATE settings SET payload = ? WHERE id = ?').run(savedSettings, 'main'); legacyDb.close();
  const client = new Client({ name: 'local-contract-test', version: '1' });
  const env = { ...process.env, APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_CONNECTION_MODE: 'local-adapters', APPLY_TRACKER_CLIENT: 'codex', APPLY_TRACKER_PORT: '65532' };
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, 'server/mcp.mjs')], env, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const catalog = (await client.listTools()).tools, names = catalog.map(tool => tool.name);
    assert.match(client.getInstructions(), /actual Codex or Claude Code client owns/);
    assert.equal(names.length, 69);
    for (const name of ['get_cv', 'send_application_email', 'configure_connection', 'get_connection_tools', 'create_calendar_event', 'save_monitor', 'set_monitor_status', 'update_run']) assert.ok(!names.includes(name), name);
    const call = async (name, args = {}) => unpack(await client.callTool({ name, arguments: args }));
    const capabilities = (await call('get_capabilities')).data;
    assert.equal(capabilities.mode, 'native'); assert.equal(capabilities.connectionOwner, 'native-client'); assert.deepEqual(capabilities.toolNames, names);
    const directory = (await call('create_directory', { name: 'Fixture employers', flag: '🧪' })).data;
    const imported = (await call('add_companies', { directoryId: directory.id, records: [{ name: 'Fixture Company', careersUrl: 'https://example.test/careers', sourceFields: { evidence: 'fixture only' } }] })).data;
    const companyId = imported.ids[0];
    const prepared = await call('log_application', { companyId, role: 'Engineer', status: 'prepared', method: 'email' });
    assert.equal(prepared.ok, false, 'Even a prepared action needs its original Native Run identity.');
    assert.equal((await call('start_run', { directoryId: directory.id, explicit: false, mode: 'send_and_submit' })).ok, false);
    const reader = openStore({ dataDir });
    try { assert.equal(reader.getCompany(companyId).status, 'not_started'); assert.equal(reader.listApplications(companyId).length, 0); assert.equal(reader.getCompany(companyId).sourceFields.evidence, 'fixture only'); assert.equal(reader.getSettings().connectionMode, 'native'); }
    finally { reader.close(); }
    const preservedDb = new DatabaseSync(join(dataDir, 'tracker.sqlite'), { readOnly: true });
    try { assert.equal(preservedDb.prepare('SELECT payload FROM settings WHERE id = ?').get('main').payload, savedSettings, 'Retirement does not rewrite stored settings.'); }
    finally { preservedDb.close(); }
  } finally { await client.close(); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); }
});

test("CLI structured input updates the same local record without changing source evidence", async () => {
  const dataDir = await temp();
  const store = openStore({ dataDir, seed: false });
  const directory = store.createDirectory({ name: "CLI fixture" });
  const companyId = store.addCompanies(directory.id, [
    { name: "CLI Company", sourceFields: { checkedBy: "fixture" } },
  ]).ids[0];
  store.close();
  const inputPath = join(dataDir, "update.json");
  await writeFile(
    inputPath,
    JSON.stringify({ notes: "Follow up next week", followUpAt: "2026-12-01" }),
  );
  try {
    const { stdout } = await run(
      process.execPath,
      [
        join(root, "bin", "apply-tracker.mjs"),
        "company",
        "update",
        companyId,
        "--input-file",
        inputPath,
      ],
      { env: { ...process.env, APPLY_TRACKER_DATA: dataDir }, timeout: 15000 },
    );
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.data.notes, "Follow up next week");
    const { stdout: listed } = await run(
      process.execPath,
      [
        join(root, "bin", "apply-tracker.mjs"),
        "list",
        "--directory",
        directory.id,
      ],
      { env: { ...process.env, APPLY_TRACKER_DATA: dataDir }, timeout: 15000 },
    );
    const records = JSON.parse(listed).data;
    assert.equal(records.total, 1);
    assert.equal(records.compact, true);
    assert.equal(records.items[0].sourceFields, undefined);
    const { stdout: full } = await run(
      process.execPath,
      [join(root, "bin", "apply-tracker.mjs"), "company", "get", companyId],
      { env: { ...process.env, APPLY_TRACKER_DATA: dataDir }, timeout: 15000 },
    );
    assert.equal(JSON.parse(full).data.sourceFields.checkedBy, "fixture");
    assert.equal(records.items[0].followUpAt, "2026-12-01");
    const { stdout: report } = await run(
      process.execPath,
      [
        join(root, "bin", "apply-tracker.mjs"),
        "report",
        "generate",
        "--email=false",
      ],
      { env: { ...process.env, APPLY_TRACKER_DATA: dataDir }, timeout: 15000 },
    );
    assert.equal(JSON.parse(report).data.delivery.status, "local");
  } finally {
    await rm(dataDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});

test("background stop refuses to kill a process without the matching app instance", async () => {
  const dataDir = await temp();
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({ ok: true, instanceId: "different-instance" }),
    );
  });
  await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
  const state = {
    pid: process.pid,
    nonce: "test-instance",
    root: resolve(root),
    port: server.address().port,
    startedAt: new Date().toISOString(),
  };
  await writeFile(join(dataDir, "background.json"), JSON.stringify(state));
  try {
    assert.equal(
      (await backgroundCommand("status", { dataDir })).running,
      false,
    );
    await assert.rejects(
      backgroundCommand("stop", { dataDir }),
      /unverified process/,
    );
    assert.equal(
      JSON.parse(await readFile(join(dataDir, "background.json"), "utf8")).pid,
      process.pid,
    );
    assert.doesNotThrow(() => process.kill(process.pid, 0));
  } finally {
    await new Promise((accept) => server.close(accept));
    await rm(dataDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});

test("detached background runner serves its own instance and stops without an AI client", async () => {
  const dataDir = await temp();
  const reservation = createServer();
  await new Promise((accept) => reservation.listen(0, "127.0.0.1", accept));
  const port = reservation.address().port;
  await new Promise((accept) => reservation.close(accept));
  try {
    const started = await backgroundCommand("start", { dataDir, port });
    assert.equal(started.running, true);
    const status = await backgroundCommand("status", { dataDir, port });
    assert.equal(status.running, true);
    assert.equal(status.startupSupported, ['win32', 'darwin', 'linux'].includes(process.platform));
    assert.equal(typeof status.startupInstalled, "boolean");
    assert.equal(status.pid, started.pid);
    const health = await (
      await fetch(`http://127.0.0.1:${port}/api/health`)
    ).json();
    const state = JSON.parse(
      await readFile(join(dataDir, "background.json"), "utf8"),
    );
    assert.equal(health.instanceId, state.nonce);
    const stopped = await backgroundCommand("stop", { dataDir, port });
    assert.equal(stopped.running, false);
    assert.equal(
      (await backgroundCommand("status", { dataDir, port })).running,
      false,
    );
  } finally {
    await backgroundCommand("stop", { dataDir, port }).catch(() => {});
    await rm(dataDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});

test("agent import previews before commit, exports privately without overwriting, and shares directory symbols", async () => {
  const dataDir = await temp(),
    store = openStore({ dataDir, seed: false });
  const tools = buildTools(store, { assistant: 'codex' }),
    call = (name, args = {}) =>
      tools.find((tool) => tool.name === name).handler(args);
  try {
    const directory = await call("create_directory", {
      name: "Import fixture",
      flag: "AE",
    });
    const content =
      "Company,Website,Careers,LinkedIn,Email,Record ID\nFixture Alpha,https://example.test/,https://example.test/careers,https://www.linkedin.com/company/fixture/,jobs@example.test,source-alpha";
    const input = {
      directoryId: directory.id,
      filename: "fixture.csv",
      content,
    };
    const preview = await call("import_directory", input);
    assert.equal(preview.committed, false);
    assert.equal(preview.total, 1);
    assert.equal(store.listCompanies({ directoryId: directory.id }).total, 0);
    const imported = await call("import_directory", { ...input, commit: true });
    assert.equal(imported.added, 1);
    const list = await call("list_companies", { directoryId: directory.id });
    assert.equal(list.compact, true);
    assert.equal(list.items[0].sourceFields, undefined);
    const company = await call("get_company", { id: list.items[0].id });
    assert.equal(company.sourceId, "source-alpha");
    assert.ok(Object.keys(company.sourceFields).length);
    const target = join(dataDir, "export.csv");
    const exported = await call("export_directory", {
      directoryId: directory.id,
      filePath: target,
    });
    assert.equal(exported.records, 1);
    const csv = await readFile(target, "utf8");
    for (const text of [
      "https://example.test/careers",
      "https://www.linkedin.com/company/fixture/",
      "jobs@example.test",
      "source-alpha",
    ])
      assert.ok(csv.includes(text));
    await assert.rejects(
      call("export_directory", { directoryId: directory.id, filePath: target }),
      (error) => error.code === "FILE_EXISTS",
    );
    const flags = await call("list_directory_symbols", {
      search: "United Arab Emirates",
      category: "countries",
    });
    assert.equal(flags.items[0].value, "AE");
    const icons = await call("list_directory_symbols", { category: "folders" });
    assert.ok(icons.items.some((icon) => icon.value === "icon:folder"));
    const context = await call("get_capabilities");
    assert.ok(context.toolNames.includes("prepare_native_email"));
  } finally {
    await closeToolConnections(store);
    store.close();
    await rm(dataDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});

test("agent proxies refuse a different database and errors include actionable machine fields", async () => {
  const dataDir = await temp(),
    store = openStore({ dataDir, seed: false }),
    requests = [];
  const oldPort = process.env.APPLY_TRACKER_PORT;
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify(
        request.url === "/api/health"
          ? { ok: true, app: "apply-tracker" }
          : {
              mcpServers: {
                "apply-tracker": {
                  env: { APPLY_TRACKER_DATA: join(dataDir, "other") },
                },
              },
            },
      ),
    );
  });
  await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
  process.env.APPLY_TRACKER_PORT = String(server.address().port);
  try {
    const tool = buildTools(store, { assistant: 'codex' }).find(
      (tool) => tool.name === "start_native_run",
    );
    await assert.rejects(tool.handler({ directoryId: "fixture", explicit: true, mode: "send_and_submit" }), (error) => {
      const result = machineError(error);
      assert.equal(result.code, "WRONG_DATA_DIRECTORY");
      assert.equal(result.retryable, false);
      assert.match(result.nextStep, /APPLY_TRACKER_DATA/);
      return true;
    });
    assert.ok(!requests.includes("/api/native/runs"));
    const company = store.createDirectory({ name: "Revision fixture" });
    const id = store.addCompanies(company.id, [{ name: "Fixture" }]).ids[0];
    store.updateCompany(id, { notes: "first" });
    const update = buildTools(store, { assistant: 'codex' }).find(
      (tool) => tool.name === "update_company",
    );
    await assert.rejects(
      update.handler({ id, patch: { notes: "stale", expectedRevision: 1 } }),
      (error) => machineError(error).code === "CONFLICT",
    );
    await assert.rejects(
      update.handler({ id, patch: { unexpected: "field" } }),
      /Unknown field/,
    );
  } finally {
    if (oldPort === undefined) delete process.env.APPLY_TRACKER_PORT;
    else process.env.APPLY_TRACKER_PORT = oldPort;
    await new Promise((accept) => server.close(accept));
    await closeToolConnections(store);
    store.close();
    await rm(dataDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});
