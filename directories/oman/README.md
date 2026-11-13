# Oman directory pack

**2,587 organisation/source records** · Research snapshot: **2026-11-13**

[Download ZIP](https://github.com/ahmedaldhraif/tawdheef/releases/download/v0.1.2/oman-directory-pack.zip) · [Release](https://github.com/ahmedaldhraif/tawdheef/releases/tag/v0.1.2) · [Tawdheef app](https://github.com/ahmedaldhraif/tawdheef)

2,587 researched organisations and recruitment sources in Oman, with original public evidence and missing-data notes.

## Add this pack to Tawdheef

1. [Set up the app](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/FIRST-RUN.md) if it is not running yet. A directory pack ZIP is an add-on, not the app installer.
2. Download the ZIP above and **extract it locally**. The CSV imports are inside the ZIP; they are not files to fetch from Git.
3. Create or select the country tab in Tawdheef, then open **List options → Import list**.
4. Preview and import the CSV into that tab: `oman-directory.csv`. Review warnings before committing.

For an agent, read the extracted `manifest.json` → `files.imports` and use the local directory ID returned by `list_directories`. A pack ID is not a local directory ID. Importing a pack never starts applications.

## Read with an agent

- [Compact index](index.json): every stable record ID and primary facts.
- [Full evidence](https://raw.githubusercontent.com/ahmedaldhraif/tawdheef/main/directories/oman/source.json): match the same `id` and inspect `sourceFields`.
- [Manifest](manifest.json): source integrity and import filenames.
- Source SHA-256: `d156881e583fdada9ebc325db1dc35962b2e39d142320f66d799dd9d76100661`. Hash the full source file bytes.

The index is for discovery, not an import file or a substitute for provenance. The ZIP retains the full original JSON as `oman-directory.json`.

## Correct a record or add another country

[Report a correction](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=directory-data.yml), [propose a pack](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=new-country-pack.yml), or follow the [contribution guide](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/DIRECTORY-CONTRIBUTING.md). **Any country or industry is welcome.** Keep stable IDs and include public evidence URLs and dates. Edit reviewed source data; generated downloads are rebuilt.

Initial research by Ahmed AlDhraif; open to community contributions.

## Scope and reuse

- Contains all reviewed source records, including unresolved roster-only leads. Published contacts and recruitment routes may be untested.
- Research snapshot, not a current vacancy feed
- A portal, agency or programme is not automatically an employer
- Published routes may be untested; inclusion does not establish hiring, eligibility, mailbox deliverability or permission to automate
- Full original public evidence is retained byte-for-byte in JSON and as Original evidence JSON in CSV
- No private tracking or application activity included

The project code license does not sublicense third-party websites, artwork or source content. Original evidence, source-specific license notes and rights remain attached to each record.
