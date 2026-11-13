# Directory packs for Tawdheef

Free country, regional and sector packs for the local tracker. Contributions can
add or improve data for **any country**. Initial research is by Ahmed AlDhraif;
community contributions are welcome.

The catalog currently includes six researched country snapshots dated
13 November 2026 and the separate original UAE snapshot dated 10 November 2026.
Counts describe organisation/source records, including campuses and unresolved
leads. They are not unique employers, current vacancies or tested applications.
The original UAE pack overlaps the expanded UAE pack; do not add both counts.

## Download and use

Download a directory ZIP from the project's release assets or directory page.
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

Start with the [blank contribution template](_template/README.md) and
[pack definition schema](pack.schema.json). Follow the
[directory contribution guide](../docs/DIRECTORY-CONTRIBUTING.md).

Preserve stable source IDs, actual hyperlink destinations, source roles, earlier
public evidence and missing-data notes. Include new evidence URLs, the research
date and source-specific reuse notes. Keep private CVs, mailbox contents,
credentials and application activity out of packs. The original 772-record UAE
snapshot stays unchanged; corrections belong in a reviewed later snapshot.

Project-owned curation and third-party source material have distinct rights.
Read the [data policy](../docs/policies/DATA.md) before contributing or reusing a
pack; public availability alone does not grant permission to redistribute content.
