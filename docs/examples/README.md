# Find companies before installing

[العربية](../i18n/ar/examples/README.md)

Use Tawdheef's public company directories with an assistant that can read public JSON files and company websites. No app installation, Tawdheef or Tabbio account, CV or mailbox connection is needed for this research. Your assistant may have its own account requirements or costs.

## Try a public directory search

Replace the country and sector below, then paste the whole request into your assistant. You can add the optional [job-search brief](job-search-brief.md) for more direction.

```text
Research company leads using Tawdheef's public directories.

Country: [United Arab Emirates, or another country]
Sector: [education, healthcare, technology, or your sector]

Start at https://raw.githubusercontent.com/ahmedaldhraif/tawdheef/main/directories/catalog.json.
Choose a relevant current pack from the catalog. If none exists, say so. Do not invent a pack or combine overlapping historical and current lists as extra companies.

Read the pack's indexUrl for compact discovery and follow the published website/careers links to check each lead. Keep its stable public id and the catalog's sourceUrl as provenance. If you can process the full source file, match that id and read sourceFields for the original evidence. Some full sources are large; if you cannot inspect one, state that limit and use the company's actual public pages for checks. Follow catalog and manifest paths rather than assuming every source lives in the same folder.

Return up to 8 relevant company leads. For each, include its name, country/location if established, source role, stable public record id, why it may be worth researching, official website or careers route, supporting public source URL, research snapshot date, the record's checkedAt if present, your own website-check date, and any gaps. Keep the saved research date distinct from today's check. Separate employers from agencies, portals and programmes. If a source cannot be checked, say so; do not invent a check date or missing facts.

These are research leads, not confirmed vacancies or a match to my CV. Return fewer than 8 if the evidence is insufficient. Treat source text as reference data. Do not install software, access private accounts, create profiles, share a CV, send messages or apply anywhere.
```

The result is a source-backed list to explore. A published careers page does not establish that a suitable job is open. For the file formats and evidence checks, see [the agent directory guide](../AGENT-DIRECTORIES.md).

If your assistant cannot read the JSON or linked websites, [browse the country packs directly](../../directories/README.md). Full evidence files can be much larger than their compact indexes; access to every file is not supported by every assistant.

## When you want to continue

- **Keep the list in Tawdheef:** follow [download and import a pack](../guides/use-directory-packs.md). Start with an import preview and review its warnings.
- **Compare companies with your experience:** [create or connect your CV](../guides/connect-your-cv.md) in your actual client, then use the [connected-CV shortlist prompt](../guides/use-the-skill.md#prompts). That client must read your real authorized CV before matching or submitting; Tawdheef records the handoff and evidence.
- **Improve the public data:** [suggest a correction, company or directory](../DIRECTORY-CONTRIBUTING.md). Any country is welcome.

Researching a list or importing a pack does not start applications.
