# Directory packs

The original UAE starter pack is the 10 November 2026 research snapshot.
A fresh Tawdheef install includes it. Additional country packs are listed in
the checkout's `directories/catalog.json` and at https://www.tawdheef.com/directories/.
Read each pack's manifest and source before importing. A pack never supplies
application authority. The expanded UAE pack overlaps the original starter;
do not sum their records as unique companies.

Use the app's Add directory and List options → Import list, or the current
`import_directory` domain tool. CSV/TSV/XLSX imports are preview-only by default.
Review warnings and original fields before a user-authorised commit.

CLI preview example from the checkout:

```sh
node bin/apply-tracker.mjs import --directory DIRECTORY_ID --file directories/uae/uae-directory.csv
```

Use the real directory ID returned by `list_directories`. Add `--commit` only
when the requested import is authorised and the reviewed preview is appropriate.
Prefer structured JSON input files for writes through the generic `call` form.

Keep full source JSON as the authoritative evidence snapshot. The CSV carries
mapped fields plus Original evidence JSON. Published routes are untested unless
the record explicitly says otherwise. Do not infer missing email addresses,
ownership, nationality eligibility or shared recruitment accounts.

Refreshing source evidence must preserve existing application history, notes
and next actions. Use revision checks where supported.

Anyone can propose corrections or a pack for any country. Follow the checkout's
`docs/DIRECTORY-CONTRIBUTING.md`: edit the reviewed `source.json`, preserve stable
IDs, source roles and original evidence, and regenerate derived files. Do not
submit private tracking exports, personal credentials or unlicensed bulk copies.
