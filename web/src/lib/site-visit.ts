// Content for /site-visit: evidence for the Fall Agile Site Visit rubric.
// Sources: Progress Report 1 (Nov 8, 2026), the Git history and GitHub pull requests of this repository,
// and the test runs recorded in TEST_RUNS below. Update SNAPSHOT_DATE and the numbers when they change.

export const SNAPSHOT_DATE = "Nov 13, 2026";

export const LINKS = {
  repo: "https://github.com/eszain/project12_code",
  live: "https://project12-code.vercel.app",
  board: "https://github.com/users/eszain/projects/1",
  pulls: "https://github.com/eszain/project12_code/pulls?q=is%3Apr",
  issues: "https://github.com/eszain/project12_code/issues?q=is%3Aissue",
  tags: "https://github.com/eszain/project12_code/tags",
};

export type Status = "met" | "partial" | "gap";
export const STATUS_LABEL: Record<Status, string> = { met: "Evidence ready", partial: "Partly evidenced", gap: "Open gap" };

/** One phrase of the rubric's Excellent descriptor, and what we show for it. */
export interface Claim {
  asks: string;
  evidence: string;
  status: Status;
}

export interface Criterion {
  id: string;
  n: number;
  title: string;
  short: string;
  weight: number;
  excellent: string;
  claims: Claim[];
  open: string[];
}

export const CRITERIA: Criterion[] = [
  {
    id: "objectives",
    n: 1,
    title: "Project objectives, needs and problem statement",
    short: "Objectives and problem",
    weight: 10,
    excellent: "Clear objectives, well-defined problem and measurable intended outcomes tied to user needs.",
    claims: [
      { asks: "Clear objectives", evidence: "Eight objectives, O1 to O8, each with the evidence that will show it is met.", status: "met" },
      { asks: "Well-defined problem", evidence: "One problem statement, backed by the six sample CDMs that look like one event but are two passes 90 minutes apart.", status: "met" },
      { asks: "Measurable intended outcomes", evidence: "Three key performance parameters with numbers (5 minutes, 10 seconds, agreed Pc tolerance). The targets are ours and still need CSA approval.", status: "partial" },
      { asks: "Tied to user needs", evidence: "Five needs, P1 to P5, taken from CSA's stakeholder scenarios. Each objective names the needs it serves.", status: "met" },
    ],
    open: ["Get CSA to confirm the 5-minute and 10-second targets and the Pc tolerance (open decisions 3 and 5)."],
  },
  {
    id: "stakeholders",
    n: 2,
    title: "Stakeholders and market / solution justification",
    short: "Stakeholders and market",
    weight: 10,
    excellent: "Stakeholder interests and participation are understood; alternatives and project value are evidenced.",
    claims: [
      { asks: "Stakeholder interests understood", evidence: "Nine stakeholders with their interests and needs, ranked on a power-interest grid.", status: "met" },
      { asks: "Stakeholder participation", evidence: "Dated meetings with the supervisor and CSA. Each one changed the backlog: see the participation log.", status: "met" },
      { asks: "Alternatives evidenced", evidence: "Eight existing products and services compared, plus five design trade-offs with the option we rejected.", status: "met" },
      { asks: "Project value evidenced", evidence: "CSA receives each event as an Excel file by email, one tab per CDM. No reviewed service gives one web view of an event's history with access control.", status: "met" },
    ],
    open: ["The power-interest ranking is our first estimate. Confirm it with CSA and the supervisor."],
  },
  {
    id: "requirements",
    n: 3,
    title: "User stories, non-functional requirements and acceptance criteria",
    short: "Stories, NFRs and AC",
    weight: 15,
    excellent: "Prioritized, testable user stories and nonfunctional requirements with acceptance criteria and traceable coverage.",
    claims: [
      { asks: "Prioritized user stories", evidence: "14 stories in 8 epics, each with a MoSCoW priority, source and target release.", status: "met" },
      { asks: "Testable", evidence: "Six acceptance criteria written as Given / Then. Three already have an automated test named after the criterion, and two more are covered in part or in full.", status: "met" },
      { asks: "Non-functional requirements", evidence: "Ten NFRs with a verification method and target sprint. Thresholds are initial targets, not yet approved by CSA.", status: "partial" },
      { asks: "Traceable coverage", evidence: "18 functional requirements traced to stories, objectives, method, sprint and evidence. Story status below is linked to tests and releases.", status: "met" },
    ],
    open: ["AC04 (access control) has no test yet because accounts are planned for R2.", "NFR thresholds need CSA sign-off."],
  },
  {
    id: "architecture",
    n: 4,
    title: "Architecture, as-built design and technical progress",
    short: "Architecture and progress",
    weight: 20,
    excellent: "Working increment or credible demonstration; current architecture/UML and implementation evidence match the as-built system.",
    claims: [
      { asks: "Working increment or credible demonstration", evidence: "Four tagged releases since Nov 6. v0.3 beta is live on Vercel and can be demonstrated during the visit.", status: "met" },
      { asks: "Current architecture and UML", evidence: "As-built component, class, sequence and state diagrams, drawn from the code on Nov 13. PlantUML sources are in docs/diagrams.", status: "met" },
      { asks: "Match the as-built system", evidence: "A design-against-built table lists every place where the system differs from the proposed design in Progress Report 1, and why.", status: "met" },
      { asks: "Implementation evidence", evidence: "Each increment is linked to its Git tag and pull requests. Automated tests cover the domain logic.", status: "met" },
    ],
    open: [
      "The recalculated Pc is not yet validated against NASA CARA reference cases (R2).",
      "Accounts, organizations and API authentication are not built (R2).",
      "PostgreSQL is supported by URL in the Python app but not tested. The web app stores data in the browser.",
    ],
  },
  {
    id: "roadmap",
    n: 5,
    title: "Roadmap, release planning and backlog management",
    short: "Roadmap and backlog",
    weight: 10,
    excellent: "Realistic feature roadmap, release timeline, prioritized backlog and visible progress against planned increments.",
    claims: [
      { asks: "Realistic feature roadmap", evidence: "Eight epics mapped to features, priority and target release.", status: "met" },
      { asks: "Release timeline", evidence: "Five releases, R0 to R4, on a week-by-week Gantt chart ending on Capstone Day, April 29, 2027.", status: "met" },
      { asks: "Prioritized backlog", evidence: "26 backlog items with story links, relative size, target release and current status.", status: "met" },
      { asks: "Visible progress against planned increments", evidence: "R0 is complete. 7 of the 8 R1 backlog items are delivered and the last is in progress, five weeks before the planned Fall MVP demo.", status: "met" },
    ],
    open: ["The Fall MVP demo date (Dec 18) is still to be confirmed.", "The GitHub issues for merged v0.3 work are still open and need closing or re-scoping."],
  },
  {
    id: "quality",
    n: 6,
    title: "Testing, configuration management and quality evidence",
    short: "Testing and CM",
    weight: 15,
    excellent: "Version-controlled work, repeatable build, meaningful tests and evidence of requirements coverage and defect tracking.",
    claims: [
      { asks: "Version-controlled work", evidence: "One Git repository, feature branches, pull requests into main, and a tag for every release.", status: "met" },
      { asks: "Repeatable build", evidence: "Documented commands build and test both apps with no credentials. Vercel builds main on every merge.", status: "met" },
      { asks: "Meaningful tests", evidence: "Automated web tests and Python tests. Tests are named after the acceptance criteria and check the port against the Python results.", status: "met" },
      { asks: "Requirements coverage", evidence: "A coverage table maps each acceptance criterion to the tests that check it.", status: "partial" },
      { asks: "Defect tracking", evidence: "Defects are fixed on fix/ branches through pull requests. Features are tracked as GitHub issues with owners.", status: "partial" },
    ],
    open: [
      "No CI yet: tests run on each developer's machine. GitHub Actions is a Sprint 4 retrospective action.",
      "The main branch is not protected and no pull request has a recorded GitHub review.",
      "Defects found by tests are not yet logged as GitHub issues with a bug label.",
    ],
  },
  {
    id: "agile",
    n: 7,
    title: "Agile sprint execution and team ownership",
    short: "Sprints and ownership",
    weight: 15,
    excellent: "Sprint planning, daily coordination, reviews and retrospectives evidenced; team members own work and act on feedback.",
    claims: [
      { asks: "Sprint planning", evidence: "Sprint goals, selected backlog items, capacity and owners for Sprints 1 to 4.", status: "met" },
      { asks: "Daily coordination", evidence: "Stand-ups three times a week on Discord, with logged blockers and how each was resolved.", status: "met" },
      { asks: "Reviews", evidence: "Sprint reviews with CSA and the supervisor on Nov 6 and Nov 11, with the feedback recorded.", status: "met" },
      { asks: "Retrospectives", evidence: "Sprint 3 retrospective with three actions and their current state.", status: "partial" },
      { asks: "Team members own work", evidence: "Every v0.3 issue has one owner, and all six members have merged pull requests.", status: "met" },
      { asks: "Act on feedback", evidence: "CSA's Nov 6 feedback became an 18-item checklist: 17 done and 1 partly done within a week.", status: "met" },
    ],
    open: ["Two of three Sprint 3 retrospective actions are still open (GitHub Actions, planning poker).", "Keep stand-up notes for Sprint 4 in the repository or the board so they can be shown."],
  },
  {
    id: "impact",
    n: 8,
    title: "UDL, sustainability, safety and consequences",
    short: "UDL and consequences",
    weight: 5,
    excellent: "Accessibility/UDL and relevant sustainability, privacy, safety and social consequences are considered and inform decisions.",
    claims: [
      { asks: "Accessibility / UDL considered", evidence: "The seven Universal Design principles mapped to design actions, each with what is already built.", status: "partial" },
      { asks: "Sustainability", evidence: "Four UN Sustainable Development Goals linked to design actions and evidence.", status: "met" },
      { asks: "Privacy and safety", evidence: "No data leaves the browser, no credentials in the repository, and CADS never commands a spacecraft.", status: "met" },
      { asks: "Inform decisions", evidence: "Six design decisions that were made because of these concerns, with the release or pull request where each landed.", status: "met" },
    ],
    open: ["No WCAG 2.1 AA audit has been run yet (backlog item B25).", "Cross-organization access tests wait for accounts in R2 (backlog item B26)."],
  },
];

