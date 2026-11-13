United Arab Emirates directory pack for Tawdheef

3583 organisation/source records; snapshot 2026-11-13.
Initial research by Ahmed AlDhraif; open to community contributions.

Download ZIP: https://github.com/ahmedaldhraif/tawdheef/releases/download/v0.1.2/uae-expanded-directory-pack.zip
Extract the ZIP on your computer before importing. CSV files are inside this download, not versioned GitHub CSV links.

The JSON is an unchanged public evidence snapshot. CSV imports retain stable source IDs, exact mapped URLs, source roles and full Original evidence JSON.

Import files: uae-expanded-directory-01.csv, uae-expanded-directory-02.csv
Import every numbered part into the same selected directory; each chunk is below the local importer limit.

In Tawdheef, create or select your directory tab, then use List options > Import list and review each CSV preview. CLI preview from the Tawdheef checkout, replacing both placeholders:
node bin/apply-tracker.mjs import --directory DIRECTORY_ID --file PATH_TO_EXTRACTED_PACK/uae-expanded-directory-01.csv

Use the real directory ID returned by the tracker. Add --commit only after reviewing the preview and authorising the import. Importing a pack does not apply to companies. Refreshing evidence must preserve existing tracking.

- Contains all reviewed source records, including unresolved roster-only leads. Published contacts and recruitment routes may be untested.
- Separate expanded snapshot; overlaps the original 772-record UAE baseline. Do not add both pack counts as unique organisations.
- Research snapshot, not a current vacancy feed
- A portal, agency or programme is not automatically an employer
- Published routes may be untested; inclusion does not establish hiring, eligibility, mailbox deliverability or permission to automate
- Full original public evidence is retained byte-for-byte in JSON and as Original evidence JSON in CSV
- No private tracking or application activity included

Corrections: submit the stable source ID, changed value, public evidence URL and date. Maintainers update the reviewed public source/new dated snapshot and rebuild; generated CSV is not the durable editing source. Never edit data/uae-directory.json or the original UAE pack.
