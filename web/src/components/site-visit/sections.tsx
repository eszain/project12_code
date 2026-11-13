"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/animate-ui/components/radix/accordion";
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from "@/components/animate-ui/components/radix/tabs";
import {
  ACCEPTANCE, BACKLOG, BUILD_STEPS, CADENCE, CM, COSTS, DECISIONS, DEFECTS, DEFINITION_OF_DONE, DEFINITION_OF_READY, DEMO_STEPS,
  DESIGN_VS_BUILT, DIAGRAMS, EPICS, FEEDBACK, FRS, IMPEDIMENTS, INCREMENTS, KPPS, LINKS, MARKET, NEEDS, NFRS, OBJECTIVES, OPEN_DECISIONS,
  PARTICIPATION, POWER_INTEREST, PROBLEM_POINTS, PROBLEM_STATEMENT, RELEASES, RETRO, RISKS, ROADMAP, SAFETY, SDGS, SNAPSHOT_DATE, SPRINTS,
  STAKEHOLDERS, STANDUPS, STORIES, TEAM, TECH_STACK, TEST_LEVELS, TEST_RUNS, TEST_TARGETS, TRADEOFFS, UDL, criterion,
  type BacklogState, type Sprint,
} from "@/lib/site-visit";
import { BulletList, CriterionSection, DataTable, DiagramFigure, ExternalLink, Panel, ProgressBadge, StatusBadge, Sub, Tag } from "./parts";

const mono = "font-mono text-[0.8rem] text-foreground";

// ---------------------------------------------------------------- 1