// ---------------------------------------------------------------- 1. Objectives

export const PROBLEM_STATEMENT =
  "How can we help satellite operators and flight dynamics analysts spot the close passes that matter, understand how the risk changes, and compare ways to avoid a collision accurately and efficiently, while keeping the data intact and secure, and leaving every decision to a person?";

export const PROBLEM_POINTS = [
  ["Telling passes apart", "Several messages can describe one pass, and the same two objects can have separate passes."],
  ["Risk that keeps changing", "Pc, uncertainties and covariances change with every message, so trend history matters."],
  ["Limited time", "The closer the pass, the faster it has to be reviewed."],
  ["Understanding the numbers", "A risk value only makes sense next to its uncertainty, radial separation and observation age."],
  ["Safe and traceable data", "Mission data can be restricted, and every decision must trace back to its source."],
];

export type Progress = "Verified" | "Built" | "Prototype" | "In progress" | "Planned";

export const OBJECTIVES: { id: string; objective: string; evidence: string; needs: string; now: Progress; note: string }[] = [
  { id: "O1", objective: "Preserve the integrity of incoming conjunction data.", evidence: "Tests comparing imported values with the six source CDMs.", needs: "P1, P2", now: "Verified", note: "Pc text is kept exactly; zero stays distinct (AC02 test)." },
  { id: "O2", objective: "Distinguish separate encounters from successive updates to the same encounter.", evidence: "The six samples split into two encounters, with history kept.", needs: "P1", now: "Verified", note: "Passes in all 720 file orders (AC01 test)." },
  { id: "O3", objective: "Make changes in encounter conditions understandable.", evidence: "Demo of encounter details, time to TCA, miss distance, Pc and data quality.", needs: "P1, P2", now: "Built", note: "Operator and specialist views, CDM history, trend charts, near-miss player." },
  { id: "O4", objective: "Support configurable monitoring and notifications.", evidence: "Acceptance tests for filters, alerts, notifications and failures.", needs: "P5", now: "Built", note: "Rule editor, outbox, mute and snooze. Delivery is a local simulation." },
  { id: "O5", objective: "Establish confidence in scientific risk calculations.", evidence: "Match with CSA-approved reference cases within an agreed tolerance.", needs: "P2", now: "Prototype", note: "Our 2D Pc matches the source Pc within 1% on three synthetic CDMs. Not validated against CARA." },
  { id: "O6", objective: "Support evaluation of potential maneuver alternatives.", evidence: "Reviewed scenario demo with stated assumptions and criteria.", needs: "P2", now: "Prototype", note: "Impulsive trade study exists in code with assumptions and limits. Not on screen yet." },
  { id: "O7", objective: "Support controlled information exchange.", evidence: "Interface documentation and access-control tests.", needs: "P3, P4", now: "Planned", note: "The Python REST API exists without authentication. Access control is R2." },
  { id: "O8", objective: "Deliver a maintainable capstone product.", evidence: "Source code, repeatable tests, documentation, open-source licence.", needs: "All", now: "In progress", note: "Repository, README and tests exist. Licence is an open decision for CSA." },
];

export const NEEDS: { id: string; who: string; story: string }[] = [
  { id: "P1", who: "On-call operator", story: "I want to identify serious conjunction warnings and see how their risk has changed over time so that I can prioritize events for review." },
  { id: "P2", who: "Flight dynamics analyst", story: "I want to evaluate maneuver alternatives against a collision-probability threshold so that I can compare potential mitigation options." },
  { id: "P3", who: "Ground-system developer", story: "I want to exchange conjunction and proposed maneuver-plan information through an API so that systems can interoperate." },
  { id: "P4", who: "Organization administrator", story: "I want satellite information restricted to authorized users so that other organizations cannot access it." },
  { id: "P5", who: "Operator", story: "I want to configure retrieval filters and alert conditions so that warnings reflect the monitoring criteria relevant to my responsibilities." },
];

export const KPPS: { name: string; target: string; req: string; how: string }[] = [
  { name: "Ingestion-to-display latency", target: "< 5 min", req: "NFR02", how: "Time from CDM retrieval to dashboard display or alert queueing." },
  { name: "Operator comprehension speed", target: "< 10 s", req: "NFR06", how: "Time for an operator to find the critical values in a supervised usability check." },
  { name: "Scientific calculation accuracy", target: "Agreed tolerance", req: "NFR03", how: "Calculated Pc against CSA-approved reference benchmarks." },
];

// ---------------------------------------------------------------- 2. Stakeholders

export const STAKEHOLDERS: { rank: number; who: string; needs: string; engage: string }[] = [
  { rank: 1, who: "CSA project sponsor and technical contact", needs: "Sets scope, expectations, acceptance criteria and handover requirements.", engage: "Manage closely" },
  { rank: 2, who: "Faculty supervisor and ENG 4000 course staff", needs: "Assess technical quality, progress and deliverables.", engage: "Manage closely" },
  { rank: 3, who: "On-call operator (John)", needs: "Spot urgent encounters, follow changes, and know what needs investigation.", engage: "Keep informed" },
  { rank: 4, who: "Flight dynamics analyst (Sally)", needs: "Detailed data, trustworthy risk numbers and maneuver comparison.", engage: "Keep informed" },
  { rank: 5, who: "Ground-system developer (Casey)", needs: "Documented interfaces for event and maneuver-plan data.", engage: "Keep informed" },
  { rank: 6, who: "Organization administrator", needs: "Access permissions and protection of its own satellite data.", engage: "Keep informed" },
  { rank: 7, who: "CSA management and operational reviewers", needs: "Traceable decisions and clear authority over maneuvers.", engage: "Keep satisfied" },
  { rank: 8, who: "Space-Track, TraCSS and other data providers", needs: "Set data formats, access conditions and redistribution rules.", engage: "Keep satisfied" },
  { rank: 9, who: "Wider space community and public", needs: "Responsible space operations and less orbital debris.", engage: "Monitor" },
];

/** Power-interest grid: rows are power (high to low), columns are interest (low to high). */
export const POWER_INTEREST: { power: string; cells: { label: string; ranks: number[] }[] }[] = [
  { power: "Higher power", cells: [{ label: "Keep satisfied", ranks: [8] }, { label: "Keep satisfied", ranks: [7] }, { label: "Manage closely", ranks: [1, 2] }] },
  { power: "Medium power", cells: [{ label: "", ranks: [] }, { label: "", ranks: [] }, { label: "Keep informed", ranks: [3, 4, 5, 6] }] },
  { power: "Lower power", cells: [{ label: "", ranks: [] }, { label: "Monitor and consider", ranks: [9] }, { label: "", ranks: [] }] },
];

export const PARTICIPATION: { date: string; who: string; what: string; result: string }[] = [
  { date: "Oct 5, 2026", who: "Prof. Regina Lee (supervisor)", what: "Kick-off. Agile chosen as the method.", result: "Research the domain first, then bring CSA proposed options, not open questions." },
  { date: "Oct 22, 2026", who: "CSA (email)", what: "Four stakeholder scenarios and planning context.", result: "Became needs P1 to P5 and the 14 user stories." },
  { date: "Oct 23, 2026", who: "Prof. Regina Lee", what: "Reviewed research and the questions for CSA.", result: "Questions narrowed to users, workflow, filters, alerts, maneuver analysis and minimum scope." },
  { date: "Nov 6, 2026", who: "Patrick (CSA), Prof. Regina Lee", what: "MVP demonstration and sprint review.", result: "Eight pieces of feedback, turned into an 18-item checklist. 17 done, 1 partly done by Nov 12." },
  { date: "Nov 11, 2026", who: "Prof. Regina Lee", what: "Demo of v0.2 with operator and specialist views.", result: "Asked for a big-picture view, a visual of a conjunction and a way to browse many events. Delivered as /vision and the v0.3 dashboard." },
];

export const MARKET: { product: string; does: string; relevance: string }[] = [
  { product: "CSA CRAMS", does: "Pre-analysis, risk assessment, maneuver evaluation, reporting", relevance: "Main reference for CSA's workflow" },
  { product: "Space-Track", does: "Catalog and conjunction data for authorized users", relevance: "Possible data source; restricted access" },
  { product: "TraCSS", does: "U.S. civil space-traffic coordination", relevance: "Possible data source or integration reference" },
  { product: "SOCRATES Plus", does: "Searchable close-approach predictions", relevance: "Reference for presenting and searching events" },
  { product: "Kayhan Space Satcat", does: "Commercial space-traffic management", relevance: "Comparator for workflows and integration" },
  { product: "LeoLabs LeoSafe", does: "Commercial monitoring, alerts and analytics", relevance: "Comparator for alerting and risk display" },
  { product: "EU SST", does: "Collision-avoidance services for member users", relevance: "Reference for service delivery" },
  { product: "NASA CARA tools", does: "Conjunction-assessment guidance and software", relevance: "Source of methods and test cases" },
];

