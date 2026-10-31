# Singapore job discovery

Career Strike uses employer-direct public ATS feeds before it considers a marketplace. This keeps
provenance, application links and freshness evidence intact, without bypassing logins, CAPTCHAs
or platform access controls.

When the Opportunities market filter is set to Singapore, the dashboard also provides official-site
launchers for the reviewed marketplaces. The typed search phrase is passed directly to LinkedIn
or Indeed only in the new browser tab; Career Strike does not retrieve those results. For other
providers the launcher opens the official site, where the candidate searches directly.

## Reviewed employer-direct targets

These identities and board slugs were cross-checked on 2026-10-31 against the employer's official
careers site and its public ATS board. They are eligible for live certification, but are **not**
live integrations until `verify-market` has successfully retrieved an explicitly Singaporean
posting.

| Employer | Official careers site | Public board | Target id |
| --- | --- | --- | --- |
| Stripe | [Jobs](https://stripe.com/jobs) | [Greenhouse](https://boards.greenhouse.io/stripe) | `stripe-singapore` |
| Databricks | [Careers](https://www.databricks.com/company/careers) | [Greenhouse](https://job-boards.greenhouse.io/databricks) | `databricks-singapore` |
| Coinbase | [Careers](https://www.coinbase.com/careers) | [Greenhouse](https://job-boards.greenhouse.io/coinbase) | `coinbase-singapore` |
| Twilio | [Jobs](https://www.twilio.com/en-us/company/jobs) | [Greenhouse](https://job-boards.greenhouse.io/twilio) | `twilio-singapore` |

On the review date the public board APIs returned complete listings with Singapore-located
postings for all four employers (Stripe 47, Databricks 30, Coinbase 7, Twilio 5). Stripe,
Databricks and Coinbase serve their careers search from their own sites over the same Greenhouse
board; the board redirect to the employer's own domain is part of the corroborating evidence.

Use a networked local installation to certify exactly one target:

    career-strike verify-market SG --target stripe-singapore

The command calls the existing guarded public ATS adapter. It saves jobs and begins monitoring only
after the source returns a complete listing with at least one explicit Singapore location. A
timeout, rate limit, invalid response or a listing without Singapore evidence leaves the country
configured and saves nothing.

## Marketplace policy

| Source | Current capability | Career Strike behaviour |
| --- | --- | --- |
| [MyCareersFuture](https://www.mycareersfuture.gov.sg/) | `USER_DRIVEN_DISCOVERY` | Open the official portal; no automated job retrieval is claimed. |
| [LinkedIn Jobs](https://www.linkedin.com/legal/jobs-terms-conditions) | `RESTRICTED` | No scraping or automated extraction; use the official site or a user-supplied listing. |
| [Indeed](https://docs.indeed.com/legal-terms/developer-agreement) | `UNVERIFIED` | No integration until approved partner access and permitted display/reuse are confirmed. |
| JobStreet Singapore, Glints | `UNVERIFIED` | No automated retrieval; open the official site or add a verified official listing manually. |

The `UNVERIFIED` label means Career Strike has no recorded approved access; it does not imply a
source is prohibited. A source can move only after its official access model, terms, fields,
display/reuse rights, limits and live retrieval have been reviewed.

## Candidate workflow

1. Start with the monitored employer-direct roles, filtering for freshness and fit.
2. Use MyCareersFuture and other marketplaces in the browser for broader user-driven discovery.
3. Add only the official employer application link when recording a manually discovered job.
   Career Strike stores it as unverified until an authorised source confirms it.
4. Treat remote, sponsorship and work authorisation as unknown unless the employer explicitly
   states them. In particular, a "Remote - Singapore" posting is a Singapore role, not a
   globally remote one.
