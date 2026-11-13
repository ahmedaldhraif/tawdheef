# Practical interface and agent review

The complete 19-skill [Emil Kowalski collection](https://github.com/emilkowalski/skills) is installed as project development resources for Codex and Claude Code. Source paths and content hashes are in `skills-lock.json`; the upstream MIT license is in `.agents/skills/UPSTREAM-LICENSE`. These files do not add runtime dependencies or browser code. Agents load the applicable guidance only when changing the corresponding part of the product.

The web design, mobile, animation review/removal/performance, worst-case data and library-selection guidance informed this pass. The interface keeps its current one-screen layout and original provider marks. Swift and Expo guidance is available for work in those frameworks. Prototype comparisons, gestures, choreographed entrances and new animation libraries were unnecessary for this table-based application. Existing user decisions remain in `DESIGN.md`; this pass does not invent new user taste rules.

| Before | After | Why |
| --- | --- | --- |
| Email, CV and AI controls competed in the header | One Connections entry with grouped provider rows and original local logos | Match familiar account settings and preserve table space |
| Technical connection settings led setup | Provider sign-in first; OAuth registration/import and alternate CLI/MCP choices in details | Keep the common path clear |
| Return from provider settings could lose the user's place | Restore the provider row on Back and the stable Connections trigger on close | Preserve keyboard context |
| Mobile fields used small text and some controls depended on hover | 16px mobile fields, 44px touch actions, visible touch row controls and precise-pointer hover rules | Avoid input zoom and hidden actions |
| Nested scrolling and fixed viewport heights | Contained scrolling, dynamic viewport heights and safe-area spacing | Keep dialogs usable around mobile browser chrome and keyboards |
| Undo expired while reading or using the notification | Pause dismissal while hovered, focused or the document is hidden | Preserve the chance to recover an edit |
| Every 100-row screen refresh included the original source-field bulk | Summary response omits only `sourceFields`; details and default API retain the full original record | The seed payload fell from 294,578 to 72,568 JSON bytes (75.4%); identities, revisions, notes and contacts remain |
| Motion could be added merely for polish | Table, tabs and keyboard actions stay instant; loading indicators respect reduced motion | Repeated work should respond immediately |
| A setup reminder and separate checklist repeated Connections | Provider rows, assistant choice and Check connections in the existing Connections panel; agent instructions in one collapsed disclosure | Keep account setup in one familiar place |
| Installed clients and saved connections could look ready | Explicit assistant sign-in and CV-read checks with actionable failures | Report what was actually verified |
| Optional connections could feel like requirements | Email and calendar keep their familiar provider rows and remain optional; schedules stay beside Last update | Only configure the workflow the person wants |
| Run could only use the whole remaining list or a manual selection | Multiple company types and directory-derived city/location filters with one matching count | Narrow the work without selecting hundreds of rows |
| Accounts and CV uploads were hidden behind application history | Optional Progress column, preserved milestone history and separate report totals | Show useful work even when no vacancy was applied for |
| Expanded filters could push Run below the visible area | Run and Cancel stay in the dialog footer while filters scroll | Keep the final action available on small screens |

The standard agent catalog has 43 tools (run `npm run tools:catalog` for the current schemas), including the connection readiness check shared with the screen. Compact company pages retain source type, location and recorded progress; full source evidence is read on demand. Provider libraries are imported on provider use, not during ordinary record-tool startup. Run filters and progress display add no runtime dependencies.

Validation uses real local HTTP/stdio servers, isolated databases, mocked provider transports, browser checks and a fresh copy installed from the lockfile. It does not establish live OAuth permissions, successful email delivery or calendar writes, physical iOS behavior, or universal AI-client compatibility. Each user signs in to their own services locally.