export const TRADEOFFS: { area: string; chosen: string; rejected: string; why: string }[] = [
  { area: "Pc calculation", chosen: "NASA CARA open-source tools", rejected: "Custom mathematical derivation", why: "Avoids re-deriving complex methods; flight-proven; recommended by CSA." },
  { area: "Visualization", chosen: "2D/3D encounter and trade-space plots", rejected: "Tables only", why: "Plots make uncertainty and maneuver options easier to grasp." },
  { area: "App structure", chosen: "Modular web app", rejected: "Desktop GUI application", why: "No installation; works across platforms and teams." },
  { area: "Data source", chosen: "ESA synthetic CDM datasets", rejected: "Live Space-Track operational feed", why: "Respects data restrictions while giving realistic test cases." },
  { area: "Operator view", chosen: "Two views: operator and specialist", rejected: "One unified interface", why: "Operators see only key numbers; specialists get full detail." },
];

export const RISKS: { risk: string; effect: string; response: string }[] = [
  { risk: "Real catalog data is restricted", effect: "Cannot test on live data", response: "Use CSA-provided synthetic data" },
  { risk: "Encounter grouping is wrong", effect: "Passes merged or split", response: "Explicit grouping rules, tested on samples and extra fixtures" },
  { risk: "No reference data for calculations", effect: "Results cannot be validated", response: "Agree reference method and criteria with CSA first" },
  { risk: "Maneuver scope unclear", effect: "Unrealistic target", response: "Agree inputs, fidelity and outputs early" },
  { risk: "Deployment needs unknown", effect: "Architecture changes", response: "Clarify ownership, access and hosting early" },
];

// ---------------------------------------------------------------- 3. Requirements

export const EPICS: Record<string, string> = {
  E1: "Data integrity and encounter identification",
  E2: "Operator monitoring",
  E3: "Alerts",
  E4: "Scientific assessment",
  E5: "Maneuver evaluation",
  E6: "Interoperability",
  E7: "Privacy and audit",
  E8: "Quality and handover",
};

export const STORIES: { id: string; epic: string; story: string; source: string; priority: "Must" | "Should"; ac: string; release: string; now: Progress; evidence: string }[] = [
  { id: "US01", epic: "E1", story: "Import valid CDMs and identify invalid input.", source: "CSA", priority: "Must", ac: "AC02", release: "R1", now: "Verified", evidence: "Parser and invalid-input tests (web and Python)" },
  { id: "US02", epic: "E1", story: "Associate successive CDMs with the correct encounter.", source: "CSA", priority: "Must", ac: "AC01", release: "R1", now: "Verified", evidence: "Six samples form two encounters in every file order" },
  { id: "US03", epic: "E2", story: "View and sort encounters by TCA, risk and status.", source: "P1", priority: "Must", ac: "AC01", release: "R1", now: "Built", evidence: "Event list with search, filters and sort (v0.2.5, v0.3)" },
  { id: "US04", epic: "E2", story: "Review risk and miss-distance trends across revisions.", source: "P1", priority: "Must", ac: "AC02", release: "R1", now: "Built", evidence: "CDM history table and trend charts (v0.2)" },
  { id: "US05", epic: "E3", story: "Configure retrieval criteria and alert thresholds.", source: "P5", priority: "Must", ac: "AC03", release: "R1", now: "Built", evidence: "Rule editor with change history (v0.3)" },
  { id: "US06", epic: "E3", story: "Receive notifications and inspect delivery outcomes.", source: "P5", priority: "Must", ac: "AC03", release: "R1 to R3", now: "Prototype", evidence: "Outbox with status, retry, mute and snooze. Delivery is simulated locally" },
  { id: "US07", epic: "E4", story: "Inspect source data, uncertainty and risk provenance.", source: "P2", priority: "Must", ac: "AC02", release: "R1", now: "Built", evidence: "Specialist view, original CDM fields, 'How this was calculated'" },
  { id: "US08", epic: "E5", story: "Compare maneuver scenarios using an agreed method.", source: "P2", priority: "Must", ac: "AC05", release: "R2 to R3", now: "Prototype", evidence: "Trade-study code and API endpoint; method not agreed with CSA" },
  { id: "US09", epic: "E4", story: "Validate calculations against reference cases.", source: "CSA", priority: "Must", ac: "AC02", release: "R2", now: "Planned", evidence: "CARA review written (docs/cara-review.md); validation not started" },
  { id: "US10", epic: "E6", story: "Exchange event and maneuver-plan data through an API.", source: "P3", priority: "Must", ac: "AC05", release: "R2", now: "Prototype", evidence: "Python REST API with OpenAPI docs; no authentication yet" },
  { id: "US11", epic: "E7", story: "Enforce organization-level and role-based access.", source: "P4", priority: "Must", ac: "AC04", release: "R2", now: "Planned", evidence: "Design only" },
  { id: "US12", epic: "E7", story: "Close events with a recorded reason.", source: "CSA", priority: "Should", ac: "None", release: "R2 to R3", now: "Prototype", evidence: "Archive and restore in the web app; status endpoint with audit entry in Python" },
  { id: "US13", epic: "E8", story: "Access setup, API and schema documentation.", source: "CSA", priority: "Must", ac: "AC06", release: "Every release", now: "In progress", evidence: "README, docs/data-model.md, fixtures PROVENANCE.md" },
  { id: "US14", epic: "E8", story: "Inspect retrieval, processing and notification failures.", source: "Course guidelines", priority: "Must", ac: "AC03", release: "Every release", now: "Built", evidence: "Import report with reject reasons; delivery log per outbox entry" },
];

export const NFRS: { id: string; text: string; method: string; when: string }[] = [
  { id: "NFR01", text: "Preserve numerical meaning, timestamps, units, and the distinction between source zero and very small positive Pc values.", method: "Test, Inspection", when: "R1 (Sprint 3)" },
  { id: "NFR02", text: "At most five minutes between successful message retrieval and appearance in the interface or queuing of a matching test alert.", method: "Test", when: "R1 (Sprint 5)" },
  { id: "NFR03", text: "Recalculated Pc values agree with a CSA-approved reference within an agreed numerical tolerance.", method: "Test, Analysis", when: "R2 (Sprint 6)" },
  { id: "NFR04", text: "Deny unauthorized cross-organization access and keep credentials out of source code.", method: "Test, Inspection", when: "R2 (Sprint 7)" },
  { id: "NFR05", text: "Record recoverable catalog and notification failures without losing successfully ingested messages.", method: "Test", when: "R1 (Sprint 5)" },
  { id: "NFR06", text: "A basic operator risk-comprehension task completes within ten seconds in a supervised usability test.", method: "Demonstration", when: "R3 (Sprint 8)" },
  { id: "NFR07", text: "Support keyboard navigation, meaningful labels, and urgency indicators that do not rely on colour alone.", method: "Inspection, Test", when: "R3 (Sprint 8)" },
  { id: "NFR08", text: "Allow an additional supported source format to be integrated without rewriting the event-domain logic.", method: "Inspection", when: "R4 (Sprint 9)" },
  { id: "NFR09", text: "Support a repeatable deployment using documented configuration in an approved environment.", method: "Demonstration", when: "R4 (Sprint 9)" },
  { id: "NFR10", text: "Maintain traceability from alerts and calculated values to their source messages, methods and timestamps.", method: "Test, Inspection", when: "R1 to R3" },
];

export const ACCEPTANCE: { id: string; name: string; text: string; tests: string[]; status: Status }[] = [
  { id: "AC01", name: "Encounter identification", text: "Given the six supplied CDMs in any file order, the system must identify two distinct close approaches and associate the appropriate messages with each encounter.", tests: ["tests/test_mvp.py: test_ac01_two_encounters_in_every_file_order", "web: lib/cads/cads.test.ts (grouping, one-at-a-time loading)"], status: "met" },
  { id: "AC02", name: "Numerical integrity", text: "Given source Pc values of 1.009416 × 10⁻⁶, 7.665263 × 10⁻⁹ and zero, the displayed details and exports must preserve their original numerical meaning.", tests: ["tests/test_mvp.py: test_ac02_pc_text_preserved_and_zero_distinct", "web: a Pc of 0 is shown as 'less than 0.0000001%', never '0%' (pull request #19)"], status: "met" },
  { id: "AC03", name: "Alert evaluation", text: "Given an agreed alert rule, qualifying updates must create traceable notification occurrences. Non-qualifying updates must not generate additional alerts, and retries must not silently create duplicate notifications.", tests: ["tests/test_mvp.py: test_ac03_alerts_match_only_qualifying_no_duplicates_and_retry", "tests/test_mvp.py: test_failed_delivery_is_retried_then_recorded", "web: lib/cads/outbox.test.ts, mute-snooze.test.ts"], status: "met" },
  { id: "AC04", name: "Access control", text: "A user from one organization must not be able to retrieve or modify an event belonging to another organization without authorization.", tests: ["No test yet. Accounts and organizations are planned for R2 (backlog B19, B26)."], status: "gap" },
  { id: "AC05", name: "Maneuver analysis", text: "Given an approved baseline and two maneuver candidates, the comparison must show the assumptions, calculated outputs, applicable threshold and limitations. It must not issue spacecraft commands.", tests: ["tests/test_mvp.py: test_maneuver_trade_study_is_decision_support_only", "Baseline and method are not yet approved by CSA."], status: "partial" },
  { id: "AC06", name: "Reproducibility", text: "A developer following the setup documentation must be able to load the sample data, run the automated tests, and reproduce the demonstration without production credentials.", tests: ["tests/test_mvp.py: test_empty_start_then_load_analyze_reset", "README run steps, repeated on a clean checkout for this page"], status: "met" },
];

