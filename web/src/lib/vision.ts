// The big picture (G3) and the feature lists (G1, G2). One source for the /vision page, its test and the docs.

export type Stage = "built" | "next" | "later";

export const STAGE_LABEL: Record<Stage, string> = { built: "Built (v0.2.5)", next: "Next 7 days (proposed)", later: "Later" };

export interface VisionModule {
  id: string;
  title: string;
  /** What the finished module does, in one sentence a non-specialist can follow. */
  purpose: string;
  /** The stage of the finished module as a whole. */
  stage: Stage;
  /** What exists today, if anything. */
  built: string[];
  /** What is proposed for the next seven days, if anything. */
  next: string[];
  /** What comes later. */
  later: string[];
  /** Planned release from Progress Report 1, where there is one. */
  release: string;
}

export const MODULES: VisionModule[] = [
  {
    id: "register",
    title: "Event register",
    purpose: "Find any conjunction quickly, even when there are hundreds, and see what needs attention first.",
    stage: "built",
    built: ["Event cards with Active / Archived tabs", "Search, severity filter, needs-attention filter, sort", "Six events per page", "Archive and restore by hand"],
    next: ["Compact sidebar list beside the detail view for 180 or more events"],
    later: ["Saved filters per user role"],
    release: "R1",
  },
  {
    id: "views",
    title: "Operator and specialist views",
    purpose: "Give the person on console three numbers and a sentence for a phone call, and give the specialist everything.",
    stage: "built",
    built: ["Operator view with an action label and a call summary", "Specialist view with detail, history and explanation"],
    next: [],
    later: ["Views tied to user roles and organisations"],
    release: "R1, R2",
  },
  {
    id: "picture",
    title: "Conjunction picture",
    purpose: "Show the encounter so anyone can see why a number is high or low.",
    stage: "built",
    built: ["2D picture of the closest approach with uncertainty clouds"],
    next: ["3D view using the Earth scene from the landing page"],
    later: ["Animation of the approach over time"],
    release: "R1, R3",
  },
  {
    id: "history",
    title: "CDM history and trends",
    purpose: "Replace the spreadsheet tabs: see every update to an event and how the risk changed.",
    stage: "built",
    built: ["History table in time order", "Pc and miss-distance charts", "CDMs loaded one at a time, oldest first"],
    next: [],
    later: ["Trend of uncertainty over time"],
    release: "R1",
  },
  {
    id: "explain",
    title: "Explanation and calculation details",
    purpose: "Say in plain words how each number was reached, so the audience can trust or question it.",
    stage: "built",
    built: ["Plain-language explanation", "Miss distance against uncertainty", "Four-step calculation details", "Severity legend with where each limit comes from"],
    next: ["Check our Pc against NASA CARA test cases"],
    later: ["Validated Pc agreed with CSA (reference method and tolerance)"],
    release: "R2",
  },
  {
    id: "maneuver",
    title: "Maneuver planning",
    purpose: "Compare ways to avoid a collision, always leaving the decision to a person.",
    stage: "later",
    built: ["Prototype study in the code, not yet on screen"],
    next: [],
    later: ["Trade-space plots using CARA methods", "Compare burn options against the action level"],
    release: "R2, R3",
  },
  {
    id: "alerts",
    title: "Alerts and notifications",
    purpose: "Tell the right people when an event crosses a limit, and keep a record of what was sent.",
    stage: "later",
    built: ["Alert rule engine in the code", "ACTION level flagged on cards"],
    next: [],
    later: ["Rule editor", "Email and text delivery with retries", "Delivery log"],
    release: "R1, R3",
  },
  {
    id: "data",
    title: "Data sources",
    purpose: "Bring CDMs in from files, synthetic datasets and, later, live services.",
    stage: "built",
    built: ["Bundled sample CDMs", "Load your own JSON or KVN files", "Generated test events for scale"],
    next: ["Load the larger synthetic dataset from CSA when it arrives"],
    later: ["Space-Track or TraCSS adapter", "Data retention policy"],
    release: "R0, R2",
  },
  {
    id: "access",
    title: "Accounts, organisations and API",
    purpose: "Let each organisation see only its own satellites, and let other systems exchange data.",
    stage: "later",
    built: [],
    next: [],
    later: ["Sign-in and roles", "Organisation separation", "Documented API for events and proposed plans"],
    release: "R2",
  },
  {
    id: "handover",
    title: "Audit, quality and handover",
    purpose: "Leave CSA a system it can run, test and maintain.",
    stage: "later",
    built: ["Automated tests", "Release tags for each version"],
    next: [],
    later: ["Audit trail of decisions", "Accessibility checks", "Install guide and handover documents"],
    release: "R3, R4",
  },
];

export const RELEASES = [
  { id: "R0", name: "Discovery and design", when: "Fall 2026" },
  { id: "R1", name: "Fall MVP", when: "Nov–Dec 2026" },
  { id: "R2", name: "Scientific and integration", when: "Jan–Feb 2027" },
  { id: "R3", name: "Integrated beta", when: "Mar–Apr 2027" },
  { id: "R4", name: "Final handover", when: "By Apr 29, 2027" },
];

export const featuresOf = (stage: "built" | "next" | "later") =>
  MODULES.flatMap((m) => m[stage].map((f) => ({ module: m.title, feature: f })));
