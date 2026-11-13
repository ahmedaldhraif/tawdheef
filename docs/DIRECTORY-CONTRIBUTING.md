# Contribute directory data

Any country or industry is welcome. You can fix one entry or contribute a whole pack.

The initial research is by Ahmed AlDhraif. Contributions are welcome from anyone; you do not need to write app code.

## Fix one entry

Open a **Directory data** issue. Include the country, organisation, existing record ID if known, proposed change and a public source link. Add the date you checked it. No coding needed.

For a pull request, edit the affected record in `directories/<pack-id>/source.json`. This reviewed public JSON is the editing source. Keep its `id` and existing `sourceFields` evidence. Record the correction, supporting URL and date without deleting the original evidence.

If a CSV is easier, submit the corrected rows with those same IDs, public source URLs, the date checked and a note explaining each change. They can be reviewed and incorporated into the public source JSON before rebuilding the pack.

The original `directories/uae/` pack and `data/uae-directory.json` preserve the unchanged 772-record research snapshot from 10 November 2026. Do not edit that origin. Corrections to current UAE research belong in `directories/uae-expanded/source.json`, retaining stable IDs and old evidence. A generated import CSV is not the durable source of a correction.

## Add a pack

Open a **New directory pack** issue or start with `directories/_template/` for a pull request. Fill in the public source data and definition under `directories/<pack-id>/`:

- `pack.json` names the pack, country or region, snapshot date and reviewed `source.json` path. Use a unique lowercase pack ID.
- `source.json` contains only public directory data: dated source notes and researched records. Each record needs its stable `id`, `name`, accurate `sourceRole` and original public evidence in `sourceFields`.
- Import CSV, manifest, readme and ZIP are generated from that reviewed definition and source. They are not the editing source.

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

Use `--pack PACK_ID --check` to validate one pack. The shared template is a starting point, not an available country pack. Generated CSVs, manifests, readmes and ZIPs are rebuilt from the definition and public source; do not edit them by hand. Keep generated ZIPs, builds and local verification output out of the pull request.

## Keep the evidence useful

An employer, recruitment agency, portal and programme are different source roles. Preserve the original classification and explain a correction with evidence. Unknown ownership or nationality eligibility stays unknown. Use only published recruitment contacts; do not infer an email address from a name or domain.

A published careers link is a research route, not proof of a vacancy or a tested application. Record an unavailable route as such rather than treating it as a rejection or closure of the organisation.

Keep directory data separate from application statuses, notes, receipts and private contacts. Do not submit `.local`, a tracking database, CVs, mailbox contents or credentials. New release ZIPs and builds are generated from reviewed source rather than committed.

## Review before importing

In Tawdheef, add or choose a directory, then use **List options → Import list**. Review the preview before committing. Updating public evidence must not overwrite someone's tracking records.

Code changes still follow the checks in [CONTRIBUTING.md](../CONTRIBUTING.md).
