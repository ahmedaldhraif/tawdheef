# Contributing

## Add or fix a directory

Companies from any country are welcome. Add a public careers link, correct an entry, or contribute a country or industry pack.

- For one change, open a **Directory data** issue with the organisation, country and source link. No coding needed.
- For a new pack, open a **New directory pack** issue or submit a pull request using the pack template. Corrected CSV rows and source notes are also welcome for review.

See [the short directory guide](docs/DIRECTORY-CONTRIBUTING.md). Keep original source IDs and evidence; leave unknown details blank.

## Code changes

Read `AGENTS.md` for operation boundaries and `docs/REPOSITORY.md` for the code map. Read `DESIGN.md` before interface changes. Use the relevant installed development skills on demand.

Use Node.js 24 or newer. Run `npm ci`, then `npm run dev`. Work with isolated test data; never use someone else's mailbox or tracking database as a fixture. Do not change the original UAE seed to test an edit.

Before proposing a change:

```sh
npm test
npm run build
npm run release:check
```

For interface or launch changes, install the test browser with `npx playwright install chromium`, then run `npm run test:ui`. Tool changes also require `npm run tools:catalog`. New provider behavior needs fixtures for failure, unknown outcomes, account identity and duplicate protection, not an automatic live send.

Keep changes focused and explain the user-visible result and checks performed. Keep dependencies small. Preserve the shared UI/CLI/MCP validation; do not add a direct-database bypass.

Never include `.local`, environment files, credentials, cookies, applicant data, real CVs, mailbox contents or client configuration in a pull request. Review screenshots before sharing them. Directory contributions must preserve stable IDs, sources, roles and missing evidence; do not invent contacts or eligibility.

The original code is MIT licensed. Retain third-party licenses and mark artwork provenance. Generated ZIPs, builds and local verification outputs stay out of Git; release tooling builds them from reviewed source.
