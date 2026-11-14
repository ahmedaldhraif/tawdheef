# Tawdheef open-source growth plan

Reviewed 14 November 2026. This compares ten established developer-product repositories and their own sites. It is a selected sample, not a ranking of every repository. Observed patterns inform the recommendations below; public pages and stars do not establish conversion rates.

## What we can learn

| Reference | Observed pattern | Apply to Tawdheef |
| --- | --- | --- |
| [Supabase](https://github.com/supabase/supabase/blob/master/README.md) | Product explanation, real screenshot and distinct hosted, local and documentation paths. | Give visitors clear starting points for public research, app setup and contribution. |
| [PostHog](https://github.com/PostHog/posthog/blob/master/README.md) | Short navigation plus a dedicated agent entry with setup and readable references. | Connect our existing skill, CLI/MCP guide, public data catalog and tool schemas. |
| [Cal.diy](https://github.com/calcom/cal.diy) and [Cal.com's free tools](https://cal.com/calendar-tools) | Explicit community/commercial boundaries; useful tools lead to a relevant product action. | Offer useful company data first, then introduce the separate Tabbio CV when personal matching helps. |
| [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy/blob/main/README.md) and [templates](https://appflowy.com/templates) | Downloads are distinct from development; reusable resources have previews and real creators. | Keep pack previews, dates, download/import steps and genuine contributor credit together. |
| [Dub Links](https://github.com/dubinc/dub.link) | Outcome-led introduction, self-hosting and contribution paths. | Separate visits, downloads, readiness and useful outcomes. Verify that public contribution links actually work. |
| [n8n](https://github.com/n8n-io/n8n/blob/master/README.md) and [workflows](https://n8n.io/workflows/) | A useful library organized by task and integration, with submission routes. | Treat packs and practical research examples as the resource library; reuse our contribution forms. |
| [Firecrawl](https://github.com/firecrawl/firecrawl/blob/main/README.md) and [skills](https://github.com/firecrawl/skills) | Runnable examples and distinct Skill, CLI and MCP routes. | Explain what each existing entry installs or exposes; give one useful first task. |
| [Dify](https://github.com/langgenius/dify/blob/main/README.md) | Language links and explicit deployment/docs routes. | Maintain reciprocal English/Arabic examples and link the canonical setup guides. |
| [Ollama](https://github.com/ollama/ollama/blob/main/README.md) and [library](https://ollama.com/library) | Short first-use instructions; catalog details lead to a concrete next action. | A country pack should lead directly to research or a reviewed import. |
| [uv](https://github.com/astral-sh/uv/blob/main/README.md) and [task guides](https://docs.astral.sh/uv/guides/) | Realistic examples, task-specific guidance and reproducible evidence behind claims. | Show a source-backed first result and link claims to pack evidence rather than unsupported rankings. |

Cal.com's former repository now leads to Cal.diy, and Dub's former repository leads to Dub Links. Public presentation and permissions can change; check actual destinations before copying a pattern. These references also have different licences: n8n describes itself as source-available/fair-code, and Dify has additional licence conditions. They are distribution references, not evidence that every sampled product shares Tawdheef's MIT licence. No third-party code, branding or prose is copied here.

## Our useful resource is already here

The [country packs](../../directories/README.md) are free, ungated research resources. Someone can use them before installing Tawdheef or creating a CV account. Keep the dates, source roles, original evidence and missing information visible. A company record is not a vacancy, verified employer, endorsement or tested application route.

The new [public research example](../examples/README.md) gives that data a concrete first task. The optional [job-search brief](../examples/job-search-brief.md) helps people name their preferences without writing code. Both have Arabic counterparts. Completed briefs belong in private notes, not the repository.

```text
Country search, recommendation or GitHub
  -> public directory and one useful research result
  -> personal CV matching becomes useful
  -> local app setup and create/connect Tabbio CV
  -> reviewed shortlist
  -> explicitly chosen Run and real tracked outcomes

A missing detail
  -> contextual contribution form
  -> review and merged source
  -> published pack update
  -> download and preview import
```

The direct app-setup path stays available for people already ready to use it. Installing the skill alone does not install the app or connect accounts. Importing a pack does not start a run. Use the [canonical setup guide](../guides/use-the-skill.md) and runtime capabilities instead of duplicating operating instructions.

## Implemented in this pass

- README starting-point choices for public research, app setup and contribution.
- One copyable public-data research task and a private, fillable job-search brief in English and Arabic.
- Links from the directory and guide indexes and the existing `llms.txt` navigation aid.
- Corrected planning metadata: `/skills/` remains the overview for one skill and eight task guides. Legacy setup/detail routes redirect to the canonical setup article.
- This source-backed plan and an updated product-marketing context. Release links still read the existing published target; no platform release is promoted by this work.

## Next priorities

1. **Make the public website reachable.** Deploy only the static `site-dist` output. Verify HTTPS, canonical URLs, redirects, assets and production `robots.txt` on the real domain. The local tracker's blocking robots file and loopback server are separate. Add the working domain to GitHub About only after verifying it.
2. **Verify discovery.** Use Google Search Console and Bing Webmaster Tools for the deployed domain, submit the real sitemap and inspect representative English, Arabic, Skills and country URLs. [Google's AI guidance](https://developers.google.com/search/docs/appearance/ai-features) requires normal search eligibility, useful textual content and crawlable links; it requires no special AI file or schema. [Bing's guidance](https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a) likewise emphasizes discovery, canonical URLs, useful content and accurate freshness signals. IndexNow is a post-deployment update-notification option, not proof of indexing.
3. **Publish original, useful country guidance.** Use actual questions and source-backed research, such as finding an official careers page or distinguishing an employer from a portal. Link the relevant pack and research task. Validate demand and maintain the content before expanding it. Current company pages should use directory/Dataset semantics; `JobPosting` needs an actual eligible vacancy. Do not create thousands of near-identical company or location pages.
4. **Give people a reason to return.** When a pack is actually published, list its version, changed records, source check dates and linked merged contributions. Credit the real contributor handle/PR. Link GitHub Releases for updates; a star is not a release subscription. A merged correction and a released download are different events.
5. **Make the first contribution small.** Publish bounded starter tasks only for real identified work, with the source, expected result and checks. Keep the existing code, bug, feature and data forms. Do not invent an empty backlog or another community channel.
6. **Test one conversion change at a time.** Start with whether people can find a useful pack and understand setup. Introduce Tabbio when they want to compare companies with their actual CV. Keep the free CV path and separate provider costs clear. Only add an optional update email if someone owns the consent, delivery and publishing process; keep downloads usable without it.

GitHub's [README guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes) favors explaining usefulness, getting started, help and maintenance. [Topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics) help people discover relevant repositories. Keep topics accurate and the social preview current, rather than adding keyword lists to prose.

## Measure useful progress

No live funnel baseline is established. The website currently has no first-party analytics script. This plan adds none.

| Stage | Useful evidence if available | Do not equate it with |
| --- | --- | --- |
| Discovery | Search impressions/index status; aggregate GitHub views and referring sources | Installs or users |
| Resource use | Pack asset downloads and genuine data feedback | Unique people or app activation |
| Local activation | Local tracker tool use is observed; the actual client checks its real CV/tools and records fresh, dated connection reports | Independent provider verification or a confirmed application |
| First value | A person reviews useful company leads or a CV-informed shortlist | A sent message or submission |
| Tabbio | A tagged visit; signup or completed CV only if independently attributable | One another |
| Contribution | Reviewed/merged public source changes; later published pack notes | An automatically updated local tracker |

GitHub aggregates can inform resource interest. Tabbio UTM links identify the source of a visit but do not by themselves prove signup or CV completion. Keep CV contents, mailbox data, employer targets and private tracking out of measurement. Any future local activation measurement needs a deliberate opt-in design.

## Files that matter

Maintain the existing README, guides, `AGENTS.md`, skill, catalog/index/manifest JSON, generated tool schemas, sitemap, structured data and `llms.txt`. The latter is a convenience map, not an authority grant or ranking guarantee. Keep technical SEO checks and source validation in the existing build workflow. A new `agent.md`, prompt library, badge wall, AI-only content copy or machine-readable marketing file is unnecessary unless a real client needs it.

The growth strategy is a recommendation based on observed patterns. It does not establish deployment, search ranking, AI citations, adoption, CV creation or conversion improvement. The installed runtime and actually published assets remain authoritative for capabilities and downloads.
