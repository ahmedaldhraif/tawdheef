# Directory packs for Tawdheef

Free country, regional and sector packs for the local tracker. Contributions can
add or improve data for **any country**. Initial research is by Ahmed AlDhraif;
community contributions are welcome.

These are add-ons for Tawdheef, the **Auto Job Apply & Application Tracker**.
Start with a country, then use the same app and agent workflow.

The catalog currently includes six researched country snapshots dated
13 November 2026 and the separate original UAE snapshot dated 10 November 2026.
Counts describe organisation/source records, including campuses and unresolved
leads. They are not unique employers, current vacancies or tested applications.
The original UAE pack overlaps the expanded UAE pack; do not add both counts.

## Download and use

Want to explore companies before installing? [Try a public research request](../docs/examples/README.md).
Use the optional [job-search brief](../docs/examples/job-search-brief.md) to name your role, location and sector preferences.

Open a pack below and use its **Download ZIP** release link:

| Country | Records | GitHub pack |
| --- | ---: | --- |
| Bahrain | 811 | [bahrain](bahrain/) |
| Kuwait | 1,806 | [kuwait](kuwait/) |
| Oman | 2,587 | [oman](oman/) |
| Qatar | 671 | [qatar](qatar/) |
| Saudi Arabia | 4,256 | [saudi-arabia](saudi-arabia/) |
| United Arab Emirates | 3,583 | [uae-expanded](uae-expanded/) |

All six snapshots are dated 13 November 2026. The separate
[original UAE snapshot](uae/) preserves the historical 772-record baseline.
Downloads also appear in [GitHub releases](https://github.com/ahmedaldhraif/tawdheef/releases).

Extract the selected `<pack-id>-directory-pack.zip` on your computer.
Each ZIP includes the unchanged public source JSON, provenance manifest, import
CSV files and instructions. Saudi Arabia and the expanded UAE pack have numbered
CSV parts: preview and import every part into the same chosen tracker directory.

Use **List options → Import list**, or preview through the CLI:

```sh
node bin/apply-tracker.mjs import --directory DIRECTORY_ID --file PATH_TO_DOWNLOADED_CSV
```

Use the real directory ID. Add `--commit` only after reviewing and authorising
the import. Importing reference data does not apply to any organisation, and
refreshing evidence must preserve existing tracking.

You can ask your agent: “Download the Bahrain pack from Tawdheef's GitHub
release, extract it and preview its import into my Bahrain tab. Show me any
warnings before committing. Do not start applications.” The same request works
with another named pack. Use [the first-run guide](../docs/FIRST-RUN.md) to
create/connect your Tabbio CV and verify the agent before Run.

## For agents and other tools

Read the [raw catalog](https://raw.githubusercontent.com/ahmedaldhraif/tawdheef/main/directories/catalog.json),
then each pack's `files.index` for compact discovery. Use `canonicalSource` and
the stable record `id` for full evidence; verify its source SHA-256. The catalog's
`downloadUrl` points to a ZIP. Generated CSVs are inside it, not raw GitHub files.
The [releases API](https://api.github.com/repos/ahmedaldhraif/tawdheef/releases)
includes prereleases; `releases/latest` may not. See the
[agent directory guide](../docs/AGENT-DIRECTORIES.md) for the full contract.

## Source and generated files

The reviewed inputs in Git are `directories/<pack-id>/source.json` and `pack.json`.
The historical `uae` definition instead points to the immutable original
`data/uae-directory.json`. `catalog.json`, manifests and instructions describe
the packs. The builder can reconstruct all downloads from those reviewed inputs.

Generated CSVs, `*-directory.json` copies and ZIPs are local/release artifacts,
not files to edit in a pull request. Get CSVs from a downloaded pack or build
them locally. A corrected CSV row is useful review material; maintainers carry
accepted corrections into the canonical source and retain its provenance.

From a checkout with the locked dependencies installed:

```sh
node scripts/marketing/build-directory-pack.mjs --check
node scripts/marketing/build-directory-pack.mjs
```

`--check` validates without writing. The full build creates missing import files,
original-source copies, manifests, ZIPs and the catalog without opening a private
tracker database. After a full build, rebuild one changed pack with
`--pack PACK_ID`. A targeted build refuses to publish links to missing or stale
packs; run the full build when starting from canonical sources alone.

## Add a country or correct a source

No coding needed: [fix or enrich a record](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=directory-data.yml),
[add a company](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=add-company.yml),
or [propose a country or industry pack](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=new-country-pack.yml).
Include the country/pack, organisation, stable source `id` if known, public source
URL and date checked. One well-sourced entry is enough to start.

For a pull request, edit the current pack's `source.json`; use the
[blank contribution template](_template/README.md) and
[pack definition schema](pack.schema.json) for a new pack. Follow the
[directory contribution guide](../docs/DIRECTORY-CONTRIBUTING.md) for review and validation.

Accepted changes reach downloads when a maintainer publishes the rebuilt pack.
To receive them locally, download that pack version and preview importing its
CSV parts into the same tab. Corrections do not automatically sync into existing
trackers; imports must preserve application history and private tracking.

Preserve stable source IDs, actual hyperlink destinations, source roles, earlier
public evidence and missing-data notes. Include new evidence URLs, the research
date and source-specific reuse notes. Keep private CVs, mailbox contents,
credentials and application activity out of packs. The original 772-record UAE
snapshot stays unchanged; corrections belong in a reviewed later snapshot.

Project-owned curation and third-party source material have distinct rights.
Read the [data policy](../docs/policies/DATA.md) before contributing or reusing a
pack; public availability alone does not grant permission to redistribute content.