export const FRS: { id: string; text: string; links: string; method: string; when: string }[] = [
  { id: "FR01", text: "Import the six supplied CDM JSON messages, validate required fields, and preserve the original payload.", links: "US01, O1", method: "Test, Inspection", when: "R1 (Sprint 2)" },
  { id: "FR02", text: "Define an adapter interface for retrieving authorized CDMs using agreed filters.", links: "US01, US05", method: "Test, Demonstration", when: "R1 (Sprint 3)" },
  { id: "FR03", text: "Associate messages with encounters and preserve all revisions and timestamps.", links: "US02, O2", method: "Test, Analysis", when: "R1 (Sprint 3)" },
  { id: "FR04", text: "Display frontline details for console operators and detailed specialist subpages with covariances and miss-distance breakdowns.", links: "US03, US07, O3", method: "Test, Demonstration", when: "R1 (Sprint 4)" },
  { id: "FR05", text: "Display time-ordered risk and miss-distance trends.", links: "US04, O2", method: "Test, Demonstration", when: "R1 (Sprint 4)" },
  { id: "FR06", text: "Support sorting and filtering by spacecraft, TCA, Pc and event status.", links: "US03, US05", method: "Test", when: "R1 (Sprint 4)" },
  { id: "FR07", text: "Allow authorized users to configure alert conditions and retain configuration history.", links: "US05, O4", method: "Test, Inspection", when: "R1 (Sprint 5)" },
  { id: "FR08", text: "Evaluate alert rules and support approved notification channels.", links: "US06, O4", method: "Test, Demonstration", when: "R1 (Sprint 5)" },
  { id: "FR09", text: "Record notification attempts, failures and retries.", links: "US06, US14", method: "Test, Inspection", when: "R1 (Sprint 5)" },
  { id: "FR10", text: "Identify the source and calculation method for displayed risk values.", links: "US07, O3, O5", method: "Test, Inspection", when: "R2 (Sprint 6)" },
  { id: "FR11", text: "Integrate NASA CARA open-source toolsets for Pc and maneuver calculations, validated against CSA reference data.", links: "US09, O5", method: "Analysis, Test", when: "R2 (Sprint 6)" },
  { id: "FR12", text: "Compare maneuver scenarios using agreed inputs, assumptions and acceptance criteria.", links: "US08, O6", method: "Analysis, Demonstration", when: "R2 (Sprint 7)" },
  { id: "FR13", text: "Provide documented, authenticated APIs for event and proposed maneuver-plan exchange.", links: "US10, O7", method: "Test, Inspection", when: "R2 (Sprint 7)" },
  { id: "FR14", text: "Enforce authentication, organization boundaries and role permissions.", links: "US11, O7", method: "Test, Inspection", when: "R2 (Sprint 7)" },
  { id: "FR15", text: "Record event dispositions and relevant configuration changes with user and timestamp.", links: "US12, O2, O4", method: "Test, Inspection", when: "R3 (Sprint 8)" },
  { id: "FR16", text: "Export event summaries with units, identifiers, source references and caveats.", links: "US07, US12", method: "Test, Inspection", when: "R3 (Sprint 8)" },
  { id: "FR17", text: "Identify malformed or incomplete inputs and report processing failures.", links: "US01, US14", method: "Test, Inspection", when: "R1 to R3" },
  { id: "FR18", text: "Provide source code, an approved licence, setup instructions, API documentation and repeatable tests.", links: "US13, O8", method: "Inspection, Demonstration", when: "R4 (Sprint 9)" },
];

// ---------------------------------------------------------------- 4. Architecture

export interface Diagram {
  id: string;
  title: string;
  src: string;
  alt: string;
  caption: string;
  kind: "as-built" | "proposed";
  source: string;
}

export const DIAGRAMS: Record<string, Diagram> = {
  asBuiltArchitecture: {
    id: "as-built-architecture",
    title: "As-built architecture",
    src: "/site-visit/as-built-architecture.svg",
    alt: "Component diagram. The web app on Vercel has Next.js routes, TypeScript domain logic (parser, correlation, store, severity and risk checks, experimental Pc and maneuver, outbox) and IndexedDB storage. The Python reference app has a FastAPI REST API, ingestion, alerts and analysis modules, and a SQLite database. The TypeScript logic is a port of the Python rules.",
    caption: "What runs today. The deployed web app does everything in the browser tab. The Python app is the reference implementation and the path to a real backend.",
    kind: "as-built",
    source: "docs/diagrams/as-built-architecture.puml",
  },
  proposedArchitecture: {
    id: "proposed-architecture",
    title: "Proposed architecture (Progress Report 1)",
    src: "/site-visit/report-architecture.png",
    alt: "Layered diagram: data sources feed Python backend services (CDM ingestion and validation, event correlation, risk and maneuver analysis, alert processing), which use PostgreSQL and FastAPI, which serve a React and Next.js web interface.",
    caption: "Figure 6.3.1 from Progress Report 1. This is the target design for R2 onward.",
    kind: "proposed",
    source: "Progress Report 1, Figure 6.3.1",
  },
  domainModel: {
    id: "as-built-domain-model",
    title: "As-built class diagram",
    src: "/site-visit/as-built-domain-model.svg",
    alt: "UML class diagram of the web app's domain model. A Store holds events, alert rules, alert occurrences and rule changes. A CdmEvent contains one or more Revisions, each wrapping one NormalizedCdm with two ObjectInfo records. AlertOccurrence refers to a rule, an event and a revision, and has at most one OutboxEntry. EventPersistence is an interface implemented by IndexedDbEventPersistence.",
    caption: "Classes and types in web/src/lib/cads. One CdmEvent holds one or more Revisions, which is how an update is told apart from a new pass.",
    kind: "as-built",
    source: "docs/diagrams/as-built-domain-model.puml",
  },
  proposedClass: {
    id: "proposed-class",
    title: "Preliminary class diagram (Progress Report 1)",
    src: "/site-visit/report-class-diagram.png",
    alt: "UML class diagram with User, Organization, Membership, ConjunctionEvent, CDMRevision, SpaceObject, AlertRule, AlertOccurrence, ManeuverScenario and AuditEntry.",
    caption: "Figure 6.3.3 from Progress Report 1. User, Organization and Membership are not built yet (R2).",
    kind: "proposed",
    source: "Progress Report 1, Figure 6.3.3",
  },
  sequence: {
    id: "ingest-sequence",
    title: "Sequence: CDM import to alert",
    src: "/site-visit/ingest-sequence.svg",
    alt: "UML sequence diagram. The operator loads CDMs in the dashboard. The Store parses each record, rejects invalid ones with reasons, skips duplicates, correlates valid ones with an existing or new event inside a 60 second window, adds a revision, evaluates alert rules and creates alert occurrences. The dashboard then enqueues alerts in the outbox, saves the session to IndexedDB and shows the event list.",
    caption: "What happens when CDMs are loaded, as implemented in store.ts and outbox.ts.",
    kind: "as-built",
    source: "docs/diagrams/ingest-sequence.puml",
  },
  states: {
    id: "outbox-states",
    title: "State diagram: notification delivery",
    src: "/site-visit/outbox-states.svg",
    alt: "UML state diagram of an outbox entry: pending goes to sent or failed, a failed entry returns to pending when the operator retries, and an entry becomes suppressed when its event is muted or snoozed.",
    caption: "Delivery states of an outbox entry. Every change is written to the entry's log.",
    kind: "as-built",
    source: "docs/diagrams/outbox-states.puml",
  },
  useCase: {
    id: "use-case",
    title: "Use case diagram",
    src: "/site-visit/report-use-case.png",
    alt: "UML use case diagram. Operator: monitor conjunction events, review event history, configure alert rules. Flight dynamics analyst: analyze collision risk, evaluate maneuver scenarios. Ground-system developer: retrieve event data and exchange maneuver plans via API. Organization administrator: manage users and roles. CSA reviewer: review validation and audit records.",
    caption: "Figure 6.3.4 from Progress Report 1. The operator and analyst use cases are built or prototyped; the API, administrator and reviewer use cases are R2.",
    kind: "proposed",
    source: "Progress Report 1, Figure 6.3.4",
  },
  gantt: {
    id: "gantt",
    title: "Week-by-week plan",
    src: "/site-visit/report-gantt.png",
    alt: "Gantt chart from Sep 28, 2026 to Apr 29, 2027 with milestones, the five releases R0 to R4 and backlog items B01 to B24 placed by week.",
    caption: "Figure 6.2.1 from Progress Report 1. Week placement inside each release is a planning estimate.",
    kind: "proposed",
    source: "Progress Report 1, Figure 6.2.1",
  },
  workflow: {
    id: "change-workflow",
    title: "Change workflow",
    src: "/site-visit/change-workflow.svg",
    alt: "UML activity diagram: a GitHub issue is assigned, a branch is made from main, work is committed with tests, tests and the build run locally, a pull request is opened and reviewed, it is merged to main, Vercel deploys, and release points are tagged.",
    caption: "How a change moves from an issue to a tagged release.",
    kind: "as-built",
    source: "docs/diagrams/change-workflow.puml",
  },
};

