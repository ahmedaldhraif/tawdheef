# Public release preparation

The public repository is [ahmedaldhraif/tawdheef-auto-apply-jobs](https://github.com/ahmedaldhraif/tawdheef-auto-apply-jobs), recorded in `website/config.json`. The prepared version is **0.2.0**. An existing repository, passing CI or a local package does not mean that version has been published.

Tawdheef remains local first and Codex/Claude native. The actual client owns external connections, sign-in and model access. Release preparation must not connect accounts, inspect a real CV/mailbox, enable schedules or use private tracking as test data.

## Prepare a candidate

Use Node.js 26.13.1 LTS and the committed lockfile. Patched Node 24 remains a source compatibility test target. Work in a clean, reviewed checkout with isolated data:

```sh
npm ci
npm test
npm run release:check
npm run release:prepare
npm run release:smoke
npx playwright install chromium
npm run test:ui
```

`release:prepare` checks public paths, possible credential signatures and the generated tool catalog, rebuilds the website/downloads and tracker interface, then writes `release/vVERSION/`. It refuses to overwrite an existing candidate. To preserve an earlier build, use:

```sh
node scripts/prepare-release.mjs --output outputs/NEW-CANDIDATE/assets
node scripts/release-smoke.mjs --release-dir outputs/NEW-CANDIDATE/assets
```

The source smoke check extracts the exact ZIP into an isolated folder. It exercises first launch, project setup for both clients, local assets and a real stdio MCP handshake, then stops its test process. It never signs in or sends anything. Its isolated files remain under `.local/release-smoke/` for inspection. Packaging alone does not establish that tests passed.

The prepared source assets are:

- `tawdheef-VERSION-source.zip`: public source, launchers, guides, skills, tests and original research evidence.
- `tawdheef-skill.zip`: optional standalone workflow guidance and license.
- Seven directory ZIPs: six GCC country packs and the original UAE snapshot, with source evidence, compact indexes, manifests and import CSV parts.
- `tawdheef-brand-kit.zip`: project artwork and retained third-party/font notices.
- `SHA256SUMS.txt`, `manifest.json` and `RELEASE-NOTES.md`: hashes, inventory and release notes.
- `smoke-verification.json`: written only after the fresh-source-download check passes.

Private tracking, credentials, publisher keys/certificates, client configuration, logs, `node_modules` and development outputs must stay out of source and release archives. Review new files and artwork too; automated scans do not establish that every included file is appropriate to publish.

## Prepare desktop downloads

Build each of Windows x64/ARM64, Mac Intel/Apple Silicon and Linux x64/ARM64 on its target OS and architecture:

```sh
npm run release:app -- --output NEW_FOLDER
npm run release:app:smoke -- --directory NEW_FOLDER
```

Each ZIP contains the prebuilt tracker and a checksum-verified Node runtime. It does not install developer tools, optional app adapters or a browser at launch. The public website, source-download ZIPs and marketing assets are separate from the tracker interface.

Retain each target's exact ZIP, `package-report.json`, `SHA256SUMS.txt` and successful `smoke-verification.json`. Check the archive hash, version, runtime, architecture, tool catalog and source workflow run. Do not mix artifacts from different commits just because they share version `0.2.0`.

Both source and desktop packaging require a clean, committed Git checkout and record its full `sourceCommit`. This is a publisher/build requirement; ordinary users need no Git installation to run a downloaded app. Source preparation generates derived pack/website files, so use separate clean worktrees or CI jobs for source and desktop builds, or build the desktop first.

Choose the candidate's distribution status explicitly. Unsigned previews must remain labelled unsigned. A signed desktop candidate needs the publisher credentials, successful platform signing/notarization and matching exact-archive verification described in [desktop packaging and signing](DESKTOP-RELEASE.md). A source ZIP or successful unsigned build is not a signed app.

After the exact prepared source ZIP has passed `release:smoke`, assemble an unsigned candidate from the six `desktop-TARGET` artifact directories:

```sh
node scripts/collect-desktop-release.mjs --artifacts DOWNLOADED_ARTIFACTS --output PREPARED_RELEASE --source-commit FULL_40_CHARACTER_SHA --signing unsigned-preview
```

For a signed desktop candidate, run **Sign verified desktop download** with the same reviewed `tag`, full `source-commit` and `platform: all`. It produces four `signed-desktop-TARGET` artifacts for Windows and Mac. Create a fresh prepared source candidate, smoke-test it, then collect those artifacts with the two Linux artifacts from that same source commit:

```sh
node scripts/collect-desktop-release.mjs --artifacts DOWNLOADED_UNSIGNED_ARTIFACTS --signed-artifacts DOWNLOADED_SIGNED_ARTIFACTS --output FRESH_PREPARED_RELEASE --source-commit FULL_40_CHARACTER_SHA --signing required
```

Required signing rejects missing or unverified Windows/Mac signatures and missing Mac notarization. Linux packages retain exact-archive checksum verification; this does not label them platform-signed. The collector requires matching source and desktop receipts before copying any assets and refuses existing destination files. Do not replace ZIPs by hand inside an already assembled candidate.

## Create a draft, then publish separately

1. Merge the reviewed source and confirm the exact commit and version. Run the Node 24/26, browser and six-target desktop checks on that source. Workflow configuration alone is not test evidence.
2. Confirm `v0.2.0` is unused before creating it. Tag only the reviewed commit with the exact `package.json` version and push the tag. Never move an existing release tag to fit a new build.
3. Run **Prepare draft release** with that existing tag. The workflow pins its commit, verifies the version and remote tag, runs checks, prepares source assets and collects verified desktop receipts before creating a **draft prerelease**. It refuses to overwrite an existing release and does not publish automatically.
4. Review the draft's exact downloads, notes, checksums, target receipts and signing status. When signed downloads are intended, verify the final draft actually contains those signed artifacts; a separate signing job's success does not change an already prepared unsigned ZIP.
5. Publish only after the release owner approves that concrete draft. Keep unsigned/signed status and live-provider testing limits visible. Users connect services in their actual Codex/Claude client; there is no app-owned OAuth setup.
6. Change `website/config.json` download/version links only after the matching public release assets exist, then rebuild and deploy the website separately. The current `v0.1.2` preview links must not be silently relabelled as new verified desktop downloads.

Ordinary users need no Apple Developer account or Windows signing identity. Those identify the publisher. See the signing handoff in [DESKTOP-RELEASE.md](DESKTOP-RELEASE.md) for secure configuration; never put certificates, private keys, passwords or tokens in chat, issues or source files.

The published repository can be used with `npx skills@latest add ahmedaldhraif/tawdheef-auto-apply-jobs --skill tawdheef`. For local guidance, use `npx skills@latest add . --skill tawdheef`; `npm run agent -- CLIENT` already installs the owned project skill when explicitly requested.

For manual draft management, use [GitHub's release guide](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository). Pass multiline notes through a file, such as `gh release create --notes-file RELEASE-NOTES.md`, and keep draft preparation separate from publication.
