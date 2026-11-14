# Check replies and reports

Keep the next action visible after an application run. Reply checks look at tracked application threads; reports summarise the evidence already recorded.

## Check progress now

1. Reuse the original mailbox connection in your actual Codex or Claude Code client. Copy its setup request from Connections if needed.
2. Ask that agent to inspect only the relevant tracked threads with its own mail tools. Original provider/account identity stays with each submission; an unknown historical identity must be inspected, never reassigned to the current account.
3. Open the affected company records to read what changed and the next action. A connection error needs attention; it is not a rejection.
4. Ask your agent to save a local report. For this, it calls `generate_report` without `sendEmail`.

You can give your agent this request:

> Review my tracked applications and check replies for the relevant threads. Summarise real changes and what needs me next. Save the report locally. Do not start new applications or send follow-ups.

You can also generate a local report from the Tawdheef folder:

```sh
node bin/apply-tracker.mjs report generate
```

The native app's **Generate report** saves locally. Email delivery needs a separate explicit request to your actual client and its normal mail approvals. Generating or inspecting a report does not authorize sending it. Optional local-adapter mode retains its separately configured **Generate & email report** action.

## Add a schedule when you want one

1. Open **Settings → Monitoring** and select the wanted channels and saved list scope.
2. Save the assistant, frequency, time zone and selected calendars when relevant. Paste **Copy schedule request** into the actual client's supported local scheduling interface.
3. Inspect that real task before reporting it as created. A copied request is not an active schedule. Keep the computer, selected client and local tracker available. See [Monitoring](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/MONITORING.md).

Fresh installs leave monitoring off. The client owns its clock and external reads; Tawdheef returns bounded read requests and records evidence. A schedule never starts applications, creates/edits profiles, shares/uploads CVs, sends messages or changes calendars.

## Expected result

Company records show supported reply changes and next actions. A local report is saved when requested; email delivery has its own outcome. Unknown CV views or unconfirmed provider results remain unknown.
