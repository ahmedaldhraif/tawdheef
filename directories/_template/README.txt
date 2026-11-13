Contribute a directory for any country

This is an empty contribution template, not researched country data. It is
excluded from pack discovery. No dummy organisations or contacts are supplied.

Copy this folder to directories/<new-lowercase-pack-id>/. Fill pack.json with
the actual country code, name, research date and repository-relative source
path: directories/<pack-id>/source.json. The folder name and id must match.
Use kind country, sector or regional. Regional packs may list countries too.
Fill source.json from reviewed public evidence, never a personal tracker export.
record.template.json is a blank record shape to fill from real evidence and add
to source.json's records array. Do not publish the blank record itself.

Validate without writing generated files:
node scripts/marketing/build-directory-pack.mjs --check --pack <pack-id>

Build after review:
node scripts/marketing/build-directory-pack.mjs --pack <pack-id>

Record contract
Required non-empty strings: id, name, sourceRole, routeStatus.
id is the stable source ID, not a local company_ or directory_ database ID.
Optional strings: arabicName, sector, location, type, website, careersUrl,
applyUrl, linkedinUrl, email, checkedAt. Blank means unknown; do not guess.
Required sourceFields object: keep original public evidence, real hyperlink
destinations, aliases, research notes, missing information and dates. Keep
personal application activity and private messages out of the source pack.
Document the origin and reuse terms in source.licenseNotes and retain required
attribution. Contribute only material you have the right to share. The project's
code license does not grant rights to third-party sites, artwork or bulk source
content. Exclude unlicensed bulk copies and private personal information.
Project-owned original curation follows LICENSE unless an explicit source/file
notice says otherwise. See docs/policies/DATA.md for contribution and reuse rules.

Distinguish employers, agencies, portals, programmes and unresolved roster
leads. A published listing is not proof of hiring or application eligibility.
Identify business/contact emails separately from recruitment inboxes in evidence.

Corrections
Submit a stable source ID, corrected value, public evidence URL, date and reason.
Corrected CSV rows are useful review material. Maintainers integrate accepted
changes into reviewed source.json or a new dated snapshot and retain earlier
evidence. Generated CSV is an import view; editing it alone will not survive a
rebuild. data/uae-directory.json and the original directories/uae pack stay frozen.

Import
Each ZIP includes unchanged original JSON, manifest, README and one or more CSV
files. Preview through List options > Import list or CLI import. Add --commit
only after review and authorisation. Import every numbered part into the same
directory. Stable source IDs preserve matches; keep tracking history intact.
