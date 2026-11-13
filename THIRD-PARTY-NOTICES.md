# Third-party notices

## Search service artwork

`public/brands/google-original.ico` and `public/brands/bing-original.ico`
are the original favicons from `https://www.google.com/favicon.ico` and
`https://www.bing.com/favicon.ico`, downloaded unchanged on 13 November 2026.
They identify the named search services beside the public-CV benefit. They
do not represent an endorsement or a promised search listing. Google and
Microsoft retain their respective artwork rights; the marks are outside the
application's MIT license. Their hashes are in `website/brand-asset-sources.json`.

## Model Context Protocol artwork

`public/brands/mcp-original.svg` is the unchanged MCP project symbol supplied
by the official repository at
https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/docs/favicon.svg.
It identifies the MCP connection beside its name. It is not part of the
Tawdheef mark or an endorsement. Source and hash are recorded in
`website/mcp-brand-sources.json`. CLI uses an original functional terminal
symbol, rather than a claimed universal CLI brand logo.

## Founder portrait and additional provider artwork

`public/site-assets/people/ahmed-aldhraif.png` is Ahmed AlDhraif's supplied
official portrait, copied without altering its pixels for the founder byline.
It is not covered by the application code's MIT licence.

`public/brands/uae-pass-original.png` is the original UAE PASS fingerprint
artwork linked by Tabbio's official site at
https://www.tabbio.com/icons/uaepass-tabbio.png. It identifies Tabbio's UAE PASS
identity-verification option; its placement is not a certification of the
tracker or of CV contents.

`public/brands/tabbio-wordmark-original.svg` is Tabbio's original light-grey
footer wordmark, retained unmodified from
https://www.tabbio.com/marketing/footer/tabbio-footer-en.svg.

`public/brands/tabbio-wordmark-violet-original.svg` is the owner-supplied
`Tabbio_MainLogoEnglish-03.svg`, copied byte for byte. The Tabbio CV section
uses this complete English wordmark at its natural proportions and original
violet color. The separate Tabbio symbol remains available for compact links.
Source URLs and file hashes are recorded in `website/brand-asset-sources.json`.
The respective owners retain artwork rights.

## Tawdheef brand typography

The brand package includes Manrope and Noto Kufi Arabic variable fonts from
the official Google Fonts repository, downloaded on 13 November 2026.
Both are distributed under the SIL Open Font License 1.1. The complete
font-specific licences are bundled beside the fonts in `public/brand/fonts/`.
`sources.json` records local file hashes. Logo lettering is shaped and
outlined in the generated SVG masters; the app's working text retains the
installed platform font. The brand guide and marketing pages use local WOFF2
files without requesting a remote font service.

- Manrope: https://github.com/google/fonts/tree/main/ofl/manrope
- Noto Kufi Arabic: https://github.com/google/fonts/tree/main/ofl/notokufiarabic

Tawdheef's original mark is a vector refinement of the selected Arabic Grid
concept. It does not incorporate the Codex, GitHub or any other provider logo.
The optional Tabbio endorsement uses the original Tabbio mark listed below.

## Country flag SVGs

The 265 SVG files in `public/flags/` are copied unchanged from the optimized
`3x2` assets in **country-flag-icons 1.6.20** by @catamphetamine.

