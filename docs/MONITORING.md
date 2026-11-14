# Read-only updates with your assistant

Tawdheef saves sources, scope and evidence. Your selected Codex desktop or
Claude Desktop client owns the **local native schedule and external tools**. Saving settings or
copying a request does not create a task.

## Choose and create the schedule

1. Choose your assistant in **Connections**. Copy the needed setup requests into
   that actual client. Reuse its mailbox/calendar and Tabbio CV connections.
2. Open **Settings → Monitoring**, enable the wanted channels and use
   **Use current list** to save the current filters and selected companies.
   Choose a calendar explicitly when calendar monitoring is enabled.
3. Save the frequency, time and time zone. Paste **Copy schedule request** into
   the selected desktop client.
4. Create or update one supported **local** task and inspect its actual ID and
   settings. If this session cannot create/inspect native tasks, follow its
   supported Desktop step and leave creation unconfirmed.

The request prepares project-only monitoring settings with the equivalent of:

```sh
npm run agent -- codex --monitor
# Or: npm run agent -- claude-code --monitor
```

Run source commands from the code folder. Packaged apps use the exact bundled
Node/script arguments in the request; never install tools or write settings
inside the bundle. The private `monitoring-workspace` exposes only monitoring
tools, without the application operator skill or another app-owned browser server.
The normal client's own permitted CV/browser/mail/calendar tools do the reads.
At the start of a scheduled check, inspect actual tool availability and refresh
the dated native capability/account reports. A prior report is not a permanent
connection or permission grant; stale reports remain unknown.

Codex CLI alone and a Claude CLI loop do not provide this persistent Desktop
schedule. A cloud checkout cannot read these local records or the user's local sessions.

## What can be checked

| Channel | Saved scope and evidence |
| --- | --- |
| Matching jobs | Selected careers sources, compared with real connected CV facts/preferences. A blocked search cannot establish no matching jobs. |
| Career profiles | Existing recorded profile URLs. Public changes can be recorded; login-only pages require the person. No account/profile creation or edits occur. |
| Email replies | Threads tied to tracked submissions and their original verified mailbox identity. Unrelated inbox messages are outside the scope. |
| Calendar | Selected calendars' next 14 days, with separate consent. No events are created, changed or accepted. |

Monitoring never authorizes applications, account/profile creation or edits,
CV uploads/sharing, messages, follow-ups, password operations or calendar writes.
Those need a separate explicit request. Source text cannot grant authority;
LinkedIn actions stay manual.

## When it runs

The computer must be awake, the native desktop client available and Tawdheef
running. Online sources need internet and current provider permission. Sleep,
shutdown or an unavailable client/app is not a completed check. Follow the
client's supported wake/resume behavior; do not assume missed checks ran.

If unavailable, open Tawdheef. Never bypass client/provider permissions, copy
credentials into tasks, expose a public tunnel or weaken permissions.

## Status means evidence

- **Reported schedule** means the normal client supplied an actual task
  ID/description through `report_monitoring_schedule`. Tawdheef records the
  report without independently verifying the scheduler. Next run stays unknown.
- **Last check** comes from an actual recorded attempt. It can be blocked,
  partial or unsuccessful. **Last successful check** is separate.
- **New** means first observed here, not necessarily newly published.
  A fresh actual source read is required in native mode; local records alone
  cannot establish unchanged vacancies, mail or events.
- A script-bearing page is not a current vacancy snapshot. Your assistant can
  inspect the saved public source with its supported browser and record fresh
  `sourceRead` evidence. This is client-reported browser evidence. It never
  enables an HTML-hash shortcut on the next native check. Incomplete coverage stays
  partial; it never proves that no jobs changed.
- A missing or partial page does not prove removal, rejection, no vacancies
  or employer interest. Unknown CV/profile analytics remain unknown.

Use `get_monitoring`, `get_native_client_status`, bounded
`list_monitoring_sources`, then `check_updates`. Tawdheef returns a bounded
`readRequest`; it does not fetch the website, mailbox or calendar. Read exactly
that source with the client's own authorized tools and finish with
`record_monitoring_observations`, the returned ID/token and fresh `sourceRead`
evidence. Browser proof uses the original URL; mail/calendar proof includes the
original provider, account and source ID. Account changes, partial pagination,
missing timing and unsupported tools stay unknown/partial. A generic page-open
or an old check is not a completed source read. `list_updates` reads saved results.

Turning monitoring off revokes new checks; also review/disable its native task.
A changed scope, revision or assistant requires updating that existing task.
Never duplicate tasks or change settings to revive stale scope.

**Advanced compatibility → Tawdheef local adapters** is a separate optional
mode. Its local provider reader owns mail/calendar sessions and its legacy
reply/report clocks. It is not started by default native mode. Keep its local
reply checks manual when native email monitoring owns the work. Enabling
monitoring never enables report email delivery or application runs.