export const DESIGN_VS_BUILT: { area: string; designed: string; built: string; why: string; match: Status }[] = [
  { area: "Frontend", designed: "React, Next.js, TypeScript, Tailwind CSS", built: "Next.js 16, React 19, TypeScript, Tailwind CSS 4", why: "As designed.", match: "met" },
  { area: "Ingestion and validation", designed: "Python backend service", built: "Python module (cads/cdm) and a TypeScript port (parser.ts, kvn.ts)", why: "The port lets the demo run on Vercel's free tier with no server. Tests check it against the Python results.", match: "met" },
  { area: "Event correlation", designed: "Python backend service", built: "Same rule in Python and TypeScript: object pair plus a 60 s TCA window", why: "The 60 s window is our proposal, to confirm with CSA.", match: "met" },
  { area: "Database", designed: "PostgreSQL", built: "SQLite in the Python app; IndexedDB in the browser", why: "No hosting cost or credentials during the fall. The storage interface is ready for a PostgreSQL adapter.", match: "partial" },
  { area: "API", designed: "FastAPI REST with access control", built: "FastAPI REST with OpenAPI docs, no authentication", why: "Access control is scheduled for R2.", match: "partial" },
  { area: "Alerts", designed: "Alert processing with email and SMS", built: "Rules, outbox, retry, mute and snooze. Web delivery is simulated; Python has file and webhook channels", why: "A browser-only app cannot send email. CSA has not confirmed the channels.", match: "partial" },
  { area: "Risk and maneuver analysis", designed: "NASA CARA tools", built: "Own 2D Pc and impulsive trade study, labelled experimental", why: "Severity always comes from the source Pc. CARA validation is R2.", match: "partial" },
  { area: "Users and organizations", designed: "User, Organization, Membership", built: "Not built", why: "Scheduled for R2 (US11).", match: "gap" },
];

export const TECH_STACK: { layer: string; tech: string; why: string }[] = [
  { layer: "Frontend", tech: "React 19, Next.js 16, TypeScript, Tailwind CSS 4, shadcn and Animate UI components", why: "Browser-based access without installing software" },
  { layer: "Visuals", tech: "SVG with GSAP, three.js for the landing page", why: "Near-miss player and trend charts without a chart library" },
  { layer: "Backend", tech: "Python 3.10", why: "Team familiarity and strong scientific libraries" },
  { layer: "API", tech: "FastAPI", why: "Lightweight REST API and external integration" },
  { layer: "Storage", tech: "SQLite now, PostgreSQL planned; IndexedDB in the browser", why: "Data consistency and structured relationships" },
  { layer: "Tests", tech: "Vitest with Testing Library; pytest", why: "Fast unit and click-through tests in both codebases" },
  { layer: "Hosting", tech: "Vercel free tier", why: "Zero hosting cost for the fall term" },
];

export const INCREMENTS: { version: string; tag: string; date: string; sprint: string; title: string; delivered: string[]; evidence: string }[] = [
  {
    version: "v0.1",
    tag: "v0.1-nov6",
    date: "Nov 6, 2026",
    sprint: "Sprint 3",
    title: "MVP shown to CSA",
    delivered: ["Imports the six sample CDMs and rejects invalid input", "Groups them into two encounters in any file order", "Frontline summary: time to TCA, miss distance, source Pc", "Python app with REST API, alert rules and outbox"],
    evidence: "Sprint 3 review with Patrick (CSA) and Prof. Lee",
  },
  {
    version: "v0.2",
    tag: "v0.2-nov11",
    date: "Nov 11, 2026",
    sprint: "Sprint 4",
    title: "CSA feedback, first half",
    delivered: ["Operator view and specialist view", "Radial, in-track and cross-track miss distance", "CDM history table and Pc / miss-distance trend charts", "CDMs load one at a time, oldest first"],
    evidence: "Pull request #1; 9 of 18 checklist items",
  },
  {
    version: "v0.2.5",
    tag: "v0.2.5",
    date: "Nov 12, 2026",
    sprint: "Sprint 4",
    title: "Landing page, console and the rest of the checklist",
    delivered: ["Miss distance compared with uncertainty, with a confidence level", "'How this was calculated' panel with the covariance matrices", "Active and archived events; ACTION flag at Pc of 1 in 10,000", "Landing page and the big-picture page at /vision"],
    evidence: "Pull requests #2 and #3; 17 of 18 checklist items",
  },
  {
    version: "v0.3 beta",
    tag: "v0.3-beta",
    date: "Nov 13, 2026",
    sprint: "Sprint 4",
    title: "Visual dashboard",
    delivered: ["Near-miss player with a plain-language verdict", "Two sidebars: event list on the left, event details on the right", "Alert rule editor, outbox with delivery status, mute and snooze", "Four risk checks per event; session saved in the browser"],
    evidence: "Pull requests #11 to #20, one per team member's issue",
  },
];

export const DEMO_STEPS: string[] = [
  "Open the live app and go to the dashboard.",
  "Press Load sample data. Nine CDMs arrive one at a time and form three events: two SCISAT 1 passes and one synthetic high-risk pass.",
  "Run the risk analysis. Each event gets a severity from its source Pc.",
  "Choose the ACTION event and play the pass in the near-miss player.",
  "Switch the right sidebar between the operator and specialist views. Open the original CDM fields.",
  "Open the alert rules and the outbox. Retry a failed delivery, then mute an event.",
  "Refresh the page to show the saved session, then press Reset.",
];

// ---------------------------------------------------------------- 5. Roadmap

export const RELEASES: { id: string; name: string; period: string; scope: string; state: "Done" | "In progress" | "Planned"; progress: number; note: string }[] = [
  { id: "R0", name: "Discovery and design", period: "Sep 28 to Oct 25, 2026", scope: "Problem definition, requirements, sample-data study, interface decisions, architecture, backlog", state: "Done", progress: 100, note: "Sprints 1 and 2 finished every planned item with no carry-over." },
  { id: "R1", name: "Fall MVP", period: "Oct 26 to Dec 2026", scope: "Import six CDMs, associate revisions, event details and trends, core alert logic and a test notification path", state: "In progress", progress: 88, note: "7 of 8 R1 backlog items delivered (B06 to B11, B13). B12 is in progress: delivery is still a local simulation." },
  { id: "R2", name: "Scientific and integration increment", period: "Jan to Feb 2027", scope: "Pc reference validation, initial maneuver-analysis method, API implementation, accounts and organization permissions", state: "Planned", progress: 0, note: "Prototypes exist for Pc, maneuver trade and the REST API." },
  { id: "R3", name: "Integrated beta", period: "Mar to Apr 2027", scope: "Scenario analysis, reliability, accessibility, notification handling and documentation", state: "Planned", progress: 0, note: "" },
  { id: "R4", name: "Final handover candidate", period: "By Apr 29, 2027", scope: "Integrated demonstration, repository, installation and API documentation, test evidence, handover material", state: "Planned", progress: 0, note: "Capstone Day." },
];

export const ROADMAP: { epic: string; features: string; priority: string; target: string }[] = [
  { epic: "E1", features: "CDM import, validation, event correlation, revision history", priority: "Must", target: "R0 to R1" },
  { epic: "E2", features: "Event overview, detailed information, time to TCA, risk trends", priority: "Must", target: "R1" },
  { epic: "E3", features: "Configurable rules, notification status, retries, audit records", priority: "Must", target: "R1 to R3" },
  { epic: "E4", features: "Source-value provenance, quality indicators, Pc reference validation", priority: "Must", target: "R0, R2" },
  { epic: "E5", features: "Scenario inputs, comparisons, residual risk, documented assumptions", priority: "Must; scope to confirm", target: "R2 to R3" },
  { epic: "E6", features: "Authenticated event and maneuver-plan API", priority: "Must", target: "R0, R2" },
  { epic: "E7", features: "User roles, organization isolation, event and configuration history", priority: "Must", target: "R0, R2" },
  { epic: "E8", features: "Automated tests, accessibility, documentation, reproducible deployment", priority: "Must throughout", target: "Every release" },
];

export type BacklogState = "Done" | "In progress" | "To do";

