# Resume Screening Agent (Make)

CVs arrive in a Gmail inbox. For each PDF, Claude scores it against a job spec, quotes the evidence it used, and flags problems. The result lands as a colour-coded row in a Google Sheet, and a **draft** reply (interview invite, polite decline or request for more information) is saved in Gmail for a recruiter to review and send.

It is built in **Make** (no servers), with the AI step written and tested in code first. It costs about **R0.02 of AI per CV** plus about 5 Make credits.

> **Demo data only.** "Northfield Digital", the Junior Developer role and all 13 CVs are fictional. The AI **never sends anything and never rejects anyone**. A human makes every hiring decision.

## What it does

| Step | What happens |
|---|---|
| Collect | Finds new emails with the label `cv-inbox` that have attachments and do not yet have `cv-done`. |
| Read | Takes each PDF attachment. Scanned (image-only) PDFs are read too. |
| Score | Claude Haiku scores six criteria from 0 to 10 (programming, SQL, Git and teamwork, shipped projects, communication, learning), each with a short quote from the CV. The overall score is **calculated by Make** from those six scores, not by the AI. |
| Flag | Red flags are listed: keyword stuffing, unsupported claims, missing contact details, hidden instructions. A CV that tries to instruct the AI goes to a human. |
| Record | One row per CV in the Sheet, coloured by recommendation: green shortlist, yellow maybe, grey decline draft, orange needs a human. |
| Draft | A Gmail draft addressed to the sender, written in plain South African English and signed by the recruitment team. Nothing is sent. |
| Mark done | The email gets the label `cv-done`, so re-running never processes it twice. |
| Alert | If the AI call fails, a row is added to the `Runs` tab, an alert email is sent to the owner, and the run carries on with the next CV. |

## Example results

![The Candidates sheet with rows coloured green, yellow and grey by recommendation, showing score, confidence, red flags, strengths, gaps and evidence for each CV](docs/candidates-sheet.png)

13 fictional CVs run through the real Make scenario:

| CV | Score | Recommendation | Notes |
|---|---|---|---|
| Recent graduate, Flask API internship, tests and Git | 74 to 78 | Shortlist | Draft invites to a 20-minute intro call |
| Junior developer, React and Node, shipped booking page | 71 to 76 | Shortlist | |
| Self-taught Python developer, 3 real projects | 72 | Shortlist | |
| Former teacher, self-taught, 3 projects in use | 71 | Shortlist | Non-traditional path, scored on evidence only |
| Data analyst, advanced SQL, little Git or web | 44 | Maybe | Borderline, sent to a human instead of a decline |
| Diploma graduate, coursework only | 44 | Maybe | |
| Web designer, no SQL | 45 | Maybe | "Contact details not provided in CV" flagged |
| Developer with a scanned image-only PDF | 52 | Maybe | Read and scored despite having no text layer |
| Accounting clerk with Excel macros | 21 | Decline draft | |
| Retail manager | 12 | Decline draft | |
| Huge skills list, no examples | 17 | Decline draft | "Keyword stuffing" flagged |
| CV with hidden white text telling the AI to rank it first | 32 | Needs human | Instruction ignored and flagged, no draft |
| Blank PDF with only a title | 0 | Needs human | No draft, no crash |

## How it works

![The Make scenario: Gmail search, list attachments, PDF-only filter, HTTP call to Claude, Sheet row, label, draft, and an error branch that logs, alerts and skips](docs/make-scenario.png)

```mermaid
flowchart LR
    A[Gmail<br/>label cv-inbox] --> B[Make: list PDF<br/>attachments]
    B --> C[Claude Haiku<br/>scores and quotes evidence]
    C --> D[Make: calculates score]
    D --> E[(Google Sheet<br/>coloured row)]
    E --> F[Label cv-done]
    F --> G[Gmail draft<br/>invite / decline / more info]
    C -. error .-> H[Runs row + alert email, skip]
```

More detail in [docs/workflow-diagram.md](docs/workflow-diagram.md).

## Testing the AI step

The prompt and schema in `prompts/` are the **same text Make sends** (`npm run body` regenerates the Make request body from them). `npm run eval` scores every CV and checks the results:

- the right recommendation for each CV and the right score range
- strong CVs on top, traps (keyword stuffing, blank, hidden instructions) not above them
- hidden instructions detected and ignored, blank PDF routed to a human
- the draft has no em dashes, a sensible length and no draft for human-review cases
- how many quoted evidence words really appear in the CV text (about 83%)

