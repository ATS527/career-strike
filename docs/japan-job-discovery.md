# Japan job discovery

Career Strike uses employer-direct public ATS feeds before it considers a marketplace. This keeps
provenance, application links and freshness evidence intact, without bypassing logins, CAPTCHAs
or platform access controls.

When the Opportunities market filter is set to Japan, the dashboard also provides official-site
launchers for the reviewed marketplaces. The typed search phrase is passed directly to LinkedIn or
Indeed only in the new browser tab; Career Strike does not retrieve those results. For other
providers the launcher opens the official site, where the candidate searches directly.

## Reviewed employer-direct targets

These identities and board slugs were cross-checked on 2026-11-01 against the employer's official
careers site and its public ATS board. They are eligible for live certification, but are **not**
live integrations until `verify-market` has successfully retrieved an explicitly Japanese posting.

| Employer  | Official careers site                        | Public board                                             | Target id      |
| --------- | -------------------------------------------- | -------------------------------------------------------- | -------------- |
| OpenAI    | [Careers](https://openai.com/careers)        | [Ashby](https://jobs.ashbyhq.com/openai)                 | `openai-jp`    |
| Anthropic | [Careers](https://www.anthropic.com/careers) | [Greenhouse](https://job-boards.greenhouse.io/anthropic) | `anthropic-jp` |
| New Relic | [Careers](https://newrelic.com/careers)      | [Greenhouse](https://job-boards.greenhouse.io/newrelic)  | `newrelic-jp`  |
| Figma     | [Careers](https://www.figma.com/careers/)    | [Greenhouse](https://job-boards.greenhouse.io/figma)     | `figma-jp`     |

On the review date the public board APIs returned complete listings with Japan-located postings
for all four employers (OpenAI 29, Anthropic 16, New Relic 12, Figma 3). Each of those postings
reads "Tokyo, Japan". New Relic's and Figma's careers pages link their Greenhouse boards directly,
Anthropic's careers page lists the same Greenhouse postings, and OpenAI's careers site links its
Ashby board.

Use a networked local installation to certify exactly one target:

    career-strike verify-market JP --target openai-jp

The command calls the existing guarded public ATS adapter. It saves jobs and begins monitoring only
after the source returns a complete listing with at least one explicit Japan location. A timeout,
rate limit, invalid response or a listing without Japan evidence leaves the country configured and
saves nothing.

## Marketplace policy

| Source                                                                  | Current capability      | Career Strike behaviour                                                                                 |
| ----------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| [Hello Work](https://www.hellowork.go.jp/)                              | `USER_DRIVEN_DISCOVERY` | Open the official public employment service (Japanese-language); no automated job retrieval is claimed. |
| [GaijinPot Jobs](https://gaijinpot.com/)                                | `USER_DRIVEN_DISCOVERY` | Open the official bilingual jobs board and search directly.                                             |
| [LinkedIn Jobs](https://www.linkedin.com/legal/jobs-terms-conditions)   | `RESTRICTED`            | No scraping or automated extraction; use the official site or a user-supplied listing.                  |
| [Indeed Japan](https://docs.indeed.com/legal-terms/developer-agreement) | `UNVERIFIED`            | No integration until approved partner access and permitted display/reuse are confirmed.                 |
| Daijob                                                                  | `UNVERIFIED`            | No automated retrieval; open the official site or add a verified official listing manually.             |

The `UNVERIFIED` label means Career Strike has no recorded approved access; it does not imply a
source is prohibited. A source can move only after its official access model, terms, fields,
display/reuse rights, limits and live retrieval have been reviewed.

## Candidate workflow

1. Start with the monitored employer-direct roles, filtering for freshness and fit.
2. Use Hello Work, GaijinPot and other marketplaces in the browser for broader user-driven
   discovery.
3. Add only the official employer application link when recording a manually discovered job.
   Career Strike stores it as unverified until an authorised source confirms it.
4. Treat remote, sponsorship and work authorisation as unknown unless the employer explicitly
   states them. In particular, a "Remote - Tokyo" posting is a Japan role, not a globally remote
   one, and employment in Japan usually depends on an employer-sponsored work visa. Many Japan
   roles list location only in Japanese script; Career Strike's deterministic parser does not read
   Japanese locations, so those listings stay out of the market filter.