export const BACKLOG: { id: string; item: string; stories: string; size: string; target: string; state: BacklogState }[] = [
  { id: "B01", item: "Confirm user needs and key acceptance criteria with stakeholders.", stories: "US01, US03", size: "M", target: "R0", state: "Done" },
  { id: "B02", item: "Document CDM fields, units and encounter-grouping rules.", stories: "US01, US02", size: "M", target: "R0", state: "Done" },
  { id: "B03", item: "Develop and review user workflows and wireframes.", stories: "US03, US07", size: "M", target: "R0", state: "Done" },
  { id: "B04", item: "Define API interfaces and user access boundaries.", stories: "US10, US11", size: "M", target: "R0", state: "Done" },
  { id: "B05", item: "Plan integration with the real collision-data source.", stories: "US01, US05", size: "M", target: "R0 to R1", state: "Done" },
  { id: "B06", item: "Implement CDM parsing, validation and invalid-input test cases.", stories: "US01", size: "M", target: "R1", state: "Done" },
  { id: "B07", item: "Implement encounter storage, revision history and encounter-grouping tests.", stories: "US02", size: "L", target: "R1", state: "Done" },
  { id: "B08", item: "Develop encounter overview and detail pages.", stories: "US03, US07", size: "L", target: "R1", state: "Done" },
  { id: "B09", item: "Display collision-probability and miss-distance history.", stories: "US04", size: "M", target: "R1", state: "Done" },
  { id: "B10", item: "Add filtering and sorting for encounter data.", stories: "US03, US05", size: "M", target: "R1", state: "Done" },
  { id: "B11", item: "Implement configurable alert-rule evaluation.", stories: "US05", size: "M", target: "R1", state: "Done" },
  { id: "B12", item: "Implement a test notification workflow with retry and failure handling.", stories: "US06, US14", size: "L", target: "R1", state: "In progress" },
  { id: "B13", item: "Verify collision data is displayed and exported accurately.", stories: "US01, US07", size: "S", target: "R1", state: "Done" },
  { id: "B14", item: "Research and select an approved Pc calculation method and reference cases.", stories: "US09", size: "M", target: "R0 to R2", state: "In progress" },
  { id: "B15", item: "Implement and verify Pc analysis against approved reference cases.", stories: "US09", size: "L", target: "R2", state: "To do" },
  { id: "B16", item: "Define the inputs, outputs, assumptions and limits for maneuver analysis.", stories: "US08", size: "M", target: "R0 to R2", state: "In progress" },
  { id: "B17", item: "Implement and validate maneuver-scenario comparisons using the agreed method.", stories: "US08", size: "L", target: "R2 to R3", state: "To do" },
  { id: "B18", item: "Implement documented and protected API interfaces.", stories: "US10", size: "L", target: "R2", state: "To do" },
  { id: "B19", item: "Implement user accounts, roles and organization-level permissions.", stories: "US11", size: "L", target: "R2", state: "To do" },
  { id: "B20", item: "Add event acknowledgement, status updates and decision history.", stories: "US12", size: "M", target: "R2 to R3", state: "To do" },
  { id: "B21", item: "Add a text-notification adapter if approved and feasible.", stories: "US06", size: "M", target: "R3", state: "To do" },
  { id: "B22", item: "Conduct reliability, accessibility and usability tests.", stories: "US13, US14", size: "L", target: "Every release", state: "To do" },
  { id: "B23", item: "Prepare setup instructions, data documentation, API documentation and open-source licensing.", stories: "US13", size: "M", target: "R1 to R4", state: "In progress" },
  { id: "B24", item: "Perform clean-install, integration, regression and release testing.", stories: "US14", size: "L", target: "R1 to R4", state: "In progress" },
  { id: "B25", item: "Universal design and accessibility verification: WCAG 2.1 AA keyboard, contrast and ARIA checks.", stories: "NFR07", size: "M", target: "R1 (Sprint 4)", state: "To do" },
  { id: "B26", item: "Multi-tenant security audit: automated cross-tenant denial tests and API token scoping.", stories: "US11, NFR04", size: "M", target: "R2 (Sprint 7)", state: "To do" },
];

export const DEFINITION_OF_READY = [
  "The user's needs and intended outcome are clearly understood.",
  "The acceptance criteria are clear and testable.",
  "Important dependencies and external interfaces have been identified.",
  "The required inputs, mock data or test data are available.",
  "The task is small enough to estimate and complete within a sprint.",
];

export const DEFINITION_OF_DONE = [
  "Its acceptance criteria have been met.",
  "Relevant automated tests have passed.",
  "Source data and numerical values handled by the feature remain accurate.",
  "Applicable security, accessibility and error-handling checks have been completed.",
  "Code changes have been reviewed before being merged.",
  "Related documentation has been updated when needed.",
  "Known limitations or unresolved issues have been recorded.",
];

export const OPEN_DECISIONS = [
  "What format, access method and integration requirements will apply to the CSA-provided synthetic catalog?",
  "What encounter-grouping rule should be followed when TCA changes?",
  "Which Pc method and numerical tolerance will CSA accept?",
  "What level of maneuver-analysis fidelity is expected?",
  "What notification channels are required for the Fall MVP?",
  "Does the API support only proposed plans, or must it accommodate a future automation boundary?",
  "What organization, security, hosting and retention policies apply?",
  "What are the confirmed course submission and handover dates?",
];

// ---------------------------------------------------------------- 6. Testing and CM

export interface TestRun {
  suite: string;
  command: string;
  where: string;
  total: number;
  passed: number;
  failed: number;
  files: { file: string; tests: number; failed: number; covers: string }[];
}

/** Results of running both suites on the main branch on SNAPSHOT_DATE. */
export const TEST_RUNS: TestRun[] = [
  {
    suite: "Web app (Vitest)",
    command: "cd web && npm test",
    where: "web/src",
    total: 126,
    passed: 126,
    failed: 0,
    files: [
      { file: "lib/cads/cads.test.ts", tests: 61, failed: 0, covers: "Parser, KVN, grouping, severity, Pc port against Python results, maneuver, alerts" },
      { file: "lib/cads/player.test.ts", tests: 15, failed: 0, covers: "Near-miss track and verdict" },
      { file: "lib/cads/outbox.test.ts", tests: 9, failed: 0, covers: "Delivery status, retry, suppression" },
      { file: "lib/cads/risk-checks.test.ts", tests: 7, failed: 0, covers: "Probability level, trend, confidence, time to act" },
      { file: "components/visual/conjunction-player.test.tsx", tests: 6, failed: 0, covers: "Player controls and verdict banner" },
      { file: "components/visual/visual-dashboard.test.tsx", tests: 5, failed: 0, covers: "Click-through of the v0.3 dashboard" },
      { file: "components/cads-app.test.tsx", tests: 5, failed: 0, covers: "Click-through of the v0.2.5 console" },
      { file: "lib/cads/event-persistence.test.ts", tests: 4, failed: 0, covers: "Save, restore and clear in IndexedDB" },
      { file: "lib/cads/mute-snooze.test.ts", tests: 4, failed: 0, covers: "Mute, snooze, resume and expiry" },
      { file: "app/site-visit/page.test.tsx", tests: 4, failed: 0, covers: "This page: sections, sidebar links, tables, diagram files" },
      { file: "app/vision/page.test.tsx", tests: 3, failed: 0, covers: "Big-picture page" },
      { file: "components/risk-analysis-display.test.tsx", tests: 2, failed: 0, covers: "Risk checks in the event card" },
      { file: "app/page.test.tsx", tests: 1, failed: 0, covers: "Landing page and navigation" },
    ],
  },
  {
    suite: "Python reference app (pytest)",
    command: "pip install -r requirements-dev.txt && pytest",
    where: "tests/test_mvp.py",
    total: 10,
    passed: 10,
    failed: 0,
    files: [
      { file: "test_ac01_two_encounters_in_every_file_order", tests: 1, failed: 0, covers: "AC01, all 720 orders of the six files" },
      { file: "test_ac02_pc_text_preserved_and_zero_distinct", tests: 1, failed: 0, covers: "AC02, NFR01" },
      { file: "test_invalid_inputs_rejected_with_reasons", tests: 1, failed: 0, covers: "FR17" },
      { file: "test_kvn_adapter_matches_json_values", tests: 1, failed: 0, covers: "NFR08: a second source format" },
      { file: "test_api_import_events_and_idempotent_reimport", tests: 1, failed: 0, covers: "FR01, duplicates" },
      { file: "test_ac03_alerts_match_only_qualifying_no_duplicates_and_retry", tests: 1, failed: 0, covers: "AC03" },
      { file: "test_failed_delivery_is_retried_then_recorded", tests: 1, failed: 0, covers: "FR09, NFR05" },
      { file: "test_maneuver_trade_study_is_decision_support_only", tests: 1, failed: 0, covers: "AC05 (partly)" },
      { file: "test_demo_scenario_is_upcoming_relative_to_now_and_alerts", tests: 1, failed: 0, covers: "Demo data" },
      { file: "test_empty_start_then_load_analyze_reset", tests: 1, failed: 0, covers: "AC06" },
    ],
  },
];

export const TEST_LEVELS: { level: string; checks: string; when: string; now: string; status: Status }[] = [
  { level: "Unit", checks: "CDM parsing, field validation, alert rules", when: "Every pull request", now: "Automated in both codebases.", status: "met" },
  { level: "Integration", checks: "Ingestion, grouping, storage and alerts working together", when: "Every pull request", now: "Python API tests and web click-through tests.", status: "met" },
  { level: "API and security", checks: "Invalid requests, permissions, cross-organization access", when: "Every pull request", now: "Invalid input is tested. Permission tests wait for accounts (R2).", status: "partial" },
  { level: "Scientific", checks: "Pc results against approved reference cases", when: "Each release", now: "Our Pc is checked against the source Pc on synthetic CDMs. No CARA reference cases yet.", status: "partial" },
  { level: "Usability and accessibility", checks: "Keyboard use, labels, supervised review tasks", when: "Each release", now: "Tests query by role and label. No supervised task or WCAG audit yet.", status: "gap" },
  { level: "Regression and deployment", checks: "Old features still work; clean install from the docs", when: "Each release", now: "The full suite is the regression check. Clean install and both suites repeated for this page.", status: "met" },
];

export const TEST_TARGETS = [
  "Over 80% automated coverage on ingestion and processing modules. Coverage is not measured yet.",
  "100% coverage of CDM parser edge cases (Sprint 4 item).",
  "Zero high-severity security issues.",
];

export const DEFECTS: { id: string; found: string; defect: string; state: "Fixed" | "Open"; action: string }[] = [
  { id: "D1", found: "Nov 13, review", defect: "A source Pc of exactly 0 was displayed as '0%', which reads as 'no risk'.", state: "Fixed", action: "Branch fix/no-zero-percent, pull request #19, merged Nov 13. Now shown as 'less than 0.0000001%'." },
  { id: "D2", found: "Nov 13, automated test", defect: "On the branch of open pull request #21, raw LaTeX text (for example 'frac1') leaks into the 'How this was calculated' panel of the v0.2.5 console.", state: "Open", action: "Caught before merge by components/cads-app.test.tsx. Main is not affected. To be fixed on that branch before it merges." },
  { id: "D3", found: "Nov 11, checklist review", defect: "README says nine CDMs become three events while Progress Report 1 says six become two.", state: "Open", action: "Both are true (six CSA samples plus three synthetic). Wording to be aligned in the README." },
];

