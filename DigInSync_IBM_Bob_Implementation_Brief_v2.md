# DigInSync — IBM Bobathon Implementation Brief

## 1. Project Overview

### Product Name

**DigInSync**

### Tagline

> **One plan. Multiple infrastructure works. One coordinated execution.**

Alternative positioning:

> **Before Bengaluru digs twice, DigInSync coordinates once.**

### Hackathon

**IBM Bobathon: Build for Bengaluru**

### Theme

**Smarter Streets, Better Living**

---

# 2. Problem Statement

Bengaluru has a coordination problem in addition to a traffic and infrastructure problem.

Different organizations may independently plan:

- Water pipeline work
- Telecom/cable work
- Electricity work
- Road repair
- Drainage work
- Utility maintenance

These projects can overlap geographically and temporally.

This can result in:

- Repeated excavation of the same road
- Multiple road closures
- Longer disruption to citizens
- Duplicate restoration work
- Poor coordination between organizations
- Higher execution costs
- Inefficient use of public infrastructure

### DigInSync's solution

DigInSync is an AI-assisted infrastructure coordination platform.

A user enters a proposed infrastructure project using **natural language only**.

Example:

> We need to replace a 150m water pipeline on 80 Feet Road from November 12 to November 18. One lane will be closed.

DigInSync then:

1. Understands the project.
2. Extracts structured project information.
3. Identifies the relevant Bengaluru road segment.
4. Finds relevant existing/planned infrastructure activity.
5. Detects spatial and temporal conflicts.
6. Predicts disruption risk using an ML model.
7. Uses an AI coordination agent to generate alternatives.
8. Lets a human review and approve the recommendation.
9. Generates a coordinated joint workplan.

---

# 3. Core Product Principle

The user should **not need to upload a CSV, Excel file, GIS file, or any other dataset**.

The primary interaction is:

```text
User enters natural-language project
              ↓
DigInSync understands it
              ↓
DigInSync searches its prepared Bengaluru data
              ↓
Conflict + risk analysis
              ↓
AI coordination recommendation
              ↓
Human approval
              ↓
Joint workplan
```

---

# 4. High-Level Architecture

```text
                         USER / JUDGE
                              |
                              |
                 Natural-language project
                              |
                              v
                 +------------------------+
                 |   DigInSync Web App    |
                 |   Next.js / React      |
                 +-----------+------------+
                             |
                             v
                 +------------------------+
                 | Project Intelligence   |
                 | Agent / LLM            |
                 +-----------+------------+
                             |
                             v
                    Structured Project
                             |
              +--------------+---------------+
              |                              |
              v                              v
     +------------------+            +-------------------+
     | PostgreSQL       |            | PostGIS           |
     | Public Data      |            | Spatial Analysis  |
     +--------+---------+            +---------+---------+
              |                                |
              +----------------+---------------+
                               |
                               v
                    +----------------------+
                    | Conflict Engine      |
                    | Deterministic Rules  |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | ML Risk Model        |
                    | XGBoost / RF         |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | Coordination Agent   |
                    | LLM + Backend Tools  |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | What-if Simulator    |
                    +----------+-----------+
                               |
                               v
                       Human Approval
                               |
                               v
                    +----------------------+
                    | Workplan Agent       |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | Joint Workplan       |
                    +----------------------+
```

---

# 5. Technical Architecture

## Frontend

Recommended:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Mapbox or Leaflet

Responsibilities:

- Natural-language project input
- Project confirmation/editing
- Interactive city map
- Conflict visualization
- Risk visualization
- Coordination options
- What-if simulator
- Human approval
- Workplan display
- Impact dashboard

---

# 6. Backend

Recommended:

**Python + FastAPI**

Responsibilities:

- Project management
- Data access
- PostGIS queries
- Conflict detection
- ML inference
- Agent tool execution
- Coordination workflow
- Simulation
- Workplan generation
- Caching
- Authentication if needed later
- API validation

---

# 7. Database

Use:

**PostgreSQL + PostGIS**

PostGIS is important because DigInSync is fundamentally spatial.

The database stores:

