# Add a country directory

Directory packs are free add-ons: researched companies and recruitment sources for a country or industry. Start with the included original UAE snapshot or add another pack from GitHub.

## Download and import a pack

1. [Browse the available directories](https://github.com/ahmedaldhraif/tawdheef/blob/main/directories/README.md) and open the country you want. Use its **Download ZIP** link, or get the same pack from [GitHub releases](https://github.com/ahmedaldhraif/tawdheef/releases).
2. Extract `<pack-id>-directory-pack.zip` on your computer. Open the included `README.md` and `manifest.json` to see its date, coverage and import filenames.
3. In Tawdheef, add a directory tab or select the tab that should receive the pack.
4. Open **List options → Import list** and choose the extracted CSV. Review the preview and warnings, then import it.
5. If `files.imports` lists numbered CSV parts, import **every part into that same tab**. The expanded UAE and Saudi Arabia packs have multiple parts.

The compact `index.json` is useful for agent discovery. It is not the import file. The full source JSON retains the original evidence and missing-data notes.

## Ask your agent to handle the steps

> Download the Bahrain pack from Tawdheef’s GitHub release, extract it and preview its import into my Bahrain tab. Show me any warnings before committing. Do not start applications.

Use another country name if that is the pack you want. Your agent should use the real directory ID returned by the tracker, not assume the pack’s name is that ID.

## Improve the directory

Found a broken link or a missing source? [Report a correction](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=directory-data.yml) with the organisation, stable record ID, source URL and date checked. [New packs for any country or industry](https://github.com/ahmedaldhraif/tawdheef/issues/new?template=new-country-pack.yml) are welcome.

## Expected result

The chosen tab contains the imported source records and evidence. Existing tracking remains intact. Pack counts describe dated research records, not current vacancies; importing does not apply to any organisation.
