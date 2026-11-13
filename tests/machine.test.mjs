import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openStore } from "../server/store.mjs";
import {
  buildTools,
  closeToolConnections,
  machineError,
} from "../server/mcp.mjs";
import { backgroundCommand } from "../scripts/background.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const run = promisify(execFile);
const temp = () => mkdtemp(join(tmpdir(), "apply-tracker-machine-"));
const unpack = (result) =>
  result.structuredContent || JSON.parse(result.content[0].text);

test('managed operator capability discovery matches its actual scoped MCP catalog', async () => {
  const dataDir = await temp(); const store = openStore({ dataDir, seed: false });
  store.createDirectory({ id: 'operator', name: 'Operator' });
  const companyId = store.addCompanies('operator', [{ name: 'Fixture' }]).ids[0];
  const active = store.startManagedRun({ directoryId: 'operator', assistant: 'codex', mode: 'send_and_submit', explicit: true });
  store.beginRunTarget(active.id, companyId);
  const client = new Client({ name: 'scoped-fixture', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, 'server', 'mcp.mjs')], env: { ...process.env, APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: '65532', APPLY_TRACKER_OPERATOR_RUN: active.id, APPLY_TRACKER_OPERATOR_COMPANY: companyId }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const names = (await client.listTools()).tools.map(t => t.name);
    const capabilities = unpack(await client.callTool({ name: 'get_capabilities', arguments: {} })).data;
    assert.deepEqual(capabilities.toolNames, names); assert.ok(!names.includes('start_run')); assert.ok(!names.includes('update_settings'));
    assert.ok(!names.includes('get_setup_status')); assert.equal(capabilities.setupTool, undefined);
    assert.ok(names.includes('prepare_form_submission')); assert.ok(capabilities.nativeAdapters.email.includes('icloud-mail'));
    const context = unpack(await client.callTool({ name: 'get_agent_context', arguments: {} })).data;
    assert.equal(context.operatorScope.companyId, companyId); assert.ok(!context.workflow.join(' ').includes('start_run'));
    assert.equal(context.setup, undefined);
    store.updateRun(active.id, { status: 'cancelled' });
    assert.equal((await client.callTool({ name: 'get_company', arguments: { id: companyId } })).isError, true);
  } finally { await client.close(); store.close(); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); }
});

