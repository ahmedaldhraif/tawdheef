# Security and private reporting

Tawdheef is a local, single-user application. The web server binds to loopback. It is not designed as a public multi-user server. Do not expose it through a public tunnel for ordinary use.

Native mode is the default. Your actual Codex or Claude Code client owns provider credentials, sign-in, browser sessions and password-manager access; Tawdheef does not request or store those secrets in Native mode. Client-reported connection metadata is not independent authentication proof. Keep the client's and provider's approvals and restrictions intact.

Private tracker records, account/source metadata, send plans, receipts, observations, reports and optional user-selected original CV files remain on your computer. Source checkouts normally use `.local/`; native packages use per-user app data, with existing portable data or an explicit `APPLY_TRACKER_DATA` override supported. Explicit `local-adapters` compatibility mode can also store provider credentials and cached responses there. Project setup backups under `.tawdheef-setup/` are private too. The tracker does not encrypt these files; protect your operating-system account, filesystem and backups and exclude them from Git/releases.

Local storage does not mean all processing stays on your device. The actual AI client, model services and connected providers can receive authorized prompts, tool results, CV facts, messages and files under their own terms and account settings. Default Native mode does not create another app-owned provider session; explicit compatibility adapters make their own authorized online requests.

## Report a vulnerability privately

Do not post exploit details, real CVs, OAuth files, tokens, email bodies or private database exports in public issues.

1. Open the project's GitHub repository, choose **Security**, then **Report a vulnerability** if private vulnerability reporting is enabled. This sends a private report through GitHub; an option described here is not proof that the feature is currently enabled.
2. Include the affected version, a short description, potential impact and reproduction steps using synthetic accounts/data. Remove credentials and unrelated private information. Do not test against another person's account or a provider without its authorisation.
3. If that option is unavailable, ask the maintainer for a private reporting route with a brief message containing no exploit or sensitive details. A public issue is not a confidential channel. Do not send security reports about this project to Tabbio merely because the app integrates with its CV service.

For a leaked credential, revoke it through the provider and secure your local files; removing a public attachment does not revoke the credential or remove every copy. For sensitive directory-data exposure or rights concerns, use the same private-route approach rather than reposting the material.

Ahmed AlDhraif personally maintains this project. No dedicated security team, private inbox, bounty, confidentiality agreement, fixed response time or resolution deadline is promised. The maintainer will assess reports as available and may use GitHub's advisory process for coordinated fixes. Do not assume a reported issue has been reviewed or resolved until that is confirmed.

Report ordinary bugs with synthetic examples through the bug issue form. See the [privacy disclosure](docs/policies/PRIVACY.md) and [directory-data policy](docs/policies/DATA.md).

Release checks inspect allowed paths and common credential patterns; they are not a security certification. See `docs/RELEASE.md` for maintainer checks. Keep server-side run authority, idempotency and provider consent intact when contributing.

GitHub's [private vulnerability reporting documentation](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository) describes the platform feature. Project policies do not replace provider approval requirements or the MIT licence.
