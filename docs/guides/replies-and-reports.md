# Check replies and reports

Keep the next action visible after an application run. Reply checks look at tracked application threads; reports summarise the evidence already recorded.

## Check progress now

1. Connect the mailbox used for your tracked email applications if it is not connected yet.
2. Ask your agent to check the relevant replies, or use the app’s reply-check action.
3. Open the affected company records to read what changed and the next action. A connection error needs attention; it is not a rejection.
4. Ask your agent to save a local report. For this, it calls `generate_report` without `sendEmail`.

You can give your agent this request:

> Review my tracked applications and check replies for the relevant threads. Summarise real changes and what needs me next. Save the report locally. Do not start new applications or send follow-ups.

You can also generate a local report from the Tawdheef folder:

```sh
node bin/apply-tracker.mjs report generate
```

The app’s report button uses your saved email settings. Read its label before choosing it: **Generate & email report** sends the report to the configured recipient. Choose that option only when you want delivery.

## Add a schedule when you want one

1. Open the app’s **schedules control**.
2. Choose how often to check tracked replies and create reports. Enable email delivery only if you want reports sent to the configured recipient.
3. Keep the computer awake and the local app running for scheduled provider work.

Fresh installs leave automatic checks and reports off. A schedule checks existing work; it does not start applications, create career profiles, share CVs or send follow-up messages.

## Expected result

Company records show supported reply changes and next actions. A local report is saved when requested; email delivery has its own outcome. Unknown CV views or unconfirmed provider results remain unknown.