export function ObjectivesSection() {
  return (
    <CriterionSection criterion={criterion("objectives")}>
      <Sub id="problem" title="Problem statement">
        <Panel>
          <p className="text-pretty text-lg leading-relaxed text-foreground">{PROBLEM_STATEMENT}</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {PROBLEM_POINTS.map(([term, text]) => (
              <div key={term} className="rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-sm font-semibold text-foreground">{term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Evidence from CSA&apos;s sample data: six warnings about SCISAT 1 and one Fengyun-1C debris object looked like one event but were two close passes about 90 minutes apart.
          </p>
        </Panel>
      </Sub>

      <Sub id="objectives-table" title="Objectives, the evidence for each, and where it stands">
        <Panel>
          <DataTable
            caption="Key objectives"
            head={["ID", "Objective", "Intended evidence", "Needs", "Now", "Note"]}
            rows={OBJECTIVES.map((o) => [<Tag key="id">{o.id}</Tag>, o.objective, o.evidence, o.needs, <ProgressBadge key="now" value={o.now} />, o.note])}
          />
        </Panel>
      </Sub>

      <div className="grid gap-6 xl:grid-cols-2">
        <Sub id="needs" title="User needs">
          <Panel description="From CSA's stakeholder scenarios (email, Oct 22, 2026).">
            <ul className="space-y-3">
              {NEEDS.map((n) => (
                <li key={n.id} className="flex gap-3">
                  <Tag>{n.id}</Tag>
                  <p className="leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">As {/^[aeiou]/i.test(n.who) ? "an" : "a"} {n.who.toLowerCase()},</span> {n.story}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </Sub>
        <Sub id="outcomes" title="Measurable outcomes">
          <Panel description="Key performance parameters. Targets are ours until CSA approves them.">
            <ul className="space-y-3">
              {KPPS.map((k) => (
                <li key={k.name} className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
                  <div>
                    <p className="font-medium text-foreground">{k.name} <Tag>{k.req}</Tag></p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{k.how}</p>
                  </div>
                  <p className="whitespace-nowrap text-xl font-semibold tabular-nums text-foreground">{k.target}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </Sub>
      </div>
    </CriterionSection>
  );
}

// ---------------------------------------------------------------- 2

export function StakeholdersSection() {
  const name = (rank: number) => STAKEHOLDERS.find((s) => s.rank === rank)!.who;
  return (
    <CriterionSection criterion={criterion("stakeholders")}>
      <Sub id="stakeholder-table" title="Stakeholders, interests and needs">
        <Panel>
          <DataTable
            caption="Stakeholders"
            head={["Rank", "Stakeholder", "Interests and needs", "Engagement"]}
            rows={STAKEHOLDERS.map((s) => [s.rank, <span key="w" className="font-medium text-foreground">{s.who}</span>, s.needs, s.engage])}
          />
        </Panel>
      </Sub>

      <Sub id="power-interest" title="Power-interest grid">
        <Panel description="Numbers are the ranks in the table above. 1 is the highest priority.">
          <div className="overflow-x-auto">
            <table aria-label="Power-interest grid" className="w-full min-w-[40rem] border-separate border-spacing-1.5 text-sm">
              <thead>
                <tr>
                  <td />
                  {["Lower interest", "Medium interest", "Higher interest"].map((h) => <th key={h} scope="col" className="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {POWER_INTEREST.map((row) => (
                  <tr key={row.power}>
                    <th scope="row" className="w-28 pr-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{row.power}</th>
                    {row.cells.map((cell, i) => (
                      <td key={i} className={`h-24 w-1/3 rounded-lg border p-3 align-top ${cell.ranks.length ? "border-foreground/30 bg-muted/40" : "border-border bg-transparent"}`}>
                        {cell.ranks.length ? (
                          <>
                            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{cell.label}</p>
                            <ul className="mt-1 space-y-0.5 text-foreground">
                              {cell.ranks.map((r) => <li key={r}><span className="font-semibold tabular-nums text-foreground">{r}.</span> {name(r)}</li>)}
                            </ul>
                          </>
                        ) : <span className="sr-only">No stakeholders</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </Sub>

      <Sub id="participation" title="Participation log">
        <Panel description="Who took part, and what changed because of it.">
          <DataTable
            caption="Stakeholder participation"
            head={["Date", "Who", "What happened", "What it changed"]}
            rows={PARTICIPATION.map((p) => [<span key="d" className="whitespace-nowrap">{p.date}</span>, <span key="w" className="font-medium text-foreground">{p.who}</span>, p.what, p.result])}
          />
        </Panel>
      </Sub>

      <Sub id="market" title="Alternatives and why CADS is needed">
        <Tabs defaultValue="products">
          <TabsList className="h-auto max-w-full flex-wrap">
            <TabsTrigger value="products">Existing products</TabsTrigger>
            <TabsTrigger value="tradeoffs">Design alternatives</TabsTrigger>
            <TabsTrigger value="risks">Feasibility risks</TabsTrigger>
          </TabsList>
          <TabsContents>
            <TabsContent value="products">
              <Panel description="These services cover different parts of the problem. CRAMS is the closest reference, so CADS builds on its workflow.">
                <DataTable caption="Existing products and services" head={["Product or service", "Relevant capabilities", "Relevance to CADS"]} rows={MARKET.map((m) => [<span key="p" className="font-medium text-foreground">{m.product}</span>, m.does, m.relevance])} />
              </Panel>
            </TabsContent>
            <TabsContent value="tradeoffs">
              <Panel description="Each decision was judged on feasibility, maintainability, cost and CSA's feedback on Nov 6.">
                <DataTable caption="Design trade-offs" head={["Area", "Selected", "Alternative considered", "Why"]} rows={TRADEOFFS.map((t) => [<span key="a" className="font-medium text-foreground">{t.area}</span>, t.chosen, t.rejected, t.why])} />
              </Panel>
            </TabsContent>
            <TabsContent value="risks">
              <Panel>
                <DataTable caption="Feasibility risks" head={["Risk", "Effect", "Planned response"]} rows={RISKS.map((r) => [<span key="r" className="font-medium text-foreground">{r.risk}</span>, r.effect, r.response])} />
              </Panel>
            </TabsContent>
          </TabsContents>
        </Tabs>
        <Panel title="The value in one paragraph">
          <p className="leading-relaxed text-muted-foreground">
            CSA currently receives each event as an Excel file by email, with one tab per CDM. None of the reviewed services gives CSA a single web view that follows an event&apos;s updates over time,
            explains how far each number can be trusted, and shares data through a documented, access-controlled interface. CADS fills that gap as a maintainable, open-source tool that reuses existing
            scientific methods. It does not claim better tracking accuracy than commercial providers, and it does not replace all CRAMS functions.
          </p>
        </Panel>
      </Sub>
    </CriterionSection>
  );
}

// ---------------------------------------------------------------- 3

export function RequirementsSection() {
  const built = STORIES.filter((s) => s.now === "Verified" || s.now === "Built").length;
  return (
    <CriterionSection criterion={criterion("requirements")}>
      <Sub id="user-stories" title="User stories">
        <Tabs defaultValue="stories">
          <TabsList className="h-auto max-w-full flex-wrap">
            <TabsTrigger value="stories">Stories ({STORIES.length})</TabsTrigger>
            <TabsTrigger value="nfrs">NFRs ({NFRS.length})</TabsTrigger>
            <TabsTrigger value="frs">Functional ({FRS.length})</TabsTrigger>
          </TabsList>
          <TabsContents>
            <TabsContent value="stories">
              <Panel description={`Prioritized product backlog. ${built} of ${STORIES.length} stories are verified by tests or built in a release. Stories are checked against INVEST.`}>
                <DataTable
                  caption="User stories"
                  head={["ID", "Epic", "User story", "Source", "Priority", "AC", "Release", "Now", "Evidence"]}
                  rows={STORIES.map((s) => [
                    <Tag key="id">{s.id}</Tag>,
                    <span key="e" title={EPICS[s.epic]}>{s.epic}</span>,
                    <span key="s" className="text-foreground">{s.story}</span>,
                    s.source, s.priority, s.ac, <span key="r" className="whitespace-nowrap">{s.release}</span>,
                    <ProgressBadge key="n" value={s.now} />, s.evidence,
                  ])}
                />
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Epics: {Object.entries(EPICS).map(([k, v]) => `${k} ${v}`).join(" · ")}
                </p>
              </Panel>
            </TabsContent>
            <TabsContent value="nfrs">
              <Panel description="Thresholds are initial targets, not yet approved by CSA. Verification uses TAID: Test, Analysis, Inspection, Demonstration.">
                <DataTable caption="Non-functional requirements" head={["ID", "Requirement", "Method", "Sprint / release"]} rows={NFRS.map((n) => [<Tag key="id">{n.id}</Tag>, n.text, n.method, <span key="w" className="whitespace-nowrap">{n.when}</span>])} />
              </Panel>
            </TabsContent>
            <TabsContent value="frs">
              <Panel description="Traceability: each functional requirement links to its stories and objectives, how it is verified, and when.">
                <DataTable caption="Functional requirements traceability" head={["ID", "Functional requirement", "Stories / objectives", "Method", "Sprint / release"]} rows={FRS.map((f) => [<Tag key="id">{f.id}</Tag>, f.text, f.links, f.method, <span key="w" className="whitespace-nowrap">{f.when}</span>])} />
              </Panel>
            </TabsContent>
          </TabsContents>
        </Tabs>
      </Sub>

      <Sub id="acceptance" title="Acceptance criteria and the tests that check them">
        <Panel>
          <Accordion type="multiple" defaultValue={["AC01"]}>
            {ACCEPTANCE.map((ac) => (
              <AccordionItem key={ac.id} value={ac.id} className="border-border">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <span className="flex flex-wrap items-center gap-2">
                    <Tag>{ac.id}</Tag>
                    <span className="text-base text-foreground">{ac.name}</span>
                    <StatusBadge status={ac.status} label={ac.status === "met" ? "Tested" : ac.status === "partial" ? "Partly tested" : "No test yet"} />
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="leading-relaxed text-muted-foreground">{ac.text}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Checked by</p>
                  <ul className="mt-1 space-y-1">
                    {ac.tests.map((t) => <li key={t} className={`${mono} [overflow-wrap:anywhere]`}>{t}</li>)}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Panel>
      </Sub>
    </CriterionSection>
  );
}

// ---------------------------------------------------------------- 4

export function ArchitectureSection() {
  return (
    <CriterionSection criterion={criterion("architecture")}>
      <Sub id="system-architecture" title="System architecture">
        <Tabs defaultValue="built">
          <TabsList className="h-auto max-w-full flex-wrap">
            <TabsTrigger value="built">As built</TabsTrigger>
            <TabsTrigger value="proposed">Proposed in the report</TabsTrigger>
          </TabsList>
          <TabsContents>
            <TabsContent value="built"><DiagramFigure diagram={DIAGRAMS.asBuiltArchitecture} /></TabsContent>
            <TabsContent value="proposed"><DiagramFigure diagram={DIAGRAMS.proposedArchitecture} /></TabsContent>
          </TabsContents>
        </Tabs>
        <Panel title="Design against as-built" description="Where the running system matches the proposed design, where it differs, and why.">
          <DataTable
            caption="Design against as-built"
            head={["Area", "Proposed", "Built today", "Why", "Match"]}
            rows={DESIGN_VS_BUILT.map((d) => [
              <span key="a" className="font-medium text-foreground">{d.area}</span>, d.designed, d.built, d.why,
              <StatusBadge key="m" status={d.match} label={d.match === "met" ? "Matches" : d.match === "partial" ? "Differs for now" : "Not built"} />,
            ])}
          />
        </Panel>
        <Panel title="Technology stack">
          <DataTable caption="Technology stack" head={["Layer", "Technology", "Reason"]} rows={TECH_STACK.map((t) => [<span key="l" className="font-medium text-foreground">{t.layer}</span>, t.tech, t.why])} />
        </Panel>
      </Sub>

      <Sub id="uml" title="UML diagrams">
        <Tabs defaultValue="class">
          <TabsList className="h-auto max-w-full flex-wrap">
            <TabsTrigger value="class">Class</TabsTrigger>
            <TabsTrigger value="sequence">Sequence</TabsTrigger>
            <TabsTrigger value="state">State</TabsTrigger>
            <TabsTrigger value="usecase">Use case</TabsTrigger>
            <TabsTrigger value="class-proposed">Class (report)</TabsTrigger>
          </TabsList>
          <TabsContents>
            <TabsContent value="class"><DiagramFigure diagram={DIAGRAMS.domainModel} /></TabsContent>
            <TabsContent value="sequence"><DiagramFigure diagram={DIAGRAMS.sequence} /></TabsContent>
            <TabsContent value="state"><DiagramFigure diagram={DIAGRAMS.states} /></TabsContent>
            <TabsContent value="usecase"><DiagramFigure diagram={DIAGRAMS.useCase} /></TabsContent>
            <TabsContent value="class-proposed"><DiagramFigure diagram={DIAGRAMS.proposedClass} /></TabsContent>
          </TabsContents>
        </Tabs>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The as-built diagrams are generated from PlantUML sources in <span className={mono}>docs/diagrams</span>, so they are version-controlled with the code they describe.
        </p>
      </Sub>

      <Sub id="increments" title="Functional increments">
        <ol aria-label="Functional increments" className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {INCREMENTS.map((inc) => (
            <li key={inc.tag}>
              <Panel className="h-full">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl font-semibold text-foreground">{inc.version}</span>
                  <Tag>{inc.tag}</Tag>
                </div>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{inc.date} · {inc.sprint}</p>
                <p className="mt-2 font-medium text-foreground">{inc.title}</p>
                <BulletList className="mt-2 text-sm" items={inc.delivered} />
                <p className="mt-3 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">{inc.evidence}</p>
              </Panel>
            </li>
          ))}
        </ol>
        <Panel title="Demonstration script for the visit" description="About five minutes, on the live app. No credentials or backend are needed.">
          <ol className="list-decimal space-y-1.5 pl-5 leading-relaxed text-muted-foreground">
            {DEMO_STEPS.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <ExternalLink href={LINKS.live}>Live app</ExternalLink>
            <ExternalLink href={LINKS.repo}>Source repository</ExternalLink>
            <ExternalLink href={LINKS.tags}>Release tags</ExternalLink>
          </p>
        </Panel>
      </Sub>
    </CriterionSection>
  );
}

// ---------------------------------------------------------------- 5

const BACKLOG_STATES: BacklogState[] = ["Done", "In progress", "To do"];

export function RoadmapSection() {
  const count = (s: BacklogState) => BACKLOG.filter((b) => b.state === s).length;
  return (
    <CriterionSection criterion={criterion("roadmap")}>
      <Sub id="releases" title="Release timeline and progress">
        <ol aria-label="Releases" className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {RELEASES.map((r) => (
            <li key={r.id}>
              <Panel className="h-full">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xl font-semibold text-foreground">{r.id}</span>
                  <ProgressBadge value={r.state} />
                </div>
                <p className="mt-1 font-medium text-foreground">{r.name}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{r.period}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${r.id} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.progress}>
                  <div className="h-full rounded-full bg-foreground" style={{ width: `${r.progress}%` }} />
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{r.scope}</p>
                {r.note ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{r.note}</p> : null}
              </Panel>
            </li>
          ))}
        </ol>
        <DiagramFigure diagram={DIAGRAMS.gantt} />
      </Sub>

      <Sub id="feature-roadmap" title="Feature roadmap by epic">
        <Panel>
          <DataTable
            caption="Feature roadmap"
            head={["Epic", "Main features", "Priority", "Target release"]}
            rows={ROADMAP.map((r) => [<span key="e" className="font-medium text-foreground">{r.epic} · {EPICS[r.epic]}</span>, r.features, r.priority, <span key="t" className="whitespace-nowrap">{r.target}</span>])}
          />
        </Panel>
      </Sub>

      <Sub id="backlog" title="Product backlog">
        <Panel description={`${BACKLOG.length} items as of ${SNAPSHOT_DATE}: ${BACKLOG_STATES.map((s) => `${count(s)} ${s.toLowerCase()}`).join(", ")}. Size is relative complexity, not hours.`}>
          <DataTable
            caption="Product backlog"
            head={["ID", "Backlog item", "Stories", "Size", "Target", "State"]}
            rows={BACKLOG.map((b) => [<Tag key="id">{b.id}</Tag>, b.item, b.stories, b.size, <span key="t" className="whitespace-nowrap">{b.target}</span>, <ProgressBadge key="s" value={b.state} />])}
          />
          <p className="mt-3 text-sm"><ExternalLink href={LINKS.board}>GitHub project board</ExternalLink></p>
        </Panel>
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Definition of Ready"><BulletList className="text-sm" items={DEFINITION_OF_READY} /></Panel>
          <Panel title="Definition of Done"><BulletList className="text-sm" items={DEFINITION_OF_DONE} /></Panel>
          <Panel title="Open decisions for CSA" description="Each one affects an acceptance criterion or a release target.">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">{OPEN_DECISIONS.map((d) => <li key={d}>{d}</li>)}</ol>
          </Panel>
        </div>
      </Sub>
    </CriterionSection>
  );
}

// ---------------------------------------------------------------- 6

export function QualitySection() {
  return (
    <CriterionSection criterion={criterion("quality")}>
      <Sub id="test-plan" title="Testing plan">
        <Panel description="Unit and integration tests are meant to run on every pull request; scientific and usability tests at each release.">
          <DataTable
            caption="Testing strategy levels"
            head={["Test level", "What it checks", "When", "Where it stands", "Status"]}
            rows={TEST_LEVELS.map((t) => [<span key="l" className="font-medium text-foreground">{t.level}</span>, t.checks, t.when, t.now, <StatusBadge key="s" status={t.status} label={t.status === "met" ? "In place" : t.status === "partial" ? "Partly in place" : "Not started"} />])}
          />
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Targets</p>
          <BulletList className="mt-1 text-sm" items={TEST_TARGETS} />
        </Panel>
      </Sub>

      <Sub id="test-evidence" title="Test evidence">
        <p className="text-sm leading-relaxed text-muted-foreground">Both suites were run from a fresh install on {SNAPSHOT_DATE}, on the branch that adds this page (main plus this page). Re-run the commands below to reproduce the numbers.</p>
        <div className="grid gap-6 xl:grid-cols-2">
          {TEST_RUNS.map((run) => (
            <Panel key={run.suite} title={run.suite} description={run.where}>
              <dl className="grid grid-cols-3 gap-3 text-center">
                {[["Tests", run.total, "text-foreground"], ["Passed", run.passed, "text-foreground"], ["Failed", run.failed, run.failed ? "text-foreground" : "text-muted-foreground"]].map(([label, value, tone]) => (
                  <div key={label} className="rounded-lg border border-border bg-muted/30 p-3">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                    <dd className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className={`mt-3 rounded-md bg-muted px-3 py-2 ${mono}`}>$ {run.command}</p>
              <Accordion type="single" collapsible>
                <AccordionItem value="files" className="border-0">
                  <AccordionTrigger className="py-3 text-foreground">Show what each test covers</AccordionTrigger>
                  <AccordionContent>
                    <DataTable
                      caption={`${run.suite}: tests`}
                      head={["Test", "Tests", "Covers"]}
                      rows={run.files.map((f) => [
                        <span key="f" className={`${mono} break-all`}>{f.file}</span>,
                        f.failed ? <span key="t" className="whitespace-nowrap text-foreground">{f.tests} ({f.failed} failing)</span> : f.tests,
                        f.covers,
                      ])}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </Panel>
          ))}
        </div>
        <Panel title="Requirements coverage" description="Each acceptance criterion and the automated tests that check it.">
          <DataTable
            caption="Requirements coverage"
            head={["AC", "Criterion", "Tests", "Coverage"]}
            rows={ACCEPTANCE.map((ac) => [
              <Tag key="id">{ac.id}</Tag>, <span key="n" className="font-medium text-foreground">{ac.name}</span>,
              <ul key="t" className="space-y-0.5">{ac.tests.map((t) => <li key={t} className="text-sm">{t}</li>)}</ul>,
              <StatusBadge key="s" status={ac.status} label={ac.status === "met" ? "Covered" : ac.status === "partial" ? "Partly covered" : "Not covered"} />,
            ])}
          />
        </Panel>
      </Sub>

      <Sub id="configuration" title="Configuration management">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel>
            <DataTable
              caption="Configuration management"
              head={["Item", "Rule", "Evidence", "Status"]}
              rows={CM.map((c) => [<span key="i" className="font-medium text-foreground">{c.item}</span>, c.rule, c.evidence, <StatusBadge key="s" status={c.status} label={c.status === "met" ? "Followed" : "Partly followed"} />])}
            />
            <p className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <ExternalLink href={LINKS.repo}>Repository</ExternalLink>
              <ExternalLink href={LINKS.pulls}>Pull requests</ExternalLink>
              <ExternalLink href={LINKS.tags}>Tags</ExternalLink>
            </p>
          </Panel>
          <DiagramFigure diagram={DIAGRAMS.workflow} />
        </div>
        <Panel title="Repeatable build" description="Anyone can reproduce the build and the tests from a fresh clone, with no credentials.">
          <div className="grid gap-4 lg:grid-cols-3">
            {BUILD_STEPS.map((b) => (
              <div key={b.title} className="min-w-0">
                <p className="text-sm font-medium text-foreground">{b.title}</p>
                <pre className={`mt-1 overflow-x-auto rounded-md bg-muted p-3 leading-relaxed ${mono}`}>{b.lines.join("\n")}</pre>
              </div>
            ))}
          </div>
        </Panel>
      </Sub>

      <Sub id="defects" title="Defect tracking">
        <Panel description="Features are tracked as GitHub issues with one owner each. Defects are fixed on fix/ branches through pull requests.">
          <DataTable
            caption="Defect log"
            head={["ID", "Found", "Defect", "State", "Action"]}
            rows={DEFECTS.map((d) => [<Tag key="id">{d.id}</Tag>, <span key="f" className="whitespace-nowrap">{d.found}</span>, d.defect, <ProgressBadge key="s" value={d.state} />, d.action])}
          />
          <p className="mt-3 text-sm"><ExternalLink href={LINKS.issues}>GitHub issues</ExternalLink></p>
        </Panel>
      </Sub>
    </CriterionSection>
  );
}

// ---------------------------------------------------------------- 7

function Board({ sprint }: { sprint: Sprint }) {
  return (
    <div className="space-y-4">
      <Panel>
        <dl className="grid gap-x-6 gap-y-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sprint goal</dt><dd className="mt-1 leading-relaxed text-foreground">{sprint.goal}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dates · release</dt><dd className="mt-1 text-foreground">{sprint.dates} · {sprint.release}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Capacity</dt><dd className="mt-1 text-foreground">{sprint.capacity}</dd></div>
        </dl>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-3" role="group" aria-label={`${sprint.name} board`}>
        {sprint.columns.map((col) => (
          <section key={col.name} aria-label={`${sprint.name}: ${col.name}`} className="rounded-xl border border-border bg-muted/30 p-3">
            <h4 className="flex items-center justify-between text-sm font-semibold text-foreground">
              {col.name}
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">{col.cards.length}</span>
            </h4>
            {col.cards.length ? (
              <ul className="mt-3 space-y-2">
                {col.cards.map((card) => (
                  <li key={card.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2"><Tag>{card.id}</Tag><span className="text-xs text-muted-foreground">{card.meta}</span></div>
                    <p className="mt-2 text-sm leading-relaxed text-foreground">{card.title}</p>
                    <p className="mt-2 text-xs text-foreground">{card.owner}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-muted-foreground">Nothing here.</p>}
          </section>
        ))}
      </div>
      <Panel>
        <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review</dt><dd className="mt-1 leading-relaxed text-muted-foreground">{sprint.review}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unfinished work</dt><dd className="mt-1 leading-relaxed text-muted-foreground">{sprint.carryOver}</dd></div>
        </dl>
      </Panel>
    </div>
  );
}

export function AgileSection() {
  return (
    <CriterionSection criterion={criterion("agile")}>
      <Sub id="sprint-boards" title="Sprint boards">
        <p className="text-sm leading-relaxed text-muted-foreground">
          A snapshot of each sprint as of {SNAPSHOT_DATE}. Sprint 4 cards are the GitHub issues and pull requests. The live board is on GitHub: <ExternalLink href={LINKS.board}>project board</ExternalLink>
        </p>
        <Tabs defaultValue="s4">
          <TabsList className="h-auto max-w-full flex-wrap">
            {SPRINTS.map((s) => <TabsTrigger key={s.id} value={s.id}>{s.name}</TabsTrigger>)}
          </TabsList>
          <TabsContents>
            {SPRINTS.map((s) => <TabsContent key={s.id} value={s.id}><Board sprint={s} /></TabsContent>)}
          </TabsContents>
        </Tabs>
      </Sub>

      <Sub id="ceremonies" title="Cadence and ceremonies">
        <Panel description="Two-week sprints.">
          <DataTable caption="Sprint cadence" head={["Ceremony", "When", "What it produces"]} rows={CADENCE.map((c) => [<span key="n" className="font-medium text-foreground">{c.name}</span>, c.when, c.evidence])} />
        </Panel>
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Stand-up log (Sprint 3 example)">
            <DataTable caption="Stand-up log" head={["Who", "Done", "Next", "Blocked by"]} rows={STANDUPS.map((s) => [<span key="w" className="font-medium text-foreground">{s.who}</span>, s.done, s.next, s.blocker])} />
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Impediments raised and resolved</p>
            <ul className="mt-1 space-y-2 text-sm leading-relaxed text-muted-foreground">
              {IMPEDIMENTS.map((i) => <li key={i.blocker}><span className="text-foreground">{i.blocker}</span> {i.resolution}</li>)}
            </ul>
          </Panel>
          <Panel title={`Retrospective (${RETRO.sprint})`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-foreground">Went well</p><BulletList className="mt-1 text-sm" items={RETRO.wentWell} /></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-foreground">To improve</p><BulletList className="mt-1 text-sm" items={RETRO.improve} /></div>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</p>
            <ul className="mt-1 space-y-2">
              {RETRO.actions.map((a) => (
                <li key={a.action} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 leading-relaxed text-muted-foreground">{a.action} <span className="text-foreground">{a.owner}</span></span>
                  <ProgressBadge value={a.state} />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </Sub>

      <Sub id="feedback" title="Acting on feedback">
        <Panel description="What reviewers asked for at the sprint reviews, and what we did about it.">
          <DataTable
            caption="Feedback and response"
            head={["From", "They asked", "We did", "Where", "State"]}
            rows={FEEDBACK.map((f) => [<span key="f" className="whitespace-nowrap">{f.from}</span>, <span key="a" className="text-foreground">{f.asked}</span>, f.did, f.where, <StatusBadge key="s" status={f.status} label={f.status === "met" ? "Done" : "Partly done"} />])}
          />
        </Panel>
      </Sub>

      <Sub id="ownership" title="Team ownership">
        <Panel description="Every member has a role, an area they own, and merged pull requests.">
          <DataTable caption="Team roles and ownership" head={["Member", "Role", "Owns", "Pull requests"]} rows={TEAM.map((t) => [<span key="m" className="font-medium text-foreground">{t.member}</span>, t.role, t.owns, t.prs])} />
        </Panel>
        <Panel title="Effort and cost" description="Labour is valued at an academic rate of $35 per hour.">
          <DataTable caption="Cost and effort" head={["Sprint", "Hours", "Labour value", "Hosting"]} rows={COSTS.map((c) => [c.sprint, c.hours, c.labour, c.hosting])} />
        </Panel>
      </Sub>
    </CriterionSection>
  );
}

// ---------------------------------------------------------------- 8

export function ImpactSection() {
  return (
    <CriterionSection criterion={criterion("impact")}>
      <Sub id="udl" title="Universal Design principles">
        <Panel>
          <DataTable
            caption="Universal Design principles"
            head={["Principle", "Design action", "Built today", "Requirement", "Status"]}
            rows={UDL.map((u) => [<span key="p" className="font-medium text-foreground">{u.principle}</span>, u.action, u.built, u.req, <StatusBadge key="s" status={u.status} label={u.status === "met" ? "Built" : "Partly built"} />])}
          />
        </Panel>
      </Sub>

      <Sub id="safety" title="Safety, privacy and unintended consequences">
        <Panel description="What could go wrong, and what the design does about it.">
          <DataTable caption="Risks and mitigations" head={["Topic", "What could go wrong", "Mitigation"]} rows={SAFETY.map((s) => [<span key="t" className="font-medium text-foreground">{s.topic}</span>, s.risk, s.mitigation])} />
        </Panel>
      </Sub>

      <div className="grid gap-6 xl:grid-cols-2">
        <Sub id="decisions" title="Decisions these concerns changed">
          <Panel>
            <ul className="space-y-3">
              {DECISIONS.map((d) => (
                <li key={d.decision} className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{d.concern}</p>
                  <p className="mt-1 leading-relaxed text-foreground">{d.decision}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{d.where}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </Sub>
        <Sub id="sustainability" title="Sustainability">
          <Panel description="Alignment with the UN Sustainable Development Goals.">
            <ul className="space-y-3">
              {SDGS.map((g) => (
                <li key={g.goal} className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="font-medium text-foreground">{g.goal}</p>
                  <p className="mt-1 leading-relaxed text-muted-foreground">{g.action}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{g.dimension} · Evidence: {g.evidence}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Preventing collisions limits new orbital debris and the risk of Kessler syndrome. Releasing CADS as open source lets smaller operators and agencies benefit too.
            </p>
          </Panel>
        </Sub>
      </div>
    </CriterionSection>
  );
}
