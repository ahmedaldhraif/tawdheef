# Contribute a directory for any country

This is a blank template, excluded from the public catalog. It contains no
invented organisations or contact details.

1. Copy this folder to `directories/<new-lowercase-pack-id>/`.
2. Fill `pack.json` with the matching ID, actual country code, name and research
   date. Set `source` to `directories/<pack-id>/source.json`. Use kind `country`,
   `sector` or `regional`; a regional pack can also list its actual `countries`.
3. Fill `record.template.json` from real public evidence and add the completed
   records to `source.json`. Do not add a blank template record. Preserve the
   stable source ID, full public evidence and source-specific reuse notes.
4. Validate the proposal, then build the release artifacts after review:

```sh
node scripts/marketing/build-directory-pack.mjs --check --pack PACK_ID
node scripts/marketing/build-directory-pack.mjs
```

The full build works from canonical sources alone. Generated CSVs,
`*-directory.json` copies and ZIPs are downloads/build artifacts, not PR editing
sources. Submit corrected CSV rows from a downloaded pack as review material
with stable IDs, evidence URLs, dates and reasons. Accepted changes belong in the
reviewed `source.json` or a new dated snapshot. Never edit the historical
`data/uae-directory.json` seed or original UAE source copy.

The required record strings are `id`, `name`, `sourceRole` and `routeStatus`.
Unknown optional contact fields stay blank. `sourceFields` preserves public
evidence, source aliases, attribution, missing information and research notes.
A portal, agency, programme or roster lead is not automatically an employer.

Contribute only material you have the right to share. Retain attribution and
source-specific terms; exclude unlicensed bulk copies and private personal data.
See the [contribution guide](../../docs/DIRECTORY-CONTRIBUTING.md),
[pack schema](../pack.schema.json) and [data policy](../../docs/policies/DATA.md).
