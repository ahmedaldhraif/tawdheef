# Privacy

This explains the supplied local app and static website. A fork, host, AI client or connected provider may handle data differently. Tawdheef is personally maintained by Ahmed AlDhraif; it is not a Tabbio-operated service.

## On your computer

Tracking records, connection details, provider credentials and cached responses are kept under `.local/` or the directory selected with `APPLY_TRACKER_DATA`. This can include CV information, relevant application messages, notes, receipts and reports. The tracker does not encrypt these files. Protect your operating-system account, filesystem and backups.

The browser can store local display preferences such as the chosen directory, filters and columns. The server is intended for one user on loopback, not a publicly exposed multi-user service.

You control local retention through the app's available record and connection controls and your own files/backups. Disconnecting locally does not necessarily revoke a provider's token; use that provider's account controls too. Removing local files does not recall messages already sent, downloaded copies or other people's backups.

## Connected services

Your authorised AI client, Tabbio, email/calendar providers and careers websites are online services. They receive the information needed for actions you authorise and handle it under their own terms and privacy policies. Their hosting, retention, model processing and account settings are not controlled by this repository.

Keep provider consent and approval requirements intact. Read the account and scope shown before connecting. The app's local storage does not mean that connected AI or provider processing stays on your device.

## Public website and GitHub

The supplied static website includes no visitor-analytics library, tracking pixel or first-party marketing-cookie code. Some outbound Tabbio links contain readable referral parameters, which the destination can receive. Hosting, CDN and GitHub request logs may include information such as IP addresses; deployment-specific logging and retention are not established by this repository and must be reviewed by whoever operates the site.

GitHub issues, pull requests, attachments and commit history are public when posted to the public repository and may be indexed or copied. Use synthetic examples. Do not post CVs, private contacts, mailbox contents, tracking databases, credentials, tokens or private account configuration.

For a public directory correction, use a **Directory data** issue with the minimum public record ID and source information. For a sensitive exposure, follow [SECURITY.md](../../SECURITY.md). Do not repeat the exposed information in another public issue. Removing something from the project does not guarantee removal from Git history, forks, caches or search results.

This disclosure is a [project-policy draft](PROJECT.md#draft-status-and-sources). It does not describe a separate hosted tracker account, guarantee confidentiality, or replace a host's or provider's privacy notice.
