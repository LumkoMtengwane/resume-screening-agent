# Workflow diagrams

## The Make scenario, module by module

```mermaid
flowchart TD
    S[1. Gmail: search emails<br/>label:cv-inbox has:attachment -label:cv-done] -->|filter: an email exists| L[2. Gmail: list email attachments<br/>one bundle per attachment]
    L -->|filter: PDF only| H[3. HTTP: POST to Anthropic<br/>PDF + job spec + score_cv tool]
    H --> R[4. Sheets: add row to Candidates<br/>score calculated by Make]
    R --> D[5. Gmail: add label cv-done]
    D -->|filter: draft text not empty| G[6. Gmail: create draft]
    H -. on error .-> E1[Sheets: add row to Runs]
    E1 --> E2[Gmail: alert email to owner]
    E2 --> E3[Skip: carry on with next CV]
```

## What the AI returns for each CV

```mermaid
flowchart LR
    CV[CV PDF] --> AI[Claude Haiku<br/>forced tool call: score_cv]
    JS[Job spec<br/>criteria, weights, bands] --> AI
    AI --> O[6 criterion scores + quotes<br/>red flags, injection flag<br/>recommendation, confidence<br/>draft subject and body]
    O --> M[Make computes weighted score]
```

## Where a human stays in control

| Point | Who decides |
|---|---|
| Which CVs get invited | Recruiter reads the Sheet and the drafts, then sends or edits |
| Declines | Only ever a draft. Nothing is sent unless a person clicks Send |
| Borderline (40 to 69), unreadable, suspicious or low-confidence CVs | Always a person |
| The Decision column in the Sheet | Filled in by the recruiter |

## Failure paths

| What goes wrong | What happens |
|---|---|
| The AI call fails (bad key, timeout, outage) | A row in `Runs`, an alert email, the CV is skipped and stays unlabelled so it is retried on the next run |
| Attachment is not a PDF | Filtered out before the AI call |
| Blank or unreadable PDF | Scored 0, `needs_human`, no draft |
| CV contains hidden instructions | Ignored, flagged, `needs_human`, no draft |
| Sheet write fails after the AI call | Make shows the error and notifies the owner. The email is not labelled, so the next run retries it (possible duplicate row) |
| The same email is run twice | The `cv-done` label excludes it from the search |

Manual fallback: read the CVs in the `cv-inbox` label and score them by hand against `data/job-spec.md`.
