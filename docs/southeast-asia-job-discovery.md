# Southeast Asia job discovery

Career Strike uses employer-direct public ATS feeds before it considers a marketplace. This keeps
provenance, application links and freshness evidence intact, without bypassing logins, CAPTCHAs
or platform access controls. This guide covers Malaysia, Indonesia, the Philippines, Thailand and
Vietnam; Singapore has its own [discovery guide](singapore-job-discovery.md).

## Reviewed employer-direct targets

These identities and board slugs were cross-checked on 2026-10-31 against the employer's official
careers site and its public ATS board. They are eligible for live certification, but are **not**
live integrations until `verify-market` has successfully retrieved an explicitly located posting
for that market. Because each board is adopted once per installation, a board certified for one
market also carries its explicit postings for the other markets it was reviewed for.

| Employer  | Official careers site                                    | Public board                                              | Target id       | Markets reviewed   |
| --------- | -------------------------------------------------------- | --------------------------------------------------------- | --------------- | ------------------ |
| Ninja Van | [Careers](https://www.ninjavan.co/en-sg/company/careers) | [Lever](https://jobs.lever.co/ninjavan)                   | `ninjavan-sea`  | MY, ID, PH, TH, VN |
| Agoda     | [Careers](https://careersatagoda.com/)                   | [Greenhouse](https://job-boards.greenhouse.io/agoda)      | `agoda-careers` | TH, MY, PH, VN     |
| Xendit    | [Careers](https://www.xendit.co/careers/)                | [Greenhouse](https://job-boards.greenhouse.io/xendit)     | `xendit-sea`    | ID, TH, MY, PH     |
| AvePoint  | [Careers](https://www.avepoint.com/careers)              | [Greenhouse](https://job-boards.greenhouse.io/avepoint)   | `avepoint-ph`   | PH                 |
| Mitsogo   | [Careers](https://www.mitsogo.com/careers)               | [Greenhouse](https://job-boards.greenhouse.io/mitsogoinc) | `mitsogo-ph`    | PH                 |
| Amanotes  | [Careers](https://www.careers.amanotes.com/)             | [Lever](https://jobs.lever.co/amanotes)                   | `amanotes-vn`   | VN                 |
| Sky Mavis | [Careers](https://skymavis.com/careers)                  | [Ashby](https://jobs.ashbyhq.com/skymavis)                | `skymavis-vn`   | VN                 |

On the review date the public board APIs returned complete listings with explicit local evidence:
Ninja Van — Malaysia 84, Philippines 17, Indonesia 7, Thailand 4, Vietnam 2 postings; Agoda —
Thailand 200, Malaysia 14, Philippines 2, Vietnam 2; Xendit — Indonesia 2, Malaysia 1, Thailand 1.
The Philippines and Vietnam are also served by dedicated boards of their own, reviewed the same
day: AvePoint — Manila 11, Cebu 5, Manila and Cebu 1; Mitsogo — Manila 3, Philippines 4;
Amanotes — Ho Chi Minh City 15; Sky Mavis — Vietnam 6. Ninja Van's own careers site deep-links to
its Lever postings, Agoda's official careers site embeds the Greenhouse board directly, and
Xendit's board postings carry the Xendit identity; AvePoint's Greenhouse board is rendered by
AvePoint's own careers site, Mitsogo's site links its Greenhouse board directly, Amanotes'
dedicated careers site embeds its Lever postings, and Sky Mavis' careers page links its Ashby
board. The Singapore and India markets are deliberately not in these target lists because both
are already certified through their own dedicated boards.

Use a networked local installation to certify exactly one target per market:

    career-strike verify-market MY --target ninjavan-sea
    career-strike verify-market TH --target agoda-careers
    career-strike verify-market ID --target xendit-sea
    career-strike verify-market PH --target avepoint-ph
    career-strike verify-market VN --target amanotes-vn

The command calls the existing guarded public ATS adapter. It saves jobs and begins monitoring only
after the source returns a complete listing with at least one explicit posting located in the
selected market. A timeout, rate limit, invalid response or a listing without such evidence leaves
the market configured and saves nothing. A board can be adopted only once per installation; once
`ninjavan-sea` is adopted, certifying another Ninja Van market is not possible through the command
— refresh the board from the dashboard instead, and rely on its monitored feed for the other
markets' explicit postings.

## Marketplace policy

| Source                                                                                                                           | Current capability | Career Strike behaviour                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| [LinkedIn Jobs](https://www.linkedin.com/legal/jobs-terms-conditions)                                                            | `RESTRICTED`       | No scraping or automated extraction; use the official site or a user-supplied listing.                   |
| [JobStreet](https://www.jobstreet.com.sg/career-resources/legal/privacy-notice/) / [JobsDB](https://www.jobsdb.com/en/thailand/) | `UNVERIFIED`       | SEEK-group marketplaces; no integration until approved access and permitted display/reuse are confirmed. |
| [Glints](https://glints.com/), [Kalibrr](https://www.kalibrr.com/), [Hiredly](https://hiredly.com/)                              | `UNVERIFIED`       | No automated retrieval; open the official site or add a verified official listing manually.              |
| [VietnamWorks](https://www.vietnamworks.com/), [TopCV](https://www.topcv.vn/), [ITviec](https://itviec.com/)                     | `UNVERIFIED`       | Vietnam-focused marketplaces; no automated retrieval is claimed.                                         |
| [Indeed](https://docs.indeed.com/legal-terms/developer-agreement)                                                                | `UNVERIFIED`       | No integration until approved partner access and permitted display/reuse are confirmed.                  |

The `UNVERIFIED` label means Career Strike has no recorded approved access; it does not imply a
source is prohibited. A source can move only after its official access model, terms, fields,
display/reuse rights, limits and live retrieval have been reviewed.

## Candidate workflow

1. Start with the monitored employer-direct roles, filtering for freshness and fit.
2. Use the marketplaces above in the browser for broader user-driven discovery.
3. Add only the official employer application link when recording a manually discovered job.
   Career Strike stores it as unverified until an authorised source confirms it.
4. Treat remote, sponsorship and work authorisation as unknown unless the employer explicitly
   states them. A "Remote - Malaysia" posting is a Malaysian role, not a globally remote one.