- Road segments
- Projects
- Historical work orders
- Road repairs
- Potholes
- Grievances
- Conflicts
- ML predictions
- Coordination plans
- Workplans

Use spatial indexes.

Do not make the application query raw CSV files directly.

---

# 8. Public Data Strategy

The project should use **real public/open Bengaluru data**, not rely entirely on synthetic data.

Potential sources:

### BBMP / OpenCity

https://data.opencity.in/

Potential datasets:

- BBMP Work Orders
- BBMP Road Repair Data
- BBMP Fix My Street / Pothole Data
- BBMP Grievances

### Bengaluru Smart City Open Data Portal

https://opendata.benscl.com/

Potential categories:

- Maps
- Transport
- Environment
- Public Safety
- Population & Society
- Energy

### India Open Government Data Platform

https://data.gov.in/

Use only relevant datasets.

### OpenStreetMap

https://www.openstreetmap.org/

Use for:

- Road network
- Road geometry
- Road segments
- Spatial matching

For downloads, use an appropriate regional extract rather than downloading all of India.

---

# 9. Data Architecture

The application must separate:

1. Raw public data
2. Processed application data
3. LLM context

Architecture:

```text
                 PUBLIC DATA
                     |
                     v
              Data Ingestion
                     |
                     v
          Cleaning / Normalization
                     |
                     v
            Feature Engineering
                     |
                     v
           PostgreSQL + PostGIS
                     |
          +----------+----------+
          |                     |
          v                     v
   Conflict Engine          ML Model
          |                     |
          +----------+----------+
                     |
                     v
              Small Context
                     |
                     v
                  LLM
```

---

# 10. Critical Token Optimization Requirement

Large datasets must **never** be sent directly to the LLM.

Bad:

```text
500,000 work orders
        ↓
       LLM
```

Good:

```text
500,000 records
        ↓
PostgreSQL/PostGIS
        ↓
Relevant geographic subset
        ↓
Relevant date subset
        ↓
Conflict engine
        ↓
3–10 relevant records
        ↓
ML risk score
        ↓
Small structured context
        ↓
LLM
```

The LLM should receive only:

- Current project
- Relevant nearby projects
- Detected conflicts
- Risk score
- Constraints
- Simulation results

Implement:

- Response caching
- Structured JSON responses
- Minimal prompts
- Backend tool calls
- No duplicate calls
- Deterministic calculations outside the LLM

The system must remain usable if the LLM free-tier limit is reached.

---

# 11. Data Processing Pipeline

Build a reproducible ETL pipeline.

```text
Raw Public Dataset
        ↓
Download
        ↓
Validate
        ↓
Clean
        ↓
Normalize
        ↓
Geocode / Spatial Mapping
        ↓
Feature Engineering
        ↓
PostgreSQL + PostGIS
```

Suggested project structure:

```text
data/
  raw/
    bbmp_work_orders/
    bbmp_road_repairs/
    bbmp_potholes/
    bbmp_grievances/
    osm/

  processed/
    road_segments/
    historical_projects/
    road_conditions/
    risk_features/
```

Keep raw data separate from processed data.

Document dataset source, date, license/usage terms, transformations, and update date.

---

# 12. Database Schema

## projects

```text
id
project_id
organization
project_type
description
road_segment_id
geometry
start_date
end_date
duration_days
length_m
lane_closure
impact_level
priority
status
created_at
```

## road_segments

```text
id
road_name
geometry
road_type
road_width
ward
zone
```

## historical_work_orders

```text
id
source_id
organization
work_type
road_segment_id
geometry
date
ward
description
```

## road_repairs

```text
id
source_id
road_segment_id
geometry
repair_type
date
status
```

## potholes

```text
id
source_id
geometry
reported_date
status
```

## grievances

```text
id
source_id
geometry
category
date
status
```

## conflicts

```text
id
project_a_id
project_b_id
spatial_overlap
temporal_overlap
overlap_days
impact_score
conflict_score
severity
status
created_at
```

## risk_predictions

```text
id
project_id
risk_score
risk_level
model_version
created_at
```

## coordination_plans