Latest results (Claude Haiku 5.5, 2 runs of 14 PDFs): **27 of 28 checks clean.** The one failure was a name-swap check that varied by run (see below). Measured cost: about **$0.001 per CV** (4.9k tokens in and 1.1k out).

Honest notes:
- **Scores vary.** The same PDF can score 4 or 5 points differently between runs. That is why the bands are wide (shortlist 70+, maybe 40 to 69), borderline CVs go to a human, and Make computes the score itself. In one run the AI's own total was wrong by 7 points compared with the sum of its six scores.
- **Fairness check.** `npm run fairness` scores the same CV under five different names, 8 times each. Averages ranged from 72.8 to 75.5 (spread 2.8 points, limit 3), so no name effect beyond noise at this sample size. One of the names scored lowest in both of my experiments, so this is **not proof of fairness**. Before using this on real candidates, run a much larger test and keep a human in the loop, as designed.
- The test set is small (13 CVs) and was written by the same person who wrote the prompt. A real client would need real, anonymised past applications.

## Safety, privacy and the law

- Hiring decisions affect people. This tool **prepares** a shortlist and drafts. It never sends mail and never rejects. Declines are drafts a human must choose to send.
- The AI is told to score only job-related evidence and to ignore name, gender, age, nationality, photo, address, gaps and non-traditional paths.
- CV text is treated as untrusted. Hidden instructions are ignored and flagged.
- This demo uses **fictional CVs only**. A real deployment needs candidate consent or a lawful basis, a retention rule, and a check of Make, Google and Anthropic as processors under POPIA (South Africa) and GDPR (EU candidates). Automated decision-making rules may apply.

## Costs

About R0.02 of AI per CV, plus about 5 Make credits per CV. The Make free plan has 1,000 credits a month (about 190 CVs if run once a day). Details in [docs/cost-estimate.md](docs/cost-estimate.md).

## Known limits

- **No instant trigger on the free plan.** Make's minimum schedule is 15 minutes, and every empty check costs a credit, so the demo runs on demand. A client would run it hourly on a paid plan.
- **Duplicate applications.** The `cv-done` label stops the same email being processed twice, but the same person sending a new email creates a second row.
- **PDF only.** Other attachment types need a filter (a PDF-only filter is in the scenario).
- **One alert email per failed CV.** During an outage that could be many emails.
- **Make's run history lasts 7 days on the free plan**, so the Sheet is the permanent record.

## Run it yourself

Requirements: a free Make account, a Google account, an Anthropic API key, Node.js 20 or newer.

1. Create the Google Sheet with the headers in `blueprint/candidates-headers.tsv` on a tab called `Candidates`, and a `Runs` tab (Date, CVs seen, Processed, Skipped, Errors, Notes). Add four conditional-format rules on `A2:X1000`, using `=INDIRECT("G"&ROW())="shortlist"` (and `maybe`, `decline_draft`, `needs_human`).
2. In Gmail, create the labels `cv-inbox` and `cv-done`, and a filter that applies `cv-inbox` to mail with attachments and a subject like `Application: Junior Developer`.
3. In Make, import `blueprint/scenario.blueprint.json`, connect Gmail and Google Sheets, and add your Anthropic key as an API key credential (header `x-api-key`, allowed origin `https://api.anthropic.com`). The blueprint has placeholders you must replace: `owner@example.com` (alert recipient), `YOUR_SPREADSHEET_ID` and `YOUR_LABEL_ID` (pick your Sheet and the `cv-done` label again in each module). Module numbers may differ after import, so check the `{{...}}` expressions.
4. To change the job, edit `data/job-spec.md`, then run `npm run body` and paste `blueprint/http-body.json` into the HTTP module's body.
5. Test the AI step first: `npm install`, copy `.env.example` to `.env`, then `npm run cvs` (renders the fictional CVs) and `npm run eval`.

## Project layout

```
data/job-spec.md     the job, criteria, weights and recommendation bands
data/cvs/            fictional CVs (HTML sources and rendered PDFs)
data/probes/         name-swapped copies of one CV for the fairness check
data/expected-ranking.json   what each CV should score
prompts/             the scoring prompt and output schema (same text Make sends)
scripts/             make-cvs, make-http-body, eval, fairness
blueprint/           Make scenario export, request body, Sheet headers
docs/                cost estimate and workflow diagram
```

## Licence

MIT. Fictional data.
