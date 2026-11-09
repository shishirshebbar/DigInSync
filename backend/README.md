# Backend notes

## Demo decisions

Proposal creation, editing, approval and rejection remain a local demo only.
They require `ENVIRONMENT=development`, `ENABLE_DEMO_APPROVALS=true`, a
nonblank `DEMO_REVIEWER_ID`, and a direct loopback connection addressed to
`localhost`, `127.0.0.1`, or `[::1]`. Requests with forwarded-client headers
are rejected, including those from a reverse proxy. The browser must connect
directly to the local backend; forwarding via Docker or another host may not
be treated as loopback.

This is not authentication: any local process can act as the configured demo
reviewer. Do not expose demo approvals as production authorization. Proper
agency use still requires authenticated identities, per-user permissions,
secure deployment and an independent security review.

Approval compares the saved candidate/project snapshots and deterministic
conflict analysis with the current database. A changed candidate or conflict
requires the user to save and review a new revision. Drafts created before
candidate snapshots were added must also be saved again. The database holds a
shared project-table lock while capturing or checking a proposal, preventing
project writes during the review transaction; this may delay other writers
and is intended for the prototype, not high-volume production.

## Data coverage

The dashboard and `GET /api/impact/` report counts of roads with feature rows
and geocoded records. These are counts of stored rows, not evidence that
feature values are complete or that incidents are nearby. Selecting an OSM
road is still only a location reference, not a verified excavation extent.
Ward boundaries/crosswalks and geocoded incident sources must be independently
verified before importing or using them for road-level conclusions.

## Group-disjoint proxy evaluation

With compatible BBMP CSVs in `data/raw`, run from `backend`:

```powershell
python -m ml.evaluate_proxy_groups
```

This runs a fixed random-forest baseline with disjoint source identifier
groups for the holdout and cross-validation. It does not save or replace the
deployed model. The output measures agreement with synthetic proxy labels, not
observed disruption. Identifiers remain unreconciled; they are not verified
wards. Percentile thresholds used to construct labels are computed using all
groups, including evaluation groups, so this is not a fully independent
evaluation. Verified project outcomes, an authoritative crosswalk and a
prospective evaluation are still required.