```text
id
conflict_id
option_name
description
risk_score
estimated_duration
tradeoffs
status
created_at
```

## workplans

```text
id
coordination_plan_id
project_id
task
organization
start_date
end_date
dependency
status
```

---

# 13. Conflict Detection Engine

The conflict engine must be deterministic.

Do NOT use an LLM for geometry or date calculations.

## Spatial conflict

Determine whether projects:

- Share a road segment
- Geographically intersect
- Fall within an impact radius

## Temporal conflict

Example:

```text
Project A: Nov 10–15
Project B: Nov 12–17

Overlap = 4 days
```

## Impact conflict

Examples:

- Excavation + excavation
- Lane closure + excavation
- Road resurfacing + utility installation

## Dependency conflict

Example:

```text
Utility installation
       ↓
Road restoration
```

Return structured conflict information:

```json
{
  "conflict": true,
  "severity": "HIGH",
  "overlap_days": 4,
  "spatial_overlap": true,
  "impact_overlap": true
}
```

---

# 14. ML Model

DigInSync must contain a real ML model in the backend.

## Objective

Predict:

**Road / Infrastructure Disruption Risk**

Output:

```text
Risk Score: 0–100
Risk Level: LOW / MEDIUM / HIGH
```

## Candidate features

```text
road_width
road_type
historical_work_orders
historical_road_repairs
pothole_count
grievance_count
existing_projects
nearby_projects
project_duration
lane_closure
project_length
number_of_overlapping_utilities
```

## Recommended model

Start with:

**XGBoost**

Use:

**Random Forest**

as a baseline.

Use scikit-learn for preprocessing/evaluation.

Do not build a deep neural network unless the data demonstrates a real need.

Document:

- Target definition
- Feature definitions
- Training methodology
- Validation methodology
- Metrics
- Model version
- Known limitations

Do not make unsupported accuracy claims.

---

# 15. Agent Architecture

Do not create dozens of agents.

Use approximately three application-level agents.

## Agent 1 — Project Intelligence Agent

Purpose:

Natural language → structured project.

Input:

```text
"We need to replace a 150m water pipeline
on 80 Feet Road from Nov 12–18.
One lane will be closed."
```

Output:

```json
{
  "project_type": "water_pipeline",
  "road_name": "80 Feet Road",
  "start_date": "2026-11-12",
  "end_date": "2026-11-18",
  "length_m": 150,
  "lane_closure": 1
}
```

Validate the output before proceeding.

---

## Agent 2 — Coordination Agent

Purpose:

Analyze known conflicts and propose coordination options.

Tools:

```text
get_project()
find_nearby_projects()
check_spatial_conflict()
check_schedule_conflict()
get_risk_score()
simulate_schedule()
get_project_constraints()
```

The agent should NEVER query raw datasets.

It should call backend tools that return small structured results.

---

## Agent 3 — Workplan Agent

Run only after human approval.

Purpose:

Generate a structured joint workplan.

Example:

```text
Water Department
→ Excavation
→ Pipeline installation

Telecom
→ Cable work

Road Authority
→ Traffic management
→ Restoration
```

---

# 16. LLM Provider Abstraction

Keep the LLM provider replaceable.

Example:

```python
class LLMProvider:
    def generate(self, prompt, tools=None):
        pass
```

Possible implementations:

```text
GeminiProvider
WatsonxProvider
```

The exact provider should be selected based on:

- Hackathon requirements
- Free-tier availability
- IBM technology requirements
- Rate limits
- Model capability
- Deployment environment

Do not expose API keys in the frontend.

Use environment variables/secrets.

Example:

```text
LLM_API_KEY
DATABASE_URL
MAP_API_KEY
```

---

# 17. API Design

Start with:

```text
POST /api/projects
```

Create a structured project.

```text
GET /api/projects/{id}
```

Retrieve project.

```text
GET /api/projects/nearby
```

Find nearby projects using PostGIS.

```text
POST /api/conflicts/analyze
```

Analyze conflicts.

```text
POST /api/risk/predict
```

Run ML risk prediction.

```text
POST /api/coordinate
```

Generate coordination recommendations.