export const CM: { item: string; rule: string; evidence: string; status: Status }[] = [
  { item: "Repository", rule: "One shared Git repository for code, fixtures, diagrams and docs.", evidence: "github.com/eszain/project12_code, 77 commits from 6 members.", status: "met" },
  { item: "Branches", rule: "feature/USxx-short-description, fix/issue-description, release/vX.Y.", evidence: "feature/ and fix/ branches are in use. Some early branches do not follow the pattern.", status: "partial" },
  { item: "Merge rules", rule: "No direct commits to main; one approving review; passing tests; clean secret scan.", evidence: "15 pull requests, 13 merged. Reviews are not recorded on GitHub and main is not protected.", status: "partial" },
  { item: "Versioning", rule: "A tag for every release.", evidence: "v0.1-nov6, v0.2-nov11, v0.2.5, v0.3-beta, with frozen branches for the demo versions.", status: "met" },
  { item: "Secrets", rule: "Settings and credentials in environment variables, never in the repository.", evidence: ".env is git-ignored and .env.example documents the settings. The web app needs no credentials.", status: "met" },
  { item: "Data provenance", rule: "Synthetic fixtures are clearly separated from source data.", evidence: "fixtures/reconstructed and fixtures/synthetic, each described in PROVENANCE.md.", status: "met" },
];

export const BUILD_STEPS: { title: string; lines: string[] }[] = [
  { title: "Web app", lines: ["cd web", "npm install", "npm test", "npm run build", "npm run dev   # http://localhost:3000"] },
  { title: "Python reference app", lines: ["python -m venv .venv && source .venv/bin/activate", "pip install -r requirements-dev.txt", "pytest", "python -m cads   # http://127.0.0.1:8000, API docs at /docs"] },
  { title: "Diagrams", lines: ["cd docs/diagrams", "java -jar plantuml.jar -tsvg -o ../../web/public/site-visit *.puml"] },
];

// ---------------------------------------------------------------- 7. Agile

export const TEAM: { member: string; role: string; owns: string; prs: string }[] = [
  { member: "Mohammed Zain Al Syed", role: "Project Lead and System Architect", owns: "Coordination, architecture, integration", prs: "#1, #3, #15, #17, #19, #21" },
  { member: "Abhishek Lal George", role: "Backend and API Lead", owns: "FastAPI, CDM parser, data pipeline", prs: "#14" },
  { member: "Taehyun Kim", role: "Database and Data Engineer", owns: "Schema, event correlation, revision history", prs: "#13, #18" },
  { member: "Manoj Ravichandran", role: "Security and Integration Lead", owns: "Access control, multi-organization security, external API", prs: "#11" },
  { member: "Himanshi Verma", role: "Frontend and Universal Design Lead", owns: "React/Next.js UI, accessibility, operator and specialist views", prs: "#2, #12" },
  { member: "Sarthak Verma", role: "Scientific and QA Engineer", owns: "NASA CARA integration, Pc benchmarks, test suite", prs: "#16, #20" },
];

export const CADENCE: { name: string; when: string; evidence: string }[] = [
  { name: "Sprint planning", when: "Every second Monday", evidence: "Goal, backlog items that pass the Definition of Ready, capacity (about 10 hours per member) and owners." },
  { name: "Stand-up", when: "Monday, Wednesday, Friday on Discord", evidence: "Done, next, blocked. Blockers get an owner." },
  { name: "Sprint review", when: "Every two weeks or at a release", evidence: "Demo to the supervisor and CSA; feedback recorded as backlog items." },
  { name: "Retrospective", when: "Every second Monday", evidence: "Went well, to improve, actions with owners." },
];

export interface Card {
  id: string;
  title: string;
  owner: string;
  meta: string;
}

export interface Sprint {
  id: string;
  name: string;
  dates: string;
  release: string;
  goal: string;
  capacity: string;
  columns: { name: string; cards: Card[] }[];
  review: string;
  carryOver: string;
}

export const SPRINTS: Sprint[] = [
  {
    id: "s1",
    name: "Sprint 1",
    dates: "Sep 28 to Oct 11, 2026",
    release: "R0",
    goal: "Establish the project baseline, research the domain and align user needs with the supervisor's guidance.",
    capacity: "60 hours (6 members, 10 hours each)",
    columns: [
      { name: "To do", cards: [] },
      { name: "In progress", cards: [] },
      {
        name: "Done",
        cards: [
          { id: "T1.1", title: "Confirm user needs and acceptance criteria with CSA (B01)", owner: "Mohammed Zain Al Syed", meta: "5 pts" },
          { id: "T1.2", title: "Document CDM fields, units and grouping rules (B02)", owner: "Abhishek Lal George", meta: "5 pts" },
          { id: "T1.3", title: "Develop initial user workflows and wireframe concepts (B03)", owner: "Himanshi Verma", meta: "3 pts" },
        ],
      },
    ],
    review: "Meeting 1 with Prof. Lee on Oct 5. Action: refine the questions for CSA and research SSA, SDA and STM workflows first.",
    carryOver: "None. 13 of 13 points done.",
  },
  {
    id: "s2",
    name: "Sprint 2",
    dates: "Oct 12 to Oct 25, 2026",
    release: "R0",
    goal: "Finalize the system architecture, design the schema for CDM revision grouping and set the API boundaries.",
    capacity: "60 hours (6 members, 10 hours each)",
    columns: [
      { name: "To do", cards: [] },
      { name: "In progress", cards: [] },
      {
        name: "Done",
        cards: [
          { id: "T2.1", title: "Define API interfaces and user access boundaries (B04)", owner: "Manoj Ravichandran", meta: "5 pts" },
          { id: "T2.2", title: "Plan integration with the collision-data source (B05)", owner: "Abhishek Lal George", meta: "5 pts" },
          { id: "T2.3", title: "Select Pc calculation method and reference cases (B14)", owner: "Sarthak Verma", meta: "5 pts" },
        ],
      },
    ],
    review: "Meeting 2 with Prof. Lee on Oct 23. Action: bring CSA concrete proposed options, not broad questions.",
    carryOver: "None. 15 of 15 points done.",
  },
  {
    id: "s3",
    name: "Sprint 3",
    dates: "Oct 26 to Nov 8, 2026",
    release: "R1",
    goal: "Build the CDM parser and event correlation, and deliver a working MVP for the CSA demonstration.",
    capacity: "70 hours",
    columns: [
      { name: "To do", cards: [] },
      { name: "In progress", cards: [] },
      {
        name: "Done",
        cards: [
          { id: "B06", title: "CDM parsing, validation and invalid-input tests (US01)", owner: "Abhishek Lal George", meta: "12 h" },
          { id: "B07", title: "Encounter storage, revision history and grouping tests (US02)", owner: "Taehyun Kim", meta: "12 h" },
          { id: "B08", title: "Encounter overview and detail pages (US03)", owner: "Himanshi Verma", meta: "12 h" },
          { id: "B13", title: "Verify displayed values against the source (US01, US07)", owner: "Sarthak Verma", meta: "12 h" },
        ],
      },
    ],
    review: "MVP demo to Patrick (CSA) and Prof. Lee on Nov 6. Six CDMs ingested and grouped into Encounters A and B. Tagged v0.1-nov6.",
    carryOver: "None. MVP demonstrated and deployed.",
  },
  {
    id: "s4",
    name: "Sprint 4",
    dates: "Nov 9 to Nov 22, 2026 (in progress)",
    release: "R1",
    goal: "Act on CSA's Nov 6 feedback and complete the operator workflow: two views, trends, covariance in the risk picture, alert rules and delivery logging.",
    capacity: "About 10 hours per member",
    columns: [
      {
        name: "To do",
        cards: [
          { id: "RETRO-1", title: "GitHub Actions: run tests on every pull request", owner: "Abhishek Lal George", meta: "Retro action" },
          { id: "TEST", title: "Cover 100% of CDM parser edge cases", owner: "To be assigned", meta: "US01" },
          { id: "B25", title: "Accessibility verification (WCAG 2.1 AA)", owner: "Himanshi Verma", meta: "NFR07" },
        ],
      },
      {
        name: "In progress",
        cards: [
          { id: "#21", title: "Verdict banner redesign for the near-miss player", owner: "Mohammed Zain Al Syed", meta: "Pull request open" },
          { id: "#9", title: "Risk and maneuver data: CARA Pc check and what-if burn study", owner: "Sarthak Verma", meta: "Risk checks merged (#16, #20)" },
          { id: "#8", title: "Alerts: indicators, rule editor, outbox and delivery status", owner: "Taehyun Kim", meta: "First part merged (#18)" },
          { id: "#7", title: "Event data layer: grouping rules, history, active / archived, storage", owner: "Manoj Ravichandran", meta: "First part merged (#11)" },
          { id: "#6", title: "Data loading: import report, validation messages, raw CDM view", owner: "Abhishek Lal George", meta: "First part merged (#14)" },
          { id: "#5", title: "Dashboard sidebars: event rows and operator / specialist details", owner: "Himanshi Verma", meta: "First part merged (#12)" },
        ],
      },
      {
        name: "Done",
        cards: [
          { id: "#4", title: "Near-miss player: 2D playback in the dashboard centre", owner: "Mohammed Zain Al Syed", meta: "Merged (#17)" },
          { id: "#1", title: "Operator and specialist views, CDM history and trends (US03, US04, US07)", owner: "Mohammed Zain Al Syed", meta: "v0.2" },
          { id: "#3", title: "Miss distance against uncertainty, calculation panel, archive, ACTION flag", owner: "Mohammed Zain Al Syed", meta: "v0.2.5" },
          { id: "#19", title: "Fix: never show a collision chance of 0%", owner: "Mohammed Zain Al Syed", meta: "Defect D1" },
        ],
      },
    ],
    review: "Demo to Prof. Lee on Nov 11 (v0.2). Sprint review with CSA to follow.",
    carryOver: "Sprint still running. Issues #5 to #9 stay open until their remaining scope is done or moved.",
  },
];

