# Privacy

This explains the supplied local app and static website. A fork, host, AI client or connected provider may handle data differently. Tawdheef is personally maintained by Ahmed AlDhraif; it is not a Tabbio-operated service.

## On your computer

Native mode is the default. Your actual Codex or Claude Code client owns its Tabbio/CV, email, calendar, browser/computer and password-manager connections. Tawdheef does not request or store those providers' passwords, OAuth tokens, session cookies or vault contents in Native mode. Sign-in, consent and access restrictions stay with the client and provider. Client-reported availability is not independent proof of account access.

Tawdheef keeps local tracking records, dated connection metadata, selected source/account identifiers, Run scope, send plans, receipts, monitoring observations and reports. A saved email plan includes its recipient, subject, body and attachment references; notes and observations may also contain personal information. Source checkouts normally use `.local/`; native app packages use a per-user data directory, with existing portable data or an explicit `APPLY_TRACKER_DATA` override supported. The tracker does not encrypt these files. Protect your operating-system account, filesystem and backups.

You may optionally select an original PDF or DOCX. Tawdheef then stores the exact file privately and stages a separate local browser-upload copy for an authorized Run. This is optional local storage, not a provider connection, a generated CV, content verification or a malware-disarming service. The actual client performs any authorized upload or sharing; selecting the file alone does not share it.

Explicit `local-adapters` compatibility mode can instead keep provider credentials, OAuth sessions and cached CV/message responses in the private data directory. Those preserved legacy files are not inspected by Native bootstrap. Project-only assistant setup can also create private configuration backups under `.tawdheef-setup/`; keep these, client settings and all private data out of Git and public downloads.

The browser can store local display preferences such as the chosen directory, filters and columns. The server is intended for one user on loopback, not a publicly exposed multi-user service.

You control local retention through the app's available record controls and your own files/backups. Changing or removing a tracker connection report does not disconnect the actual client's account. Disconnect or revoke access through that client and the provider's account controls; removing a compatibility connection locally does not necessarily revoke its token either. Removing local files does not recall messages already sent, uploads, downloaded copies or other people's backups.

## Connected services

Your authorised AI client, its model service, Tabbio, email/calendar providers and careers websites may be online services. Tool results, prompts, CV facts, message contents or uploaded files can leave your computer through the client or provider when you use their features. They handle that data under their own terms, account settings and privacy policies; this repository does not control their hosting, retention or model processing. Native mode does not route these external connections through a second Tawdheef provider client. Explicit compatibility adapters make their own authorized provider requests.

Keep provider consent and approval requirements intact. Read the account and scope shown before connecting. The app's local storage does not mean that connected AI or provider processing stays on your device.

## Public website and GitHub

The supplied static website includes no visitor-analytics library, tracking pixel or first-party marketing-cookie code. Some outbound Tabbio links contain readable referral parameters, which the destination can receive. Hosting, CDN and GitHub request logs may include information such as IP addresses; deployment-specific logging and retention are not established by this repository and must be reviewed by whoever operates the site.

GitHub issues, pull requests, attachments and commit history are public when posted to the public repository and may be indexed or copied. Use synthetic examples. Do not post CVs, private contacts, mailbox contents, tracking databases, credentials, tokens or private account configuration.

For a public directory correction, use a **Directory data** issue with the minimum public record ID and source information. For a sensitive exposure, follow [SECURITY.md](../../SECURITY.md). Do not repeat the exposed information in another public issue. Removing something from the project does not guarantee removal from Git history, forks, caches or search results.

This disclosure is a [project-policy draft](PROJECT.md#draft-status-and-sources). It does not describe a separate hosted tracker account, guarantee confidentiality, or replace a host's or provider's privacy notice.
