# Contribute directory data

Any country or industry is welcome. You do not need to code: start with one public source and one useful change. Initial research is by Ahmed AlDhraif; community contributions are welcome.

## Make your first contribution

1. Choose [fix or enrich an entry](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=directory-data.yml), [add a company](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=add-company.yml), or [propose a country or industry pack](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=new-country-pack.yml).
2. Include the country/pack, organisation, public source URL and date checked. For an existing entry, copy its stable record `id` from the pack's `index.json` if you can; a public record link or organisation URL also helps a maintainer find it. The pack ID and your local tracker row ID are different identifiers.
3. Explain what the source confirms and what remains unknown. Submit the form; a maintainer reviews it and may ask for clarification. No pull request or complete national directory is required.

Use the same **Directory data** form for a broken link, duplicate, missing sector/location or newly published recruitment route. A new company can have only a verified website; leave an unknown careers link or email blank. Do not infer ownership, nationality eligibility or a vacancy.

For app problems or ideas, use [Bug report](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=bug.yml) or [Feature request](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=feature.yml). Issues are public. For sensitive data or rights concerns, follow [SECURITY.md](../SECURITY.md) without reposting the sensitive material. Read the [data and reuse policy](policies/DATA.md) before attaching a dataset.

## What happens after review

Accepted changes are incorporated into the reviewed public `source.json`, keeping stable source IDs and relevant evidence. A maintainer rebuilds the pack and publishes a new download when it is ready; submitting or merging a correction does not by itself replace existing release assets. Review and publication have no guaranteed deadline.

To receive a published update, download the pack version linked from its README, extract it, and preview importing all its CSV parts into your existing directory. Review warnings before committing. Updates are not pushed into local trackers in the background and must preserve private application history and tracking. Importing never starts a run.

For CSV review material, download the actual pack ZIP from its folder's README
release link and extract it first. Generated CSV files are release assets, not
the files to edit in Git.

## Submit a pull request or corrected CSV

For a pull request, edit the affected record in `directories/<pack-id>/source.json`. This reviewed public JSON is the editing source. Keep its `id` and existing `sourceFields` evidence. Record the correction, supporting URL and date without deleting the original evidence.

For a new organisation in an existing pack, add one researched record to that same file, following its schema and source-role values. Give it a unique stable source `id`; do not reuse a local tracker ID or renumber existing records. If unsure, submit an issue instead and let the maintainer assign the ID. Update the source record count when adding or removing a record.

If a CSV is easier, submit the corrected rows with those same IDs, public source URLs, the date checked and a note explaining each change. They can be reviewed and incorporated into the public source JSON before rebuilding the pack.

The original `directories/uae/` pack and `data/uae-directory.json` preserve the unchanged 772-record research snapshot from 10 November 2026. Do not edit that origin. Corrections to current UAE research belong in `directories/uae-expanded/source.json`, retaining stable IDs and old evidence. A generated import CSV is not the durable source of a correction.

## Add a pack

Open a **New directory pack** issue or start with `directories/_template/` for a pull request. Fill in the public source data and definition under `directories/<pack-id>/`:

- `pack.json` names the pack, country or region, snapshot date and reviewed `source.json` path. Use a unique lowercase pack ID.
- `source.json` contains only public directory data: dated source notes and researched records. Each record needs its stable `id`, `name`, accurate `sourceRole`, `routeStatus` and original public evidence in `sourceFields`.
- `index.json`, import CSV, manifest, readme and ZIP are generated from that reviewed definition and source. They are not the editing source. The compact index retains all IDs and points to full provenance; it is not an import file.

Retain:

- A country or industry scope, snapshot date, coverage count and known gaps.
- Stable record IDs, real names, source roles and actual link destinations.
- Public evidence for the supplied details, including where contacts were published.
- Source/reuse notes and any required attribution.

Start small. Publish only researched entries; do not add empty countries or claim a complete national directory.

Validate without generating files:

```sh
node scripts/marketing/build-directory-pack.mjs --check
```

Use `--pack PACK_ID --check` for a focused result; the shared catalog is still validated. The template is a starting point, not an available country pack. Generated indexes, CSVs, manifests, readmes and ZIPs are rebuilt from the definition and public source; do not edit them by hand. Keep generated ZIPs, builds and local verification output out of the pull request.

## Keep the evidence useful

An employer, recruitment agency, portal and programme are different source roles. Preserve the original classification and explain a correction with evidence. Unknown ownership or nationality eligibility stays unknown. Use only published recruitment contacts; do not infer an email address from a name or domain.

A published careers link is a research route, not proof of a vacancy or a tested application. Record an unavailable route as such rather than treating it as a rejection or closure of the organisation.

Keep directory data separate from application statuses, notes, receipts and private contacts. Do not submit `.local`, a tracking database, CVs, mailbox contents or credentials. New release ZIPs and builds are generated from reviewed source rather than committed.

## Review before importing

In Tawdheef, add or choose a directory, then use **List options → Import list**. Review the preview before committing. Updating public evidence must not overwrite someone's tracking records.

Read the extracted pack's `manifest.json` → `files.imports` and import every
numbered CSV part into that same tab. For agents, `list_directories` returns the
actual local ID; a pack slug is not that ID. CLI preview from the checkout:

```sh
node bin/apply-tracker.mjs import --directory DIRECTORY_ID --file PATH_TO_EXTRACTED_CSV
```

Use real values, then add `--commit` for the reviewed import. Importing does not
start applications. See [the agent directory guide](AGENT-DIRECTORIES.md) for
raw GitHub endpoints and the [first-run guide](FIRST-RUN.md) for CV/agent setup.

Code changes still follow the checks in [CONTRIBUTING.md](../CONTRIBUTING.md).
