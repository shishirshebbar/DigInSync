# DigInSync interface guide

The frontend is an operations workspace for infrastructure coordinators. Its
routes and presentation may evolve independently of backend calculations,
payloads, persistence, and local-demo approval rules.

## Navigation and decisions

- Overview: saved work first, followed by recorded totals.
- Projects: road-name search and backend pagination; no implied organization search.
- New project: structured details, optional AI suggestions, optional road reference.
- Project: Analysis, Schedule comparison, Coordination, and Proposals sections.
- Proposal: editable Draft, Review of the saved revision, and persistent history.
- Workplan: a read-only record linked to its source proposal.
- Data context: coverage counts and source-specific ward lookup.

Section navigation uses links with `aria-current`, not ARIA tab widgets. URL
query changes preserve mounted section state. Existing dashboard, proposal, and
workplan query links remain supported.

## Shared presentation

Use the primitives in `src/components/ui.tsx` and `FormField.tsx`: page headers,
panels, notices, badges, empty states, section links, dialogs, and fields. Global
tokens and responsive rules live in `src/app/globals.css`.

Use restrained navy/blue on a neutral canvas. Success, warning, and error colors
always accompany text. Body type is 16px; dense records use 14px, and metadata
uses 12px. Use the 4/8/12/16/24/32/48px spacing scale, 44px controls, and 6–8px
corners. Tables have labeled record-list alternatives on small screens.

## State and feedback

Form fields display required markers and linked feedback after blur or submit.
Feedback reserves space to prevent layout changes during pointer interaction.
The first invalid field receives focus. Dates remain ISO values in API payloads;
display dates use the same day/month/year convention without timezone shifts.
End dates are exclusive throughout the application.

Drafts live only in the browser module store. `useSyncExternalStore` supplies a
stable server snapshot and prevents hydration mismatches. No browser storage or
autosave is used. Explicit discard requires confirmation. Do not replace dirty
content with a background response or infer a successful save.

Review always renders saved proposal content. It cannot approve unsaved edits.
Backend revision and freshness checks remain authoritative. Confirmed decisions
survive subsequent read errors; unknown mutation outcomes are never retried
automatically. Completed records render as documents rather than disabled forms.

## Evidence and process visibility

The compact process strip expands into observed request phases and explanations.
It describes browser requests, not a streamed backend execution trace. Do not
invent percentages or internal completion states. Global Activity is visit-only;
Decision history is a separate persistent backend record.

Candidate counts and overlapping schedules are different measures. Risk is an
experimental indicator, including when deterministic fallback is used. Data
warnings remain accessible in disclosures, with critical interpretation guidance
visible beside results. Ward counts never imply road-level proximity.

## Verification

Run lint and a production build. The Playwright suites exercise real-backend
proposal workflows and controlled failure/recovery cases, with axe scans of the
main screens. Use the existing disposable database runner described in README.
Screenshots cover desktop, tablet, and mobile widths. Automated checks complement
keyboard and visual review; they do not establish full WCAG conformance or replace
research with agency coordinators.
