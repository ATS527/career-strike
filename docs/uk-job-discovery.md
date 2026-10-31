# United Kingdom job discovery

Career Strike uses employer-direct public ATS feeds before it considers a marketplace. This keeps
provenance, application links and freshness evidence intact, without bypassing logins, CAPTCHAs
or platform access controls.

When the Opportunities market filter is set to United Kingdom, the dashboard also provides
official-site launchers for the reviewed marketplaces. The typed search phrase is passed directly
to LinkedIn or Indeed only in the new browser tab; Career Strike does not retrieve those results.
For other providers the launcher opens the official site, where the candidate searches directly.

## Reviewed employer-direct targets

These identities and board slugs were cross-checked on 2026-11-01 against the employer's official
careers site and its public ATS board. They are eligible for live certification, but are **not**
live integrations until `verify-market` has successfully retrieved an explicitly British posting.

| Employer | Official careers site | Public board | Target id |
| --- | --- | --- | --- |
| Monzo | [Careers](https://monzo.com/careers) | [Greenhouse](https://job-boards.greenhouse.io/monzo) | `monzo-gb` |
| Wayve | [Careers](https://wayve.ai/careers/) | [Ashby](https://jobs.ashbyhq.com/wayve) | `wayve-gb` |
| ElevenLabs | [Careers](https://elevenlabs.io/careers) | [Ashby](https://jobs.ashbyhq.com/elevenlabs) | `elevenlabs-gb` |
| Synthesia | [Careers](https://www.synthesia.io/careers) | [Ashby](https://jobs.ashbyhq.com/synthesia) | `synthesia-gb` |

On the review date the public board APIs returned complete listings with UK-located postings for
all four employers (Monzo 51, Wayve 49, ElevenLabs 27, Synthesia 12). Monzo's careers page links
its Greenhouse board directly and Synthesia's careers page links its Ashby board; Wayve's and
ElevenLabs' careers sites embed their Ashby boards. UK locations on these boards read as "London",
"London, United Kingdom" or "Cardiff, London or Remote (UK)".

Use a networked local installation to certify exactly one target:

    career-strike verify-market GB --target monzo-gb

The command calls the existing guarded public ATS adapter. It saves jobs and begins monitoring only
after the source returns a complete listing with at least one explicit UK location. A timeout,
rate limit, invalid response or a listing without UK evidence leaves the country configured and
saves nothing.

## Marketplace policy

| Source | Current capability | Career Strike behaviour |
| --- | --- | --- |
| [Find a job](https://www.jobs.service.gov.uk/) | `USER_DRIVEN_DISCOVERY` | Open the official government job-search service (Department for Work and Pensions); no automated job retrieval is claimed. |
| [LinkedIn Jobs](https://www.linkedin.com/legal/jobs-terms-conditions) | `RESTRICTED` | No scraping or automated extraction; use the official site or a user-supplied listing. |
| [Indeed UK](https://docs.indeed.com/legal-terms/developer-agreement) | `UNVERIFIED` | No integration until approved partner access and permitted display/reuse are confirmed. |
| Reed, Totaljobs | `UNVERIFIED` | No automated retrieval; open the official site or add a verified official listing manually. |

The `UNVERIFIED` label means Career Strike has no recorded approved access; it does not imply a
source is prohibited. A source can move only after its official access model, terms, fields,
display/reuse rights, limits and live retrieval have been reviewed.

## Candidate workflow

1. Start with the monitored employer-direct roles, filtering for freshness and fit.
2. Use Find a job and other marketplaces in the browser for broader user-driven discovery.
3. Add only the official employer application link when recording a manually discovered job.
   Career Strike stores it as unverified until an authorised source confirms it.
4. Treat remote, sponsorship and work authorisation as unknown unless the employer explicitly
   states them. In particular, a "Remote - London" posting is a UK role, not a globally remote
   one, and UK employment usually depends on an employer-sponsored skilled worker visa or an
   existing right to work.
