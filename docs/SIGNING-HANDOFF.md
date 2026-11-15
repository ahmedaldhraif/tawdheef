# Publisher signing handoff

Tawdheef stays local first. Signing identifies the publisher of a downloaded app;
it does not host your tracker, connect your mailbox or give Tawdheef another agent.
Local use and source builds need no Apple Developer account or Windows signing
service. Ordinary users never need publisher accounts. Unsigned candidates can
be prepared and tested now; buying or choosing a signing service can wait.

Private tracking, preferences and client connections are independent of these
release credentials. Codex or Claude Code continues to own its external tools
and sign-in.

## If you want a signed Mac download

The current workflow needs an active Apple Developer Program membership and a
**Developer ID Application** signing identity with its private key. A free Apple
login or downloaded `.cer` alone is insufficient. The Account Holder creates
this certificate from a certificate signing request, imports it on the computer
that holds the matching private key, then exports a password-protected `.p12`.
This ZIP/app distribution does not need a Developer ID Installer certificate.
See [Apple's Developer ID instructions](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/).

Notarization is a separate Apple check after signing. This workflow uses a
dedicated App Store Connect **team API key**: `.p8`, Key ID and Issuer ID.
Account Holder/Admin access is needed to generate a team key; that is separate
from the access role assigned to the key. Do not assume an Admin-scoped key is
required. Validate the chosen key's notarization access before a release.
Apple's current API documentation says individual API keys cannot use
`notaryTool`. See [API access and team keys](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/)
and [Apple's API-key documentation](https://developer.apple.com/documentation/AppStoreConnectAPI/creating-api-keys-for-app-store-connect-api).

Enter the following values directly into the GitHub Actions secrets referenced
by the [signing workflow](../.github/workflows/sign-desktop.yml). Never paste the
private files, passwords or encoded contents into chat, issues, source or logs.

| Secret name | Value |
| --- | --- |
| `MACOS_CERTIFICATE_P12_BASE64` | Base64 of the `.p12`, including its private key |
| `MACOS_CERTIFICATE_PASSWORD` | That `.p12` export password |
| `MACOS_SIGN_IDENTITY` | Full `Developer ID Application: … (TEAM_ID)` identity |
| `APPLE_NOTARY_KEY_BASE64` | Base64 of the team API `.p8` |
| `APPLE_NOTARY_KEY_ID` | That key's Key ID |
| `APPLE_NOTARY_ISSUER_ID` | Its Issuer ID, not the certificate's Team ID |

Base64 is encoding, not encryption. The workflow's temporary credentials must
stay out of the app and release assets. With credentials present, the manual
Mac signing job builds Intel and Apple Silicon candidates, requires accepted
notarization, staples the ticket, checks Gatekeeper and smoke-tests the exact
archive. It does not publish automatically. Actual success receipts are required;
account ownership or fixture tests do not establish signing readiness.

Run **Sign verified desktop download** with the reviewed version `tag`, its full
40-character `source-commit`, and `platform: macos`. The source commit must match
the tag exactly. Use `windows` for its two architectures, or `all` for all four
Windows/Mac targets when both publisher identities are configured. No Windows
credentials are needed for a Mac-only run.

The artifacts are named `signed-desktop-darwin-arm64`,
`signed-desktop-darwin-x64`, `signed-desktop-win32-x64` and
`signed-desktop-win32-arm64`, as selected. Each contains its ZIP, source-pinned
package report, checksums and exact-archive smoke receipt. A separate signing
run does not update an existing unsigned draft. Assemble a fresh candidate with
`collect-desktop-release.mjs --signing required`, the same source SHA and the two
matching Linux artifacts, following [release preparation](RELEASE.md#prepare-desktop-downloads).
The collector requires platform signing for Windows/Mac and notarization for
Mac; Linux keeps checksum verification. Review the concrete draft before public
publication.

## If you want a signed Windows download

First identify whether the publisher is an individual or company and its legal
country. This determines which public signing services are available; there is
no need to purchase anything for local use.

The implemented Windows route currently supports an existing exportable public
code-signing identity using `WINDOWS_CERTIFICATE_PFX_BASE64`,
`WINDOWS_CERTIFICATE_PASSWORD` and `WINDOWS_CERT_SHA1`. The PFX must include the
private key. Do not buy a new certificate assuming it will provide a PFX: modern
CA products commonly hold keys in hardware or a managed signing service.

Microsoft Artifact Signing and CA cloud/HSM services are possible publisher
routes, but their service integration is not implemented by this PFX workflow.
Eligibility must be checked before choosing one. Microsoft's current
[Artifact Signing quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
limits public-trust individual enrollment to the US/Canada and lists supported
organization countries. Do not infer legal eligibility from the app's location
or a publisher's current time zone.

A normal trusted Windows signature identifies the publisher and protects signed
file integrity; it does not guarantee that a new download avoids every
SmartScreen warning. Reputation builds separately. Self-signed certificates do
not establish public publisher trust. See [Microsoft's signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options).

Only a verified, timestamped signed executable and its exact-archive smoke
receipt should be described as signed. The current Windows ZIP is not a sealed
app bundle or signed installer. Publishing remains a separate release step.

See [the desktop release guide](DESKTOP-RELEASE.md) for the existing commands and
verification boundary, and [GitHub's secret-entry guide](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
for secure provisioning when you decide to sign.