export const STANDUPS: { who: string; done: string; next: string; blocker: string }[] = [
  { who: "Abhishek Lal George (backend)", done: "FastAPI CDM file upload endpoint (US01).", next: "Unit tests for invalid payload rejection.", blocker: "No sample JSON files with 3D covariance matrices." },
  { who: "Himanshi Verma (frontend)", done: "React layout for the frontline event cards (US03).", next: "ARIA accessibility tags (B25).", blocker: "None" },
  { who: "Taehyun Kim (database)", done: "Schema migrations for ConjunctionEvent and CDMRevision (US02).", next: "Queries for grouping revisions by TCA.", blocker: "None" },
];

export const IMPEDIMENTS: { blocker: string; resolution: string }[] = [
  { blocker: "Space-Track access restriction: live catalog data was unavailable.", resolution: "Switched to the ESA synthetic CDM dataset on CSA's advice." },
  { blocker: "Covariance data gap: the six sample CDMs lacked rich covariance data.", resolution: "Sarthak Verma built synthetic covariance test fixtures." },
];

export const FEEDBACK: { from: string; asked: string; did: string; where: string; status: Status }[] = [
  { from: "CSA, Nov 6", asked: "Show radial miss distance separately.", did: "Radial, in-track and cross-track shown separately, radial highlighted.", where: "v0.2", status: "met" },
  { from: "CSA, Nov 6", asked: "Split quick operator cards from detailed specialist pages.", did: "Operator view and specialist view.", where: "v0.2", status: "met" },
  { from: "CSA, Nov 6", asked: "Use position uncertainty and covariance, not miss distance alone.", did: "1σ uncertainty per object, miss distance against uncertainty with a confidence level, covariance matrices in the calculation panel.", where: "v0.2.5", status: "met" },
  { from: "CSA, Nov 6", asked: "Show how the risk changes across CDMs.", did: "CDM history table and trend charts.", where: "v0.2", status: "met" },
  { from: "CSA, Nov 6", asked: "Feed CDMs one at a time, in order.", did: "Sequential loader, oldest first, with a test that it groups the same as bulk loading.", where: "v0.2", status: "met" },
  { from: "CSA, Nov 6", asked: "Separate active and archived events.", did: "Active and Archived tabs; events archive after their closest approach.", where: "v0.2.5", status: "met" },
  { from: "CSA, Nov 6", asked: "Use NASA CARA tools and the ESA synthetic dataset.", did: "CARA review written; file loader ready. The dataset has not arrived.", where: "docs/cara-review.md", status: "partial" },
  { from: "Prof. Lee, Nov 11", asked: "Show the big picture of the final product.", did: "The /vision page: every module, built or planned.", where: "v0.2.5", status: "met" },
  { from: "Prof. Lee, Nov 11", asked: "Show something visual, not only numbers.", did: "Near-miss player with a plain-language verdict.", where: "v0.3 beta", status: "met" },
  { from: "Prof. Lee, Nov 11", asked: "Three cards do not show how it scales to many events.", did: "Sidebar event list, search, filters, paging, and a button that adds 60 test events.", where: "v0.2.5, v0.3 beta", status: "met" },
];

export const RETRO = {
  sprint: "Sprint 3",
  wentWell: ["The MVP demo to CSA.", "Early collaboration between backend parsing and database design."],
  improve: ["Manual pull-request testing delayed the demo.", "The effort for event correlation was underestimated."],
  actions: [
    { action: "Set up GitHub Actions to run tests on every pull request.", owner: "Abhishek Lal George", state: "Open" },
    { action: "Split operator and specialist views.", owner: "Himanshi Verma", state: "Done (v0.2)" },
    { action: "Use planning poker to estimate scientific tasks.", owner: "Mohammed Zain Al Syed", state: "Open" },
  ],
};

export const COSTS: { sprint: string; hours: number; labour: string; hosting: string }[] = [
  { sprint: "Sprint 1 (R0)", hours: 60, labour: "$2,100", hosting: "$0" },
  { sprint: "Sprint 2 (R0)", hours: 60, labour: "$2,100", hosting: "$0" },
  { sprint: "Sprint 3 (R1)", hours: 70, labour: "$2,450", hosting: "$0 (Vercel free tier)" },
  { sprint: "Sprints 4 to 9 (planned)", hours: 480, labour: "$16,800", hosting: "$65 (estimate)" },
];

// ---------------------------------------------------------------- 8. UDL and consequences

export const UDL: { principle: string; action: string; built: string; req: string; status: Status }[] = [
  { principle: "1. Equitable use", action: "Keyboard navigation, screen-reader labels, accessible contrast", built: "Regions, tables and charts have labels and text descriptions. No WCAG audit yet.", req: "NFR07", status: "partial" },
  { principle: "2. Flexibility in use", action: "Separate operator and specialist views", built: "Both views are built; 'one in N' and percentage forms of Pc.", req: "AC01, AC02", status: "met" },
  { principle: "3. Simple and intuitive use", action: "No unexplained jargon; clear status badges; consistent layout", built: "Plain-language verdicts and explanation; severity legend says what to do.", req: "NFR06", status: "met" },
  { principle: "4. Perceptible information", action: "Urgency shown by icon and text, not colour alone", built: "Severity is always a word (ACTION, WATCH, LOW). Warnings are written out.", req: "NFR07", status: "met" },
  { principle: "5. Tolerance for error", action: "Confirm before closing events or changing alerts; clear errors", built: "Import report lists every rejected file with reasons. Archive can be undone. Mute needs a reason.", req: "AC03, NFR05", status: "partial" },
  { principle: "6. Low physical effort", action: "Key numbers (Pc, TCA, radial miss) on the first card", built: "Operator card shows TCA, miss distance and Pc with a one-line summary.", req: "NFR06", status: "met" },
  { principle: "7. Size and space for approach and use", action: "Responsive layout with large click targets", built: "Sidebars collapse; layouts adapt to narrow screens. Not yet checked on a range of devices.", req: "NFR07", status: "partial" },
];

export const SDGS: { goal: string; dimension: string; action: string; evidence: string }[] = [
  { goal: "SDG 9: Industry, Innovation and Infrastructure", dimension: "Societal and infrastructure", action: "Open-source infrastructure for space-traffic management", evidence: "Public repository, API tests" },
  { goal: "SDG 12: Responsible Consumption and Production", dimension: "Environmental and orbital", action: "Fewer collisions and less orbital debris", evidence: "Maneuver risk-reduction analysis (R2)" },
  { goal: "SDG 16: Peace, Justice and Strong Institutions", dimension: "Economic and operational", action: "Transparent, audited decisions", evidence: "Audit entries, rule change history, delivery logs" },
  { goal: "SDG 17: Partnerships for the Goals", dimension: "Health and global partnerships", action: "Data sharing between CSA, NASA, ESA and operators", evidence: "API interoperability tests (R2)" },
];

export const SAFETY: { topic: string; risk: string; mitigation: string }[] = [
  { topic: "Safety", risk: "Software acts on a spacecraft without a person deciding.", mitigation: "CADS is decision support only. It never issues a command, and the interface and every alert message say so." },
  { topic: "Over-trust", risk: "An unvalidated number is treated as authoritative.", mitigation: "Severity comes only from the source Pc. Recalculated values are labelled experimental and never replace it." },
  { topic: "Misreading", risk: "A Pc of zero is read as 'no risk'.", mitigation: "Zero is shown as 'less than 0.0000001%' and has its own ZERO severity." },
  { topic: "Privacy", risk: "One organization sees another's satellite data.", mitigation: "The web app keeps all data in the browser tab. Organization isolation is designed for R2 (AC04, B26)." },
  { topic: "Security", risk: "Credentials leak through the repository.", mitigation: ".env is git-ignored; the demo needs no credentials; original CSA sample files are not committed." },
  { topic: "Data licensing", risk: "Restricted Space-Track data is redistributed.", mitigation: "Sample CDMs are rebuilt from the report or synthetic, with provenance documented." },
  { topic: "Wrong grouping", risk: "Two passes are merged, or one pass is split.", mitigation: "Grouping rule tested in all 720 file orders; every revision keeps a note on why it joined its event." },
];

export const DECISIONS: { concern: string; decision: string; where: string }[] = [
  { concern: "Perceptible information", decision: "Observation-gap warnings are written in words, not shown by colour only.", where: "v0.2" },
  { concern: "Over-trust", decision: "Our own Pc is shown beside the source Pc, never in place of it, with the label 'experimental - not validated'.", where: "v0.2.5" },
  { concern: "Misreading risk", decision: "A Pc of 0 is never shown as 0%.", where: "Pull request #19" },
  { concern: "Safety", decision: "The 'What if they hit?' animation is labelled imaginary so it cannot be mistaken for a prediction.", where: "v0.3 beta" },
  { concern: "Privacy and cost", decision: "The demo runs entirely in the browser: nothing is stored on a server or sent anywhere.", where: "v0.1 onward" },
  { concern: "Data licensing", decision: "CSA's original sample files are kept out of the repository until redistribution is confirmed.", where: ".gitignore, PROVENANCE.md" },
];

export const totalWeight = () => CRITERIA.reduce((sum, c) => sum + c.weight, 0);
export const criterion = (id: string) => CRITERIA.find((c) => c.id === id)!;
