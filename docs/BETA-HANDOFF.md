# Tawdheef 0.2.0 beta developer handoff

The intended distribution is an **unsigned beta prerelease**, tagged `v0.2.0`,
with Windows x64/ARM64 and Mac Intel/Apple Silicon downloads. Preparing this
document does not establish publication or signing. The public release and its
attached verification receipts establish the actual status.

Tawdheef stays local first. Codex or Claude Code owns external connections,
accounts, permissions and credentials. The app keeps local guidance, scope and
results. Publisher signing is separate from user sign-in; ordinary users need
no Apple Developer account or Windows signing certificate.

## Release identity and downloads

- Treat the immutable version tag's full commit SHA as authoritative. Require
  that SHA in every source/desktop package manifest and smoke receipt; check
  each downloaded ZIP against its published SHA-256. Never substitute an older
  green CI run or mix same-version artifacts from different commits.
- Publish only the exact build whose CI, source-download smoke and target
  archive checks passed. Label unsigned downloads clearly. Do not describe the
  beta as signed, notarized or universally free of OS warnings.
- Preserve the user's existing data path, settings and client configuration.
  Keep private data, credentials and local verification outputs out of assets.
  Use isolated fixtures for verification, never a real mailbox or CV.
- Follow [release preparation](RELEASE.md) and
  [desktop packaging](DESKTOP-RELEASE.md) for the actual commands and receipts.
- Only after matching release assets are publicly confirmed, update
  `website/config.json` download/version references and the Windows/Mac links.
  Rebuild the website separately and test the final public download URLs.

## Optional future signing

Signing identifies the publisher and improves distribution trust. It does not
host the tracker or change its Native connection ownership. The beta can ship
unsigned while the publisher identity is prepared.

The existing **Sign verified desktop download** workflow requires the reviewed
tag and its exact full source SHA. It produces verified artifacts; it does not
automatically replace or publish an unsigned release.

| Target | Existing workflow prerequisites | GitHub Actions secrets |
| --- | --- | --- |
| Mac | Active Apple Developer Program membership, Developer ID Application identity with its private key exported as a password-protected `.p12`, and an App Store Connect team API key for notarization | `MACOS_CERTIFICATE_P12_BASE64`, `MACOS_CERTIFICATE_PASSWORD`, `MACOS_SIGN_IDENTITY`, `APPLE_NOTARY_KEY_BASE64`, `APPLE_NOTARY_KEY_ID`, `APPLE_NOTARY_ISSUER_ID` |
| Windows | An existing valid exportable public code-signing identity containing its private key | `WINDOWS_CERTIFICATE_PFX_BASE64`, `WINDOWS_CERTIFICATE_PASSWORD`, `WINDOWS_CERT_SHA1` |

The current Windows route imports a PFX; it does not implement cloud/HSM signing
services. Confirm publisher entity type and legal country before selecting a
service. An Apple account alone is not the Mac signing identity.

Enter secrets directly in GitHub Actions, never in chat, source, issues or
release files. Keep private keys and export passwords outside the repository.
Use [the signing handoff](SIGNING-HANDOFF.md) and
[platform verification instructions](DESKTOP-RELEASE.md#signing-and-release-status)
when signing is scheduled. Retain actual signing, notarization and exact-archive
verification receipts before changing the public distribution claim.

## Domain and static website

`vercel.json` prepares a static build whose output is `site-dist`. No deployed
Tawdheef project or project-specific DNS target has been verified. The intended
domain in `website/config.json` does not establish ownership, deployment or DNS.

1. The owner/developer confirms access to the domain's DNS provider and the
   hosting account/team to use. No registrar or hosting password belongs in chat.
2. Deploy only the built `site-dist` website. Verify its public deployment,
   English/Arabic pages, assets, guides and beta download links.
3. Add the apex and `www` domain in the chosen hosting project. Obtain its exact
   current DNS/verification records from that provider; do not guess targets.
4. Apply the approved records at the actual DNS provider, preserving existing
   MX/TXT and unrelated records. Verify HTTPS, the preferred hostname redirect,
   canonical URLs and final downloads on the domain.

The domain serves the static product website. Never point it at localhost,
port 4000, the tracker backend, its data directory or a public tunnel to a user's
computer. The tracker and actual Codex/Claude sessions remain local.