```text
POST /api/simulate
```

Run what-if scenario.

```text
POST /api/coordination-plans/{id}/approve
```

Approve recommendation.

```text
GET /api/workplans/{id}
```

Retrieve workplan.

```text
GET /api/impact
```

Return impact metrics.

Add health endpoints:

```text
GET /health
GET /ready
```

These are important for deployment and monitoring.

---

# 18. User Interface

## A. Project input

Large natural-language input.

```text
Describe your infrastructure project...

[ Analyze Project ]
```

## B. Extracted project details

Show:

- Project type
- Road
- Dates
- Length
- Lane impact

Allow editing.

## C. Map

Show:

- Road network
- New project
- Existing relevant projects
- Conflicts
- Risk indicators

## D. Conflict panel

Example:

```text
3 conflicts detected

Water ↔ Telecom
4-day overlap

Water ↔ Road Repair
3-day overlap
```

## E. Risk panel

```text
Disruption Risk

78 / 100
HIGH
```

## F. Recommendations

Show 2–3 alternatives.

Each should contain:

- Description
- Risk score
- Schedule impact
- Tradeoffs

## G. Human approval

```text
Approve
Modify
Reject
```

## H. Workplan

Show tasks, organizations, dates, and dependencies.

---

# 19. What-if Simulator

This should be one of the strongest demo features.

Example:

Current:

```text
Telecom project
Nov 12–16
```

User changes it to:

```text
Nov 19–23
```

DigInSync recalculates:

```text
Before:
Conflict = HIGH
Risk = 78

After:
Conflict = LOW
Risk = 43
```

The simulator must use:

- PostGIS
- Deterministic conflict logic
- ML model

Do not use the LLM for numerical calculations.

---

# 20. End-to-End Demo

The final demo should work like this:

### Step 1

Judge enters:

> We need to replace a 150m water pipeline on 80 Feet Road from Nov 12–18. One lane will be closed.

### Step 2

Project Intelligence Agent extracts structured information.

### Step 3

User confirms/edit details.

### Step 4

DigInSync identifies the relevant road segment.

### Step 5

PostGIS finds relevant nearby infrastructure activity.

### Step 6

Conflict engine detects spatial/temporal conflicts.

### Step 7

ML model predicts:

```text
Disruption Risk = 78/100
```

### Step 8

Coordination Agent generates:

```text
Option A — Joint excavation
Risk: 42

Option B — Move telecom
Risk: 51

Option C — Split water work
Risk: 57
```

### Step 9

Judge changes a schedule using the what-if simulator.

### Step 10

Risk/conflict values update.

### Step 11

Judge approves an option.

### Step 12

Workplan Agent generates the joint workplan.

---

# 21. Deployment — MUST BE PART OF THE MVP

Deployment is a **required deliverable**, not a final optional step.

The project must be accessible through a public URL for the hackathon demo.

Target:

```text
https://<digsync-domain>
```

A judge should be able to open the URL and use the application without setting up the project locally.

## Deployment architecture

```text
                         INTERNET
                            |
                            v
                  +-------------------+
                  | Frontend Hosting  |
                  | Next.js            |
                  +---------+---------+
                            |
                            | HTTPS
                            v
                  +-------------------+
                  | Backend Hosting   |
                  | FastAPI            |
                  +----+----------+---+
                       |          |
                       |          |
                       v          v
              +------------+  +------------+
              | PostgreSQL |  | LLM API    |
              | + PostGIS  |  | Provider   |
              +------------+  +------------+
                       |
                       v
                ML Model / Files
```

## Deployment requirements

The deployed application must include:

- Frontend
- Backend API
- PostgreSQL/PostGIS
- ML model
- Required public-data subset
- LLM integration
- Environment variables/secrets
- Health checks
- Error handling

## Recommended deployment approach

Use a managed cloud deployment that supports:

### Frontend

A Next.js-compatible hosting service.

### Backend

A Python/FastAPI-compatible cloud service.

### Database

Managed PostgreSQL with PostGIS support.

### ML model

The initial ML model can be packaged with the backend or loaded as a model artifact.

