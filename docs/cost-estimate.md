# Cost estimate

Measured 2026-10-25 from `npm run eval` (28 results) and from the Make credit page.

## Per CV

| Item | Figure |
|---|---|
| Claude Haiku 5.5 | about $0.00104 per CV (about R0.02): 4.9k tokens in and 1.1k out, with the PDF sent as a document |
| Make credits | about 5 per CV: list attachments 1, HTTP 1, Sheet row 1, label 1, draft 1 (4 when no draft is needed) |
| Make credits per run | 1 for the email search, even when it finds nothing |
| Google Sheets, Gmail | $0 |

Haiku 5.5 prices used: $0.10 per million input tokens and $0.50 per million output tokens (same figures as the other projects, checked 2026-10-15).

## Per month

| CVs per month | Claude cost | Make credits | Plan needed |
|---|---|---|---|
| 50 | about $0.05 (R1) | about 280 (50 x 5 plus a daily check) | Free (1,000 credits) |
| 190 | about $0.20 | about 980 | Free, at the limit |
| 1,000 | about $1.05 (R19) | about 5,100 | Core (10,000 credits a month, from $9 a month billed yearly) |

## Make free plan limits (read from the Make Subscription page on 2026-10-20)

1,000 credits a month, 2 active scenarios, 15-minute minimum schedule, 5-minute run time, 5 MB files, 7 days of run history. Credits used by all testing in this project: 260 at 2026-10-25.

## Value (assumptions, not measured)

If manual screening takes about 5 minutes per CV and review takes about 1 minute, 100 CVs a month saves about 6.7 hours. The figures above exclude build time.

## Costs outside this estimate

Make Core or higher if a client needs hourly or instant runs, and the client's own Google Workspace if they use it. A real deployment also needs time for the data-protection checks listed in the README.
