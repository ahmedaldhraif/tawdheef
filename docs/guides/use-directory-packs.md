# Add a country directory

Directory packs are free add-ons: researched companies, recruitment routes and, in guided packs, bounded agent guidance for a country or industry. Each guided pack identifies its creator, maintainers, version, source-check period and update history. Pack content never grants application permission or installs executable code.

## Download and import a pack

In the current local app, open **List options → Manage directory packs**. Choose a bundled pack or **Import pack** and select the whole ZIP. Review additions, changes, removals, guidance and warnings, then install the preview. The app reads all parts together and preserves tracking and manual edits. Updates use the same preview. Removing a pack detaches it while retaining recorded history; pause an existing monitor separately if you want its saved work to stop.

The six guided packs in local source are **unpublished previews**. Their content edit dates are not new source-verification or release dates. Existing public v0.1.2 ZIPs remain legacy data packs and have not been replaced by these changes. For an older installed app, use its CSV import path:

1. [Browse the available directories](https://github.com/ahmedaldhraif/tawdheef-auto-apply-jobs/blob/main/directories/README.md) and open the country you want. Use its **Download ZIP** link, or get the same pack from [GitHub releases](https://github.com/ahmedaldhraif/tawdheef-auto-apply-jobs/releases).
2. Extract `<pack-id>-directory-pack.zip` on your computer. Open the included `README.md` and `manifest.json` to see its date, coverage and import filenames.
3. In Tawdheef, add a directory tab or select the tab that should receive the pack.
4. Open **List options → Import list** and choose the extracted CSV. Review the preview and warnings, then import it.
5. If `files.imports` lists numbered CSV parts, import **every part into that same tab**. The expanded UAE and Saudi Arabia packs have multiple parts.

The compact `index.json` is useful for agent discovery. It is not the import file. The full source JSON retains the original evidence and missing-data notes.

## Ask your agent to handle the steps

> List available directory packs, read the Bahrain pack and preview installing it into my chosen directory. Show me the version, source date and changes before installing. Do not start applications or enable monitoring.

Use another country name if that is the pack you want. Your agent should use the real directory ID returned by the tracker, not assume the pack’s name is that ID.

## Improve the directory

Found a broken link or a missing source? [Report a correction](https://github.com/ahmedaldhraif/tawdheef-auto-apply-jobs/issues/new?template=directory-data.yml) with the organisation, stable record ID, source URL and date checked. [New packs for any country or industry](https://github.com/ahmedaldhraif/tawdheef-auto-apply-jobs/issues/new?template=new-country-pack.yml) are welcome.

## Expected result

The chosen tab contains the source records, evidence and installed pack identity. Existing tracking remains intact. Verified shared organisations reuse existing work across overlapping packs; names or shared ATS domains alone are not identity proof. Pack counts describe dated research records, not current vacancies. Installing or updating never starts applications or enables monitoring.