Do not introduce a separate ML serving platform unless necessary.

### Important

Choose the deployment provider based on current free-tier availability, project limits, database persistence, and hackathon requirements.

Do not assume a free tier is permanent.

---

# 22. Deployment Environment

Use separate environment configuration.

Example:

```text
.env.local
.env.production
```

Never commit secrets.

Example production variables:

```text
DATABASE_URL=
LLM_API_KEY=
MAP_API_KEY=
LLM_PROVIDER=
ENVIRONMENT=production
```

The frontend must never contain private LLM/database credentials.

---

# 23. Production-like Requirements

Even though this is a hackathon project, implement basic production discipline:

- HTTPS
- CORS configuration
- Environment-based configuration
- Input validation
- API error handling
- Logging
- Health checks
- Database migrations
- Basic rate limiting if practical
- API timeout handling
- LLM failure fallback
- Database connection pooling
- Secrets management
- No sensitive data in logs

---

# 24. LLM Failure / Free-Tier Failure

The application should not completely break if the LLM is unavailable.

For example:

```text
LLM unavailable
      ↓
Show detected conflicts
      ↓
Show ML risk score
      ↓
Show deterministic coordination templates
      ↓
"AI recommendations temporarily unavailable"
```

The core conflict engine and ML risk model should continue working.

This is especially important during a live hackathon demo.

---

# 25. Caching

Cache expensive/repeated results.

Potential cache keys:

```text
project_id
conflict_id
simulation_parameters
risk_model_version
prompt_version
```

Cache:

- Extracted project data where appropriate
- Conflict analysis
- Risk predictions
- Coordination recommendations
- Workplans

Invalidate cache when relevant project data changes.

For the MVP, PostgreSQL can be used for persistence/cache records.

Do not introduce Redis unless it becomes necessary.

---

# 26. Deployment Checklist

Before the final hackathon demo:

```text
[ ] Frontend deployed
[ ] Backend deployed
[ ] Database deployed
[ ] PostGIS enabled
[ ] Public data loaded
[ ] ML model deployed
[ ] LLM API configured
[ ] Secrets configured
[ ] Health endpoint working
[ ] Frontend can reach backend
[ ] Backend can reach database
[ ] Backend can call LLM
[ ] Map renders in production
[ ] Natural-language project works
[ ] Conflict detection works
[ ] ML prediction works
[ ] Coordination agent works
[ ] What-if simulator works
[ ] Approval works
[ ] Workplan generation works
[ ] Error/fallback path tested
[ ] Public URL tested from a clean browser
```

Test the deployed URL from a machine/environment that does not have the development environment configured.

---

# 27. Metrics

Do not invent impact numbers.

Calculate them from the prototype.

Potential metrics:

## Duplicate excavation avoided

```text
Separate excavation windows
before coordination
-
excavation windows
after coordination
```

## Road disruption days avoided

```text
Baseline disruption days
-
Coordinated disruption days
```

## Coordination planning time

```text
Estimated manual planning time
vs
DigInSync planning time
```

## Conflicts detected

```text
Spatial + temporal conflicts
```

## Risk reduction

```text
Risk before coordination
-
Risk after coordination
```

Display metrics only when supported by actual prototype calculations.

---

# 28. Human Oversight and Safety

DigInSync deals with civic infrastructure.

Therefore:

- AI recommendations are recommendations.
- Humans approve final coordination plans.
- DigInSync does not automatically authorize construction.
- DigInSync does not automatically modify government schedules.
- Clearly distinguish public data, user input, predictions, and AI recommendations.
- Do not expose unnecessary personal information.
- Keep an audit trail of recommendations and approvals.

---

# 29. IBM Bob Development Strategy

IBM Bob should be used meaningfully throughout development.

Use Bob for:

1. Requirements analysis
2. Architecture
3. Project scaffolding
4. Database schema
5. API implementation
6. Public-data ingestion
7. PostGIS queries
8. Conflict engine
9. ML pipeline
10. Agent implementation
11. Frontend
12. Testing
13. Security review
14. Deployment configuration
15. Deployment troubleshooting
16. Documentation

