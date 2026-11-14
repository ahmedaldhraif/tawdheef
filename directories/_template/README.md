# Contribute a directory for any country

This is a blank template, excluded from the public catalog. The fictional
record in [EXAMPLE.md](EXAMPLE.md) teaches the fields and is never source data.

1. Copy this folder to `directories/<new-lowercase-pack-id>/`.
2. Fill `pack.json` with the matching ID, actual country code, name and research
   date, real creator/maintainer GitHub logins, version and content edit date.
   Keep `contributors` empty until there are actual accepted contribution links.
   Omit `releasedAt` while unpublished. Set `source` to
   `directories/<pack-id>/source.json`. Use kind `country`,
   `sector` or `regional`; a regional pack can also list its actual `countries`.
3. Fill `record.template.json` from real public evidence and add the completed
   records to `source.json`. Do not add a blank template record. Preserve the
   stable source ID, full public evidence and source-specific reuse notes.
4. Fill `GUIDE.md` with verified recruitment-route guidance and unknowns. Keep
   common instructions here once, within 32 KiB. Add actual changes and credit
   to `CHANGELOG.md`; a content edit never means every source was rechecked.
5. Validate and scan the proposal, then build release artifacts after review:

```sh
node scripts/marketing/build-directory-pack.mjs --check --pack PACK_ID
node scripts/scan-contribution.mjs
node scripts/marketing/build-directory-pack.mjs
```

The full build works from canonical sources alone. Generated CSVs,
`*-directory.json` copies and ZIPs are downloads/build artifacts, not PR editing
sources. Submit corrected CSV rows from a downloaded pack as review material
with stable IDs, evidence URLs, dates and reasons. Accepted changes belong in the
reviewed `source.json` or a new dated snapshot. Never edit the historical
`data/uae-directory.json` seed or original UAE source copy.

The required record strings are `id`, `name`, `sourceRole`, `routeStatus` and an
actual `checkedAt` date/timestamp. Guided packs require supporting public
evidence. Optional structured recruitment routes are in `sourceFields.recruitment`;
route claims need `fieldEvidence`. Capability states are `supported`,
`unavailable` or `unknown`, with unknown as the honest starting point.
Unknown optional contact fields stay blank. `sourceFields` preserves public
evidence, source aliases, attribution, missing information and research notes.
A portal, agency, programme or roster lead is not automatically an employer.

Contribute only material you have the right to share. Retain attribution and
source-specific terms; exclude unlicensed bulk copies and private personal data.
See the [contribution guide](../../docs/DIRECTORY-CONTRIBUTING.md),
[pack schema](../pack.schema.json), [record schema](../record.schema.json),
[community policy](../../docs/policies/CONTRIBUTIONS.md) and
[data policy](../../docs/policies/DATA.md). A clean heuristic scan is not proof
of safe guidance, accurate facts, content rights or website permission.
