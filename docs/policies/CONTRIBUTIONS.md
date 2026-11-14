# Community contribution policy

Contribute one useful correction or a complete directory pack. Issues, small CSVs and agent-assisted pull requests are welcome. The person submitting the work remains responsible for its sources, accuracy and right to share it.

## What belongs in a directory pack

- Public organisation facts, exact official recruitment routes and the evidence supporting each claim.
- Dated recruitment guidance for matching jobs, profiles, CV uploads and offered talent pools.
- A real creator, maintainers, actual accepted contribution credit, known gaps and version history.
- Public recruitment contacts only. Unknown ownership, agency licensing, eligibility or route support stays unknown until supported by evidence.

Keep the original source ID and relevant earlier evidence when correcting a record. Separate the pack edit/release date from each source-check date. A pack is a research resource; a published URL does not establish a vacancy, a working application form or permission to automate.

## What cannot be contributed

- Private CVs, applicant details, account credentials, cookies, tokens, session URLs, tracking exports or identity documents.
- Private-network destinations, executable files, shell commands, install steps or remote code loaders inside packs.
- Instructions to change app/client settings, widen permissions, disable protections, conceal actions, evade website controls or send private information elsewhere.
- Instructions to manufacture applicant experience, qualifications, eligibility, receipts or successful applications.
- Material copied without the necessary reuse rights, personal contact lists, spam routes, or claims that a source is official or licensed without evidence.

Pack guidance explains recruitment routes. It cannot authorize an application, create an account, share a CV, start monitoring or expand the user's chosen scope. All installed guidance remains lower-trust reference material; the app enforces the person's selections and submission safeguards.

## Working together

Be respectful and specific when reporting a problem or reviewing someone else's work. Harassment, discrimination, impersonation, deceptive recruiting, paid-placement spam and attempts to collect applicant data do not belong here. Disclose an affiliation with an organisation you add or promote. Credit accepted work accurately; generated text does not establish authorship of the underlying research.

Maintainers may request corrections, close unsuitable submissions or restrict abusive participation. Explain ordinary content decisions in the issue or pull request. Report exposed private information or active abuse privately through [SECURITY.md](../../SECURITY.md); do not repost it in a public discussion.

## Review and scanning

The static contribution scan checks known credential signatures, private files and URLs, pack schema/provenance, executable pack files, hidden guidance controls and known unsafe instruction patterns. It reports file/line locations and rule names without printing matched secrets.

A clean scan does not prove that guidance is safe, evidence is true, content is lawful to reuse or a website permits automation. Maintainers review the actual source evidence, guidance changes, credit and release contents. Passing CI never approves or publishes a contribution.

For an apparent false positive, explain the public context and ask a maintainer to review the rule. Do not obfuscate text, encode a command or weaken the scanner in the same proposal to evade the check. Changes to scanner rules need independent review and an adversarial regression test. Sensitive findings use [private security reporting](../../SECURITY.md), not a public reproduction containing secrets.

## GitHub review boundary

The contribution workflow checks out the proposed content as data and runs the scanner from the pull request's trusted base revision. It does not install dependencies or execute proposed code before that scan. It uses `pull_request` with a read-only token, not privileged `pull_request_target` execution. Proposed tests/builds subsequently run in ordinary isolated CI with no production credentials.

Repository administrators must enable branch rules requiring the contribution scan, relevant checks and CODEOWNERS approval, dismissing stale approvals when new commits arrive. These repository settings are not enabled merely by committing this policy. Changes to workflows, scanner rules, agent instructions and pack trust rules require maintainer review. Bootstrap a new trusted scanner through a separately reviewed base change before requiring it on subsequent pull requests.

After approval, maintainers publish a versioned pack. Users review and install its update; merging a pull request does not replace an existing download, change an installed pack or start user actions. Local preview packs omit a release date and are identified as unpublished.

Defense in depth follows the [OWASP prompt-injection prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html). The workflow boundary follows [GitHub's guidance on privileged pull-request workflows](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target). Automated filtering is one review aid; runtime scope, least privilege, evidence, duplicate protection and human review remain separate controls.