test("real stdio MCP shares persistent records and distinguishes preparation from confirmed submission", async () => {
  const dataDir = await temp();
  const env = Object.fromEntries(
    Object.entries({ ...process.env, APPLY_TRACKER_DATA: dataDir }).filter(
      ([, value]) => value !== undefined,
    ),
  );
  const client = new Client({ name: "local-contract-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "server", "mcp.mjs")],
    env,
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const catalog = await client.listTools();
    assert.match(client.getInstructions(), /^Start with get_agent_context/);
    assert.equal(
      catalog.tools.find((tool) => tool.name === "get_company").annotations
        .readOnlyHint,
      true,
    );
    assert.equal(
      catalog.tools.find((tool) => tool.name === "send_application_email")
        .annotations.readOnlyHint,
      false,
    );
    assert.equal(
      unpack(await client.callTool({ name: "get_capabilities", arguments: {} }))
        .data.localOnly,
      true,
    );
    assert.ok(catalog.tools.some((tool) => tool.name === "start_run"));
    assert.ok(catalog.tools.some((tool) => tool.name === "list_runs"));
    assert.ok(
      catalog.tools.some((tool) => tool.name === "get_connection_tools"),
    );
    assert.ok(
      !catalog.tools.some((tool) => tool.name === "call_connection_tool"),
    );
    const call = async (name, args) =>
      unpack(await client.callTool({ name, arguments: args }));
    const directory = (
      await call("create_directory", { name: "Fixture employers", flag: "🧪" })
    ).data;
    const imported = (
      await call("add_companies", {
        directoryId: directory.id,
        records: [
          {
            name: "Fixture Company",
            careersUrl: "https://example.org/careers",
            sourceFields: { evidence: "fixture only" },
          },
        ],
      })
    ).data;
    const companyId = imported.ids[0];
    const prepared = await call("log_application", {
      companyId,
      role: "Engineer",
      status: "prepared",
      method: "email",
    });
    assert.equal(prepared.data.status, "prepared");
    assert.equal(
      (await call("get_company", { id: companyId })).data.status,
      "not_started",
    );
    const unauthorized = await call("start_run", {
      directoryId: directory.id,
      companyIds: [companyId],
      explicit: false,
      mode: "send_and_submit",
    });
    assert.equal(unauthorized.ok, false);
    const active = (
      await call("start_run", {
        directoryId: directory.id,
        companyIds: [companyId],
        explicit: true,
        mode: "send_and_submit",
      })
    ).data;
    const noReceipt = await call("log_application", {
      companyId,
      runId: active.id,
      role: "Engineer",
      status: "applied",
      method: "email",
    });
    assert.equal(noReceipt.ok, false);
    const applied = await call("log_application", {
      companyId,
      runId: active.id,
      role: "Engineer",
      status: "applied",
      method: "email",
      evidence: "fixture-message-1",
    });
    assert.equal(applied.data.status, "applied");
    const reader = openStore({ dataDir });
    try {
      assert.equal(reader.getCompany(companyId).status, "applied");
      assert.equal(reader.listApplications(companyId).length, 2);
      assert.equal(
        reader.getCompany(companyId).sourceFields.evidence,
        "fixture only",
      );
    } finally {
      reader.close();
    }
  } finally {
    await client.close();
    await rm(dataDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
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
    assert.equal(status.startupSupported, process.platform === "win32");
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
  const tools = buildTools(store),
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
    assert.ok(context.toolNames.includes("send_application_email"));
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

test("agent provider operations use one app connection owner and explicit report delivery", async () => {
  const dataDir = await temp(),
    store = openStore({ dataDir, seed: false }),
    requests = [];
  const oldPort = process.env.APPLY_TRACKER_PORT;
  const server = createServer(async (request, response) => {
    let raw = "";
    for await (const part of request) raw += part;
    requests.push({
      method: request.method,
      url: request.url,
      body: raw ? JSON.parse(raw) : null,
    });
    response.setHeader("Content-Type", "application/json");
    const report = {
      generatedAt: new Date().toISOString(),
      applied: 0,
      replies: 0,
      interviews: 0,
      followUps: [],
      needsYou: [],
      errors: 0,
      delivery: { status: "sent", messageId: "fixture-report" },
    };
    const result =
      request.url === "/api/health"
        ? { ok: true, app: "apply-tracker" }
        : request.url === "/api/agent-config"
          ? {
              mcpServers: {
                "apply-tracker": { env: { APPLY_TRACKER_DATA: dataDir } },
              },
            }
          : request.url === "/api/connections"
            ? [{ kind: "email", configured: true, status: "connected" }]
            : request.url === "/api/connections/email/connect"
              ? { kind: "email", status: "connected" }
              : request.url === "/api/connections/email/tools"
                ? [
                    {
                      name: "fixture.read",
                      description: "Read recorded threads",
                      inputSchema: { type: "object" },
                    },
                    {
                      name: "fixture.send",
                      description: "Send a message",
                      inputSchema: { type: "object" },
                    },
                  ]
                : request.url === "/api/refresh"
                  ? { checked: 1, updated: 0, status: "checked" }
                  : request.url === "/api/reports"
                    ? report
                    : request.url === "/api/runs/fixture-run/send-email"
                      ? {
                          status: "needs_user",
                          application: { deliveryStatus: "unknown" },
                        }
                      : { ok: true };
    response.end(JSON.stringify(result));
  });
  await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
  process.env.APPLY_TRACKER_PORT = String(server.address().port);
  const tools = buildTools(store),
    call = (name, args = {}) =>
      tools.find((tool) => tool.name === name).handler(args);
  try {
    assert.equal((await call("get_agent_context")).app, "running");
    assert.equal(
      (await call("connect_connection", { kind: "email" })).status,
      "connected",
    );
    const catalog = await call("get_connection_tools", {
      kind: "email",
      search: "read",
      limit: 1,
    });
    assert.equal(catalog.items[0].name, "fixture.read");
    assert.equal(catalog.total, 1);
    assert.equal((await call("refresh_replies")).checked, 1);
    store.updateSettings({
      emailReports: true,
      reportEmail: "fixture@example.test",
    });
    const local = await call("generate_report");
    assert.equal(local.delivery.status, "local");
    assert.equal(requests.filter((r) => r.url === "/api/reports").length, 0);
    assert.equal(
      (await call("generate_report", { sendEmail: true })).delivery.status,
      "sent",
    );
    await assert.rejects(
      call("generate_report", { sendEmail: true, since: "2026-01-01" }),
      /saved reporting window/,
    );
    assert.equal(requests.filter((r) => r.url === "/api/reports").length, 1);
    const sent = await call("send_application_email", {
      runId: "fixture-run",
      companyId: "fixture-company",
      role: "Engineer",
      to: "jobs@example.test",
      subject: "Fixture",
      body: "Fixture only",
    });
    assert.equal(sent.status, "needs_user");
    assert.equal(sent.application.deliveryStatus, "unknown");
    assert.ok(
      requests.some(
        (r) =>
          r.url === "/api/runs/fixture-run/send-email" &&
          r.body.runId === "fixture-run",
      ),
    );
    await assert.rejects(
      readFile(join(dataDir, "connections.private.json"), "utf8"),
      (error) => error.code === "ENOENT",
    );
    const cache = {
      fetchedAt: new Date().toISOString(),
      result: { content: [{ type: "text", text: "x".repeat(1500) }] },
    };
    await writeFile(join(dataDir, "cv-cache.json"), JSON.stringify(cache));
    const cv = await call("get_cv", { maxChars: 500 });
    assert.equal(cv.text.length, 500);
    assert.equal(cv.nextOffset, 500);
    assert.equal(requests.filter((r) => r.url === "/api/cv/read").length, 0);
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
    const tool = buildTools(store).find(
      (tool) => tool.name === "refresh_replies",
    );
    await assert.rejects(tool.handler({}), (error) => {
      const result = machineError(error);
      assert.equal(result.code, "WRONG_DATA_DIRECTORY");
      assert.equal(result.retryable, false);
      assert.match(result.nextStep, /APPLY_TRACKER_DATA/);
      return true;
    });
    assert.ok(!requests.includes("/api/refresh"));
    const company = store.createDirectory({ name: "Revision fixture" });
    const id = store.addCompanies(company.id, [{ name: "Fixture" }]).ids[0];
    store.updateCompany(id, { notes: "first" });
    const update = buildTools(store).find(
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
