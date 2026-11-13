# GitHub directory packs

Repository: https://github.com/ahmedaldhraif/tawdheef
Catalog: https://raw.githubusercontent.com/ahmedaldhraif/tawdheef/main/directories/catalog.json
Release list: https://api.github.com/repos/ahmedaldhraif/tawdheef/releases

Read the catalog and choose by country/date/scope. Use the pack's `index.json`
for compact discovery, then follow `canonicalSource` and match the same stable
record `id` for full `sourceFields` evidence. Verify `sourceSha256` against the
source file bytes. Historical and expanded UAE packs overlap. Counts describe
research records, not current vacancies or independently verified employers.

## Download and import when requested

1. Follow the catalog's `downloadUrl`, the pack folder's README link, or inspect
   the chosen GitHub release's actual assets for `<pack-id>-directory-pack.zip`.
   A checkout's `website/config.json` names its release tag. Prereleases appear
   in the releases API but may be omitted by `releases/latest`.
2. Extract the ZIP locally. Read `manifest.json` → `files.imports`. Use these
   CSV files, not `index.json` or a guessed GitHub CSV URL.
3. Read `list_directories`. Reuse the person's chosen directory, or create the
   requested tab with `create_directory` and an actual symbol from
   `list_directory_symbols`. A public pack ID is not the local directory ID.
4. Preview each CSV through `import_directory` with the local `filePath` and
   chosen `directoryId`. Review counts, sample and warnings, then commit within
   the requested import scope. Every numbered part goes into the same tab.

CLI equivalents from the Tawdheef checkout:

```sh
node bin/apply-tracker.mjs directories
node bin/apply-tracker.mjs import --directory DIRECTORY_ID --file PATH_TO_EXTRACTED_CSV
node bin/apply-tracker.mjs import --directory DIRECTORY_ID --file PATH_TO_EXTRACTED_CSV --commit
```

Replace placeholders with the returned ID and extracted file path. Public IDs
become local `sourceId` values; use a returned local company `id` for tools such
as `get_company`. Preserve application history, notes and next actions when
refreshing public evidence. An import never authorises an application run.

Published routes remain untested unless evidence establishes otherwise. Do not
infer missing emails, ownership, eligibility or shared recruitment accounts.

## Contribute a correction or another country

Any country or industry is welcome. Submit a correction through
https://github.com/ahmedaldhraif/tawdheef/issues/new?template=directory-data.yml
or a new pack through
https://github.com/ahmedaldhraif/tawdheef/issues/new?template=new-country-pack.yml.
Include stable IDs, public sources, dates, contact purpose and reuse notes.
Pull requests edit reviewed `directories/<pack-id>/source.json` and `pack.json`;
generated indexes and downloads are rebuilt. The original 772-record UAE seed
stays unchanged. Follow `docs/DIRECTORY-CONTRIBUTING.md` and its data policy.
Never publish CVs, mailbox contents, credentials or private tracking exports.
