# United Arab Emirates job discovery

Career Strike uses employer-direct public ATS feeds before it considers a marketplace. This keeps
provenance, application links and freshness evidence intact, without bypassing logins, CAPTCHAs
or platform access controls.

When the Opportunities market filter is set to United Arab Emirates, the dashboard also provides
official-site launchers for the reviewed marketplaces. The typed search phrase is passed directly
to LinkedIn or Indeed only in the new browser tab; Career Strike does not retrieve those results.
For other providers the launcher opens the official site, where the candidate searches directly.

## Reviewed employer-direct targets

These identities and board slugs were cross-checked on 2026-11-01 against the employer's official
careers site and its public ATS board. They are eligible for live certification, but are **not**
live integrations until `verify-market` has successfully retrieved an explicitly Emirati posting.

| Employer     | Official careers site                                    | Public board                                             | Target id       |
| ------------ | -------------------------------------------------------- | -------------------------------------------------------- | --------------- |
| Bybit        | [Careers](https://www.bybit.com/en/promo/global/careers) | [Greenhouse](https://job-boards.greenhouse.io/bybit)     | `bybit-uae`     |
| Deliveroo    | [Careers](https://careers.deliveroo.co.uk/)              | [Greenhouse](https://job-boards.greenhouse.io/deliveroo) | `deliveroo-uae` |
| Ziina        | [Careers](https://ziina.com/careers)                     | [Ashby](https://jobs.ashbyhq.com/ziina)                  | `ziina-uae`     |
| Checkout.com | [Careers](https://checkout.com/careers)                  | [Ashby](https://jobs.ashbyhq.com/checkout.com)           | `checkout-uae`  |

On the review date the public board APIs returned complete listings with UAE-located postings for
all four employers (Bybit 45, Deliveroo 15, Ziina 13, Checkout.com 6). Ziina's careers site links
its Ashby board directly and Checkout.com's careers site links the same Ashby board; Deliveroo's
own careers pages render the same Greenhouse job identities and locations shown by the public
board. UAE locations on these boards read as "Dubai", "Abu Dhabi, UAE" or "Dubai, United Arab
Emirates".

Use a networked local installation to certify exactly one target:

    career-strike verify-market AE --target bybit-uae

The command calls the existing guarded public ATS adapter. It saves jobs and begins monitoring only
after the source returns a complete listing with at least one explicit UAE location. A timeout,
rate limit, invalid response or a listing without UAE evidence leaves the country configured and
saves nothing.

## Marketplace policy

| Source                                                                | Current capability      | Career Strike behaviour                                                                     |
| --------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| [Dubai Careers](https://dubaicareers.ae/)                             | `USER_DRIVEN_DISCOVERY` | Open the official Dubai Government portal; no automated job retrieval is claimed.           |
| [LinkedIn Jobs](https://www.linkedin.com/legal/jobs-terms-conditions) | `RESTRICTED`            | No scraping or automated extraction; use the official site or a user-supplied listing.      |
| [Indeed](https://docs.indeed.com/legal-terms/developer-agreement)     | `UNVERIFIED`            | No integration until approved partner access and permitted display/reuse are confirmed.     |
| Bayt, GulfTalent, Naukrigulf                                          | `UNVERIFIED`            | No automated retrieval; open the official site or add a verified official listing manually. |

The `UNVERIFIED` label means Career Strike has no recorded approved access; it does not imply a
source is prohibited. A source can move only after its official access model, terms, fields,
display/reuse rights, limits and live retrieval have been reviewed.

## Candidate workflow

1. Start with the monitored employer-direct roles, filtering for freshness and fit.
2. Use Dubai Careers and other marketplaces in the browser for broader user-driven discovery.
3. Add only the official employer application link when recording a manually discovered job.
   Career Strike stores it as unverified until an authorised source confirms it.
4. Treat remote, sponsorship and work authorisation as unknown unless the employer explicitly
   states them. In particular, a "Remote - Dubai" posting is a UAE role, not a globally remote
   one, and UAE employment usually depends on an employer-sponsored work visa.
