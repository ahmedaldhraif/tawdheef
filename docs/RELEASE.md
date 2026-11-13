# Public release preparation

The intended repository is `ahmedaldhraif/tawdheef`, recorded in `website/config.json`. That is a proposed destination, not evidence of publication. This checkout's release commands never create a remote repository, push code or publish a release.

## Prepare a candidate

Use Node.js 24 and the committed lockfile. Review the source and changes before running:

```sh
npm ci
npm test
npm run release:check
npm run release:prepare
npm run release:smoke
npx playwright install chromium
npm run test:ui
```

`release:prepare` verifies public paths and credential signatures, checks the generated tool catalog, rebuilds the website/downloads and UI, then writes `release/vVERSION/`. It refuses to overwrite an existing candidate. Use `node scripts/prepare-release.mjs --output outputs/NEW-CANDIDATE/assets` for a separate reviewed candidate without replacing an earlier folder. Verify that candidate with `node scripts/release-smoke.mjs --release-dir outputs/NEW-CANDIDATE/assets`. It does not claim tests passed merely because packaging completed. `release:smoke` extracts that exact ZIP into an isolated local folder, exercises first launch, project setup for both clients, local downloads and a real stdio MCP handshake, then stops its test process. It never signs in or sends anything; its isolated files remain under `.local/release-smoke/` for inspection.

Artifacts:

- `tawdheef-VERSION-source.zip`: complete public source with launchers, guides, skills, tests and original source evidence.
- `tawdheef-skill.zip`: optional standalone workflow guidance and its license.
- Seven directory ZIPs: six current GCC country packs plus the original UAE snapshot, each with full public research, a compact JSON index, manifest and import CSV parts.
- `tawdheef-brand-kit.zip`: original project artwork and retained third-party/font notices.
- `SHA256SUMS.txt`, `manifest.json`, `RELEASE-NOTES.md`: integrity hashes, exact file inventory and user-facing release notes.
- `smoke-verification.json`: produced only after the fresh-download check passes.

Private tracking, OAuth files, local MCP settings, logs, node_modules, development outputs and generated ZIPs are excluded. The website and Git release use the same source boundary. Review assets and new directory data too; automated pattern matching cannot establish that every file is appropriate to publish.

## Publish after owner approval

1. Confirm the account/repository and public visibility. Review `git status` and the source inventory; never use an unreviewed blanket upload of the working folder.
2. Create the repository, commit only reviewed source and push the intended branch. Enable private vulnerability reporting in repository settings if available.
3. Run CI. The configured matrix covers Node 24 on Windows, macOS and Linux; the browser suite runs on Linux. Workflow configuration is not evidence those hosted jobs have already run.
4. Tag the reviewed commit with the exact package version, such as `v0.1.0`, and push that tag.
5. Run **Prepare draft release** in GitHub Actions with that existing tag. It verifies the version, runs tests, packages and checks a fresh download, then creates a **draft prerelease** with the assets attached. Existing releases are not overwritten. It does not publish automatically.
6. Review the draft notes/downloads and publish when ready. A source release is not a signed installer. Keep the current OAuth setup requirement and live-provider testing limits visible.
7. Set `website/config.json`'s `repositoryPublished` to true only after the public URL exists, then rebuild the website. Website deployment and DNS are separate from publishing the repository.

After publication, the repository identifier can be used with the Skills CLI: `npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef`. Until then, use `npx skills@latest add . --skill tawdheef` from the source folder. The simple `npm run agent -- CLIENT` path already installs the local skill.

For manual release management, use [GitHub's release guide](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository). Keep release notes in a file when invoking `gh release create --notes-file`; do not place multiline content in a shell-built string.
