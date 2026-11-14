# Directory pack updates

Publication status checked 14 November 2026 against the public GitHub release and merged pull requests.

This page separates published downloads from reviewed source changes. A merged correction becomes a downloadable update only when a maintainer rebuilds and publishes the pack. Existing local trackers do not update in the background.

## Published baseline: v0.1.2

The [v0.1.2 public preview](https://github.com/ahmedaldhraif/tawdheef/releases/tag/v0.1.2) was published on **13 November 2026**. Its directory downloads contain:

| Pack | Research snapshot | Organisation/source records |
| --- | --- | ---: |
| [Bahrain](bahrain/) | 13 November 2026 | 811 |
| [Kuwait](kuwait/) | 13 November 2026 | 1,806 |
| [Oman](oman/) | 13 November 2026 | 2,587 |
| [Qatar](qatar/) | 13 November 2026 | 671 |
| [Saudi Arabia](saudi-arabia/) | 13 November 2026 | 4,256 |
| [Expanded UAE](uae-expanded/) | 13 November 2026 | 3,583 |
| [Original UAE](uae/) | 10 November 2026 | 772 |

The six current country packs total **13,714 records**. The original UAE snapshot overlaps expanded UAE and must not be added as extra unique organisations. Counts include source records, campuses, agencies, portals, programmes and unresolved leads; they are not live vacancies or verified independent employers. Initial research is by Ahmed AlDhraif.

Use each pack's [README and manifest](README.md) for its exact download, source hash, coverage notes and import filenames. Read the [data policy](../docs/policies/DATA.md) for source-specific reuse and attribution.

## Repository updates after that release

- [PR #12](https://github.com/ahmedaldhraif/tawdheef/pull/12), merged 14 November 2026: clearer code/data contribution routes and contextual correction forms.
- [PR #13](https://github.com/ahmedaldhraif/tawdheef/pull/13), merged 14 November 2026: public company research, a private job-search brief and English/Arabic entry points.

These changes improve the repository and website source. They are **not a newly published directory dataset**, do not replace the v0.1.2 ZIPs, and do not update an installed tracker. Later website navigation and guides can differ from the frozen release notes; use the current [guide index](../docs/guides/README.md) and the installed app's actual capabilities.

## How to receive a published pack update

Follow the current [download and import guide](../docs/guides/use-directory-packs.md). Choose the actual published pack version, extract it, review the manifest's import files, then preview and import every CSV part into the same intended directory. Keep a backup and preserve private tracking and application history. Importing public data never starts applications.

## Template for the next published update

Use the template only for a real pack release. Link actual downloads, changed records and accepted contributions. Leave a field unclaimed rather than inventing a release, check date, contributor or result.

```markdown
## [Pack name] · [published version]

Published: [date]
Research snapshot or source-check period: [date or period]
Download: [actual release asset link]
Previous published version: [version/link]

### What changed

- [Stable public record ID]: [specific addition/correction/removal], supported by [public source URL], checked [date].
- Coverage or count change: [what changed and how it was counted, if applicable].
- Known gaps: [remaining missing or uncertain information].

### Contributions

- [public contributor handle] · [actual merged issue/PR link] · [specific contribution].

### Receive this update

[Link the canonical download/import guide and name any changed CSV parts or compatibility requirement.]
```

Retain stable source IDs, original evidence and source-role distinctions. The original UAE baseline stays unchanged; current UAE corrections belong in the reviewed expanded source. See the [directory contribution guide](../docs/DIRECTORY-CONTRIBUTING.md) and [release guide](../docs/RELEASE.md) for the existing review and publication process.
