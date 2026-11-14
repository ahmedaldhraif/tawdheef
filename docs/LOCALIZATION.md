# Website languages

The landing page, Skills overview and all eight guides are available in English and Arabic. The tracker UI, directory evidence and provider contracts are separate from these website translations.

| Page | English | Arabic |
| --- | --- | --- |
| Public landing | `/` | `/ar/` |
| Local landing preview | `/welcome/` | `/welcome/ar/` |
| Skills | `/skills/` | `/ar/skills/` |
| Guides | `/guides/` | `/ar/guides/` |
| Guide article | `/guides/SLUG/` | `/ar/guides/SLUG/` |

Copy lives in `website/i18n/`. English guide sources are in `docs/guides/`; Arabic guide sources are in `docs/i18n/ar/guides/`, with matching entries in `website/i18n/guides-ar.json`.

Arabic headings retain the same fragment IDs through Markdown such as `## ربط السيرة {#cv}`. Keep commands, configuration keys, URLs, source IDs and quoted evidence unchanged. The setup request continues to use the single canonical text in `docs/FIRST-RUN.md`.

Each translated page has its own canonical URL and reciprocal English/Arabic alternate links. Language switching preserves the current section. Arabic uses RTL layout; commands, URLs and supplied artwork retain their original direction. All public pages follow the device color scheme unless the reader selects light or dark. The saved choice stays in this browser and can be reset to the device theme.

After copy changes, run `node website/build.mjs` and `npm run build`. Verify `tests/locales-ui.spec.mjs` using the isolated browser test configuration. Browser emulation covers layout and keyboard behavior; actual phone interaction needs a physical device.