- Package: [country-flag-icons on npm](https://www.npmjs.com/package/country-flag-icons/v/1.6.20)
- Primary repository: [catamphetamine/country-flag-icons on GitLab](https://gitlab.com/catamphetamine/country-flag-icons)
- License: MIT. The original copyright and complete license text are retained
  in `public/flags/LICENSE.txt`.
- Source archive: `country-flag-icons-1.6.20.tgz`, obtained using `npm pack`.
- Archive SHA-1: `aa6f36104568993f9cd43e7da283f9b7d0a802cc`.

The flags are bundled with this app and load from the local server. No CDN or
external image request is required. The React wrapper in `src/Flag.jsx` is
original application code. Dependencies listed in `package.json` retain their
own licenses in their distributed packages.

## LinkedIn [in] brand mark

`public/brands/linkedin-original.ico` is LinkedIn's original favicon, downloaded
unchanged from `https://www.linkedin.com/favicon.ico` on 13 November 2026.
It is used at a small size beside Ahmed's name as a link to his LinkedIn profile.
The asset has no separate registration glyph. It remains LinkedIn artwork,
outside this project's MIT license, and makes no external request when displayed.

`public/brands/linkedin-in-blue.png` is the original, unchanged
`in-logo/LI-In-Bug.png` from LinkedIn's official [in] logo download. It is
635 × 540 pixels and includes its supplied registration mark. The app displays
it locally at a minimum 21-pixel height without recoloring or redrawing it.

- Brand owner: LinkedIn Corporation. The LinkedIn marks are not covered by this
  application's MIT license.
- Primary guidance: [LinkedIn [in] logo](https://brand.linkedin.com/in-logo).
- Download page: [LinkedIn brand downloads](https://brand.linkedin.com/downloads).
- Original archive: [official in-logo.zip](https://content.linkedin.com/content/dam/me/business/en-us/amp/xbu/linkedin-revised-brand-guidelines/logos/in-logo.zip).
- PNG SHA-256: `3c0149f26168b5fe0f43e68664abe40341a6443b3cd435d18a73e12f64f8b600`.

The mark identifies a link to a LinkedIn page. It does not indicate affiliation
with or endorsement by LinkedIn. The image is bundled with the app; displaying
it makes no request to LinkedIn or an external image service.

## Connection provider artwork

The following files were downloaded unchanged from provider-controlled sites
on 13 November 2026. They identify connection choices. No mark was traced,
generated, recolored or combined into this application's branding. Artwork and
trademarks remain the property of their respective owners and are **not**
licensed under the tracker's MIT license. Their availability on a public site
does not imply endorsement or a general license to modify the marks.

| Local file | Original provider URL | SHA-256 |
|---|---|---|
| `public/brands/gmail.png` | [Google product icon](https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png) | `a5cf5c35082aa506518402699c5c5bbc2416742904c60a8cdd81731a2b080bad` |
| `public/brands/google-calendar.png` | [Google product icon](https://www.gstatic.com/images/branding/product/2x/calendar_2020q4_48dp.png) | `c2a7600e39f41146589f8ff9111d6f756f94d0af6f83ec98ab6768c985bf7d3b` |
| `public/brands/outlook.svg` | [Microsoft FY26 Outlook icon](https://www.microsoft.com/content/dam/microsoft/bade/images/icons/en-us/m365-app-icons-fy26/Outlook-Icon-FY26.svg) | `d67b8bb4bb8d7afe8e71e066112452d5d681ea7991fa1ec7c37df962246b2c31` |
| `public/brands/apple-calendar.png` | [Apple iCloud page Calendar icon](https://www.apple.com/v/icloud/ak/images/overview/icon_calendar__dd9ecztq7hg2_large.png) | `bf4ce25bcb656e939027cf9424e2052dac82bcd8a28a0c11c51be028699eda9f` |
| `public/brands/tabbio.svg` | [Tabbio site favicon](https://www.tabbio.com/favicon.svg) | `76883c8b4de223d6e71b49ff86a520be504c7a898864a9d211b4458edb1d0733` |
| `public/brands/chatgpt.svg` | [OpenAI/ChatGPT static favicon](https://cdn.oaistatic.com/assets/favicon-l4nq08hd.svg) | `8f2de046d22cfecfe3917cf87ff1ce49a48d79956f6b18be3b37db29148a0aeb` |
| `public/brands/claude.svg` | [Claude site icon](https://claude.com/icon.svg) | `b150888bc7257af83e3b85d3c2be4294f88986026f8168f6c12fc1fde6697350` |
| `public/brands/claude-code.png` | [Claude Code documentation favicon](https://code.claude.com/docs/mintlify-assets/_mintlify/favicons/claude-code/pLsy-mRpNksna2sx/_generated/favicon/android-chrome-192x192.png) | `d4e5e8e9990ac52f147a74ae80b9e69cdc612264b84a76cdb5c43b53b73a1707` |

Microsoft's SVG was linked by its [Outlook product page](https://www.microsoft.com/en-us/microsoft-365/outlook/email-and-calendar-software-microsoft-outlook).
Apple's PNG was linked by its [iCloud page](https://www.apple.com/icloud/).
The Claude Code favicon was linked by its [official documentation](https://code.claude.com/docs/en/overview).
Google, Microsoft, Apple, Tabbio, OpenAI and Anthropic retain their respective
copyrights and trademark rights. Provider branding does not indicate an
affiliation with this tracker.

ChatGPT and Codex rows use the same original monochrome OpenAI Blossom asset
beside explicit product names. A distinct official Codex mark was not verified;
the app does not invent one. The SVG's supplied light/dark behavior is retained,
and the wrapper chooses its light-surface context without editing its paths.
See [OpenAI design guidelines](https://openai.com/brand/).

`src/ProviderLogo.jsx` is original application code. It renders local images
with intact proportions and accessible names; displaying them makes no remote
request. The Apple Calendar artwork contains its original sample date, not
today's date or an actual event indicator.
# Emil Kowalski agent skills

The 19 development skills in `.agents/skills` and `.claude/skills` come from [emilkowalski/skills](https://github.com/emilkowalski/skills), installed with the user-requested Skills CLI. They are MIT licensed, Copyright (c) 2026 Emil Kowalski. The full upstream license is preserved in `.agents/skills/UPSTREAM-LICENSE`; installed source paths and hashes are recorded in `skills-lock.json`. These Markdown development resources are not part of the browser bundle or background runtime.


## iCloud Mail artwork and protocol libraries

`public/brands/apple-mail.jpg` is unchanged Apple Mail artwork from [Apple's App Store listing](https://apps.apple.com/us/app/mail/id1108187098), retrieved through Apple's lookup API. SHA-256: `22fd6b78263f85f3f650d5c0de5cc3e5a862e065a1be8932b75e0ca0f50b8255`. Apple retains its trademark and artwork rights; this identifies the connection and does not imply endorsement.

iCloud Mail uses Nodemailer 10.5.0 (MIT-0), ImapFlow 2.11.0 (MIT) and PostalMime 4.2.1 (MIT-0). Dependencies are locked in package-lock.json and retain their package license files. No browser runtime library was added for this connection.

## ApplyMCP background pattern

`src/WorkspaceBackground.jsx` and `src/workspace-depth.css` adapt the user's ApplyMCP background pattern and floating surface treatment. The source template's dot/spotlight primitive carries Copyright (c) 2024 Mohammed Arham Khan, MIT licensed; the complete notice is retained in `docs/licenses/background-pattern-MIT.txt`. This adaptation uses no additional runtime package. Pointer highlighting is decorative, stops when idle, and is disabled for touch and reduced motion.
