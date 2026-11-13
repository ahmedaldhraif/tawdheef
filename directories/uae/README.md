# United Arab Emirates — original snapshot directory pack

**772 organisation/source records** · Research snapshot: **2026-11-10**

[Download ZIP](https://github.com/ahmedaldhraif/tawdheef/releases/download/v0.1.2/uae-directory-pack.zip) · [Release](https://github.com/ahmedaldhraif/tawdheef/releases/tag/v0.1.2) · [Tawdheef app](https://github.com/ahmedaldhraif/tawdheef)

The original 772-record UAE research snapshot bundled with Tawdheef. Later researched snapshots are separate packs.

## Add this pack to Tawdheef

1. [Set up the app](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/FIRST-RUN.md) if it is not running yet. A directory pack ZIP is an add-on, not the app installer.
2. Download the ZIP above and **extract it locally**. The CSV imports are inside the ZIP; they are not files to fetch from Git.
3. Create or select the country tab in Tawdheef, then open **List options → Import list**.
4. Preview and import the CSV into that tab: `uae-directory.csv`. Review warnings before committing.

For an agent, read the extracted `manifest.json` → `files.imports` and use the local directory ID returned by `list_directories`. A pack ID is not a local directory ID. Importing a pack never starts applications.

## Read with an agent

- [Compact index](index.json): every stable record ID and primary facts.
- [Full evidence](https://raw.githubusercontent.com/ahmedaldhraif/tawdheef/main/data/uae-directory.json): match the same `id` and inspect `sourceFields`.
- [Manifest](manifest.json): source integrity and import filenames.
- Source SHA-256: `531e80df9a72b5a4c06c253dcf0f776dc89107b7711d564b830690bcf1f7549f`. Hash the full source file bytes.

The index is for discovery, not an import file or a substitute for provenance. The ZIP retains the full original JSON as `uae-directory.json`.

## Correct a record or add another country

[Report a correction](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=directory-data.yml), [propose a pack](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=new-country-pack.yml), or follow the [contribution guide](https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/DIRECTORY-CONTRIBUTING.md). **Any country or industry is welcome.** Keep stable IDs and include public evidence URLs and dates. Edit reviewed source data; generated downloads are rebuilt.

Initial research by Ahmed AlDhraif; open to community contributions.

## Scope and reuse

- Original 772-record baseline. Do not add its count to a later UAE pack as unique organisations.
- Research snapshot, not a current vacancy feed
- A portal, agency or programme is not automatically an employer
- Published routes may be untested; inclusion does not establish hiring, eligibility, mailbox deliverability or permission to automate
- Full original public evidence is retained byte-for-byte in JSON and as Original evidence JSON in CSV
- No private tracking or application activity included

Repository code is MIT licensed. Retained public source facts, third-party sites and marks keep their own terms; inspect original evidence.