Maintain a **Bob Development Journal** containing useful prompts, screenshots, generated code, test results, and important decisions.

Suggested hackathon story:

> **DigInSync coordinates Bengaluru's infrastructure. IBM Bob coordinated the development of DigInSync.**

Important distinction:

- IBM Bob helps us BUILD DigInSync.
- DigInSync's runtime agents help infrastructure stakeholders coordinate projects.

---

# 30. Recommended IBM Bob Development Sequence

Do not ask Bob to implement the entire project in one step.

Implement incrementally.

## Phase 1 — Architecture and scaffolding

Create:

- Repository
- Frontend
- Backend
- Database configuration
- Basic deployment configuration
- Environment handling

## Phase 2 — Data foundation

Implement:

- Dataset ingestion
- Cleaning
- Normalization
- PostGIS loading
- Spatial indexes

## Phase 3 — Conflict engine

Implement:

- Project model
- Road matching
- Spatial conflict
- Temporal conflict
- Impact conflict
- Conflict scoring

## Phase 4 — ML

Implement:

- Feature pipeline
- Training script
- Evaluation
- Model artifact
- Inference endpoint

## Phase 5 — Project Intelligence Agent

Implement:

- Natural-language extraction
- Structured JSON
- Validation
- Confirmation UI

## Phase 6 — Coordination Agent

Implement:

- Backend tools
- Tool calling
- Conflict explanation
- Coordination options

## Phase 7 — What-if simulation

Implement:

- Date changes
- Schedule changes
- Risk recalculation
- Conflict recalculation

## Phase 8 — Human approval + Workplan

Implement:

- Approve/modify/reject
- Workplan generation
- Audit trail

## Phase 9 — Frontend polish

Implement:

- Map
- Dashboard
- Animations where useful
- Risk visualizations
- Clear UX

## Phase 10 — Deployment

Deploy:

- Frontend
- Backend
- Database
- ML model
- LLM integration

## Phase 11 — Testing and hardening

Test:

- API
- Database
- Spatial queries
- ML inference
- LLM failures
- Free-tier limits
- Deployment
- End-to-end demo

---

# 31. MVP Scope — Do NOT Overbuild

Do NOT build:

- Complex authentication
- Mobile application
- Blockchain
- IoT integration
- Satellite imagery
- Full digital twin
- Real-time city traffic prediction
- Dozens of AI agents
- Deep neural network
- Huge data warehouse
- Automated government approvals
- Complex microservice architecture

Focus on:

```text
Natural language project
        ↓
Real Bengaluru data
        ↓
PostGIS conflict detection
        ↓
ML disruption prediction
        ↓
AI coordination
        ↓
Human approval
        ↓
Joint workplan
        ↓
DEPLOYED LIVE APPLICATION
```

---

# 32. Definition of Done

The MVP is complete when a user can:

1. Open a public DigInSync URL.
2. Enter a project in natural language.
3. See extracted project details.
4. Confirm/edit the details.
5. See the relevant location on a map.
6. See relevant Bengaluru public-data context.
7. See detected conflicts.
8. See an ML-generated disruption-risk score.
9. Receive AI coordination options.
10. Change a schedule using the what-if simulator.
11. See risk/conflict values update.
12. Approve a recommendation.
13. Receive a joint workplan.
14. View measurable impact metrics.
15. Use the application without local setup.

---

# 33. Final Product Positioning

### Problem

> Bengaluru doesn't just have a traffic problem. It has a coordination problem.

### Product

> DigInSync uses real Bengaluru data, GIS, machine learning, and agentic AI to coordinate infrastructure work before the road is dug.

### Differentiator

> Instead of detecting problems after projects begin, DigInSync identifies conflicts before or during planning and proposes coordinated execution.

### Brand

**DigInSync**

> **One plan. Multiple infrastructure works. One coordinated execution.**

### Technical story

```text
Real public data
      +
PostgreSQL/PostGIS
      +
Deterministic conflict engine
      +
ML disruption prediction
      +
Agentic AI coordination
      +
Human approval
      +
Live cloud deployment
```

This is the core architecture to implement with IBM Bob.
