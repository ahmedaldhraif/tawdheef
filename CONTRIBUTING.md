# Contributing

## Start with one useful change

You do not need to code. A corrected careers link or one missing organisation is a useful first contribution. Contributions from **any country** are welcome.

- [Fix a record](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=directory-data.yml): report a wrong link, duplicate or inaccurate detail.
- [Add a company](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=add-company.yml): share a missing organisation and its public source.
- [Enrich an entry](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=directory-data.yml&title=%5BDirectory%5D%20Add%20details%3A%20): add a published careers route, sector, location or other missing detail.
- [Propose a country or industry pack](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=new-country-pack.yml): start with a few researched entries.
- [Report an app bug](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=bug.yml) using steps with private details removed.
- [Suggest a feature](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=feature.yml): describe the task you want to make easier.

For directory changes, include the country/pack, organisation, record ID if known, public evidence URL and date checked. Leave unknown details blank. An issue or corrected CSV is enough; a pull request is optional. See [the directory guide](docs/DIRECTORY-CONTRIBUTING.md) for editing files.

A maintainer reviews the evidence and may ask a question or request changes. Accepted data goes into a reviewed pack source and becomes downloadable when a new pack version is published. Existing local trackers do not update in the background: preview and import that published pack to receive the changes while preserving tracking. There is no promised review or release date.

Keep private CVs, tracking, account details and credentials out of public issues. For a sensitive concern, follow [SECURITY.md](SECURITY.md) instead of posting the material.

Published directory changes and actual contribution credit belong in the
[pack update notes](directories/PACK-UPDATES.md). Merging a change does not replace a released ZIP.

## Code changes

Read `AGENTS.md` for operation boundaries and `docs/REPOSITORY.md` for the code map. Read `DESIGN.md` before interface changes. Use the relevant installed development skills on demand.

Use Node.js 26 LTS (26.13.1 is the release target) and Vite 8.3.8 from the lockfile. Patched Node 24 remains a source compatibility target. Run `npm ci`, then `npm run dev`. Developer dependencies include the bundler's native platform bindings and optional provider SDK fixtures; heavy provider SDKs are excluded from production-core installs. Native mode uses the actual Codex or Claude Code client's external connections. The legacy adapter workspace requires explicit `npm run setup -- --local-adapters`; it never writes dependencies into a packaged app. Work with isolated test data; never use someone else's mailbox or tracking database as a fixture. Do not change the original UAE seed to test an edit.

Before proposing a change:

```sh
npm test
npm run build
npm run release:check
```

For interface or launch changes, install the test browser with `npx playwright install chromium`, then run `npm run test:ui`. Tool changes also require `npm run tools:catalog`. New provider behavior needs fixtures for failure, unknown outcomes, account identity and duplicate protection, not an automatic live send.

Role or onboarding changes also need isolated SDK tests for the actual restricted catalog, generated Codex/Claude settings and revoked scope. Monitoring uses the selected native desktop client's local clock; its reported task metadata is not independent scheduler verification. Keep model proof explicitly requested and disposable, and persist only allowlisted numeric/status evidence. Original CV fixtures must remain synthetic and preserve exact bytes; never use a real CV or password vault for tests. See [Monitoring](docs/MONITORING.md) and the generated [tool schemas](docs/tools.json) for the current contract.

Keep changes focused and explain the user-visible result and checks performed. Keep dependencies small. Preserve the shared UI/CLI/MCP validation; do not add a direct-database bypass.

`npm run build` builds only the tracker interface. Build the separate website with `node website/build.mjs` before website/browser checks. Use `npm run benchmark` for disposable synthetic query measurements. Build user packages with `npm run release:app -- --output NEW_FOLDER`, then verify the exact download with `npm run release:app:smoke -- --directory NEW_FOLDER`. Each package must be built and checked on its target OS and architecture.

Never include `.local`, environment files, credentials, cookies, applicant data, real CVs, mailbox contents or client configuration in a pull request. Review screenshots before sharing them. Directory contributions must preserve stable IDs, sources, roles and missing evidence; do not invent contacts or eligibility.

The original code is MIT licensed. Retain third-party licenses and mark artwork provenance. Generated ZIPs, builds and local verification outputs stay out of Git; release tooling builds them from reviewed source.
