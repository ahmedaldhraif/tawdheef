# One fictional record, explained

This example uses the reserved `example.org` domain. It is a teaching example, not a researched organisation. Do not add it to a real pack or claim its dates/routes were checked.

```json
{
  "id": "sample-stable-id",
  "name": "Fictional Example Organisation",
  "sourceRole": "Unresolved source lead",
  "routeStatus": "Recruitment route unknown",
  "checkedAt": "2026-01-01",
  "website": "https://example.org/",
  "careersUrl": "",
  "email": "",
  "sourceFields": {
    "evidenceUrls": ["https://example.org/"],
    "fieldEvidence": { "website": { "url": "https://example.org/", "observation": "Fictional example only" } },
    "missingDataNotes": ["Careers, email and profile registration are unknown"],
    "licenseNotes": "Fictional teaching example",
    "recruitment": {
      "jobsUrl": "",
      "profileUrl": "",
      "cvUploadUrl": "",
      "talentPoolUrl": "",
      "capabilities": { "profileCreation": "unknown", "cvUpload": "unknown", "talentPool": "unknown" },
      "notes": []
    }
  }
}
```

Use the real organisation's public source for each fact. `sourceRole` describes what the record represents: employer, agency, portal, programme or unresolved lead. `routeStatus` describes the recruitment route, not an application result. `checkedAt` is when the source was actually checked. `fieldEvidence` links each contact/route claim to its public source. Unknown optional fields stay blank; a blank field is not permission to invent it.

Use `supported` only when the offered route is observed and evidenced, `unavailable` when the relevant source establishes it is unavailable, and `unknown` when not established. A blocked page cannot establish that a job or profile route does not exist.
