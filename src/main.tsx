import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  type Context,
  type Event,
  type Hospital,
  type Result,
  type Step,
  type Known,
  type Field,
  registry,
  steps,
  freshContext,
  makeEvent,
  reduceEvent,
  known,
  value,
  localTime,
  localInstant,
} from "./domain";
import {
  seedHospitals,
  loadSaved,
  saveData,
  storageKey,
  latest,
  download,
} from "./data";
import {
  evaluate,
  ask,
  gates,
  engineVersion,
  ctaConcern,
  nudgePriority,
} from "./engine";
import { clean, interpretation } from "./knowledge";
import {
  previewImport,
  activate,
  csvHeaders,
  suggestMap,
  columnKeys,
  importSummary,
  type ColumnMap,
  type Preview,
} from "./imports";
import { challengeFixtures } from "./fixtures";
import { runEvaluation, fixtureContext, percentiles } from "./evaluation";
import "./style.css";
import { Icon } from "./Icon";
import "./workspace.css";

const label = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
type Audit = {
  event: Event;
  hospitalId: string;
  version: string;
  results: Result[];
  action?: string;
  latencyMs?: number;
  coalesced?: boolean;
};
type Measure = {
  eventId: string;
  field?: string;
  type: string;
  revision: number;
  ms: number;
  cards: number;
  committed: boolean;
};
const signature = (r: Result) => `${r.id}:${r.message}:${r.primaryStatus}`;
function Evidence({ r }: { r: Result }) {
  return (
    <details className="evidence">
      <summary>
        View source evidence · {r.citations.length || "absent field"}
      </summary>
      <div className="evidence-body">
        {r.citations.map((s, i) => (
          <div key={s.id + ":" + i} className="source">
            <strong>
              {s.hospitalId} · {s.field}
            </strong>
            <p>{s.raw}</p>
            <small>
              {s.sourceKind} · {s.version} · {s.locator || s.sourceName}
              <br />
              {s.lastVerified
                ? `Verified ${s.lastVerified}`
                : s.sourceKind === "storyboard"
                  ? `Updated ${s.updatedAt || "unknown"} (not verification)`
                  : "Verification date unknown"}
            </small>
          </div>
        ))}
        {r.missingEvidence && (
          <p>
            Searched {r.missingEvidence.hospitalId} ·{" "}
            {r.missingEvidence.version} · {r.missingEvidence.field}.{" "}
            {r.missingEvidence.absent
              ? "Field absent."
              : "Requested availability not documented."}{" "}
            No fabricated source excerpt.
          </p>
        )}
        <p className="muted">{r.rationale}</p>
        <small>Evaluated instant {r.effectiveInstant}</small>
      </div>
    </details>
  );
}
function Card({
  r,
  onDismiss,
  onFix,
}: {
  r: Result;
  onDismiss?: (r: Result) => void;
  onFix?: (field: string) => void;
}) {
  return (
    <article
      className={`card ${r.tier} ${r.primaryStatus}`}
      data-testid="guidance-card"
    >
      <div className="card-meta">
        <span>{label(r.tier)}</span>
        <span className="status">{label(r.primaryStatus)}</span>
      </div>
      <h3>{r.title}</h3>
      <p>{r.message}</p>
      <div className="flags">
        {r.flags
          .filter((x) => x !== r.primaryStatus)
          .map((f) => (
            <span key={f}>{label(f)}</span>
          ))}
      </div>
      <small>
        {r.hospitalId} · {r.version}
      </small>
      <small className="evaluated-time">
        Evaluated {r.effectiveLocal || r.effectiveInstant}
      </small>
      <Evidence r={r} />
      {r.blocksCompletion && onFix ? (
        <button
          className="link"
          onClick={() => onFix(r.missingRequirements[0])}
        >
          Go to required field →
        </button>
      ) : r.tier === "advisory" && onDismiss ? (
        <button className="link" onClick={() => onDismiss(r)}>
          Acknowledge for this encounter
        </button>
      ) : null}
    </article>
  );
}
// Routine guidance stays one line until opened. Caveats that change how the
// text should be read are shown on the closed row, never only once expanded.
const caveats = ["stale", "time_dependent", "interpretation_review"];
function ReferenceRow({ r }: { r: Result }) {
  const shown = [
    ...(r.primaryStatus === "not_in_guide" ? ["not_documented"] : []),
    ...r.flags.filter((f) => caveats.includes(f)),
  ];
  return (
    <details className="reference-row" data-testid="reference-row">
      <summary>
        <span className="reference-head">
          <span className="reference-title">{r.title}</span>
          {shown.map((f) => (
            <span key={f} className={`reference-flag ${f}`}>
              {label(f)}
            </span>
          ))}
        </span>
        <span className="reference-line">{r.message}</span>
      </summary>
      <div className="reference-body">
        <p>{r.message}</p>
        <small>
          {r.hospitalId} · {r.version} · Evaluated{" "}
          {r.effectiveLocal || r.effectiveInstant}
        </small>
        <Evidence r={r} />
      </div>
    </details>
  );
}
function InputField({
  f,
  c,
  onChange,
  onFocus,
}: {
  f: Field;
  c: Context;
  onChange: (id: string, v: Known) => void;
  onFocus: (id: string) => void;
}) {
  const v = value(c, f.id);
  const id = `field-${f.id}`;
  return (
    <div className="field" data-field={f.id}>
      <label htmlFor={id}>{f.label}</label>
      {f.type === "tri" ? (
        <select
          id={id}
          value={
            v === true
              ? "yes"
              : v === false
                ? "no"
                : c.values[f.id]?.state === "not_applicable"
                  ? "na"
                  : ""
          }
          onFocus={() => onFocus(f.id)}
          onChange={(e) =>
            onChange(
              f.id,
              e.target.value === "na"
                ? { state: "not_applicable" }
                : e.target.value
                  ? known(e.target.value === "yes")
                  : { state: "unknown" },
            )
          }
        >
          <option value="">Unknown / not recorded</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="na">Not applicable</option>
        </select>
      ) : f.type === "select" ? (
        <select
          id={id}
          value={String(v || "")}
          onChange={(e) =>
            onChange(
              f.id,
              e.target.value ? known(e.target.value) : { state: "unknown" },
            )
          }
        >
          <option value="">Not recorded</option>
          {f.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : f.type === "textarea" ? (
        <textarea
          id={id}
          value={String(v || "")}
          placeholder={
            f.id === "assessment_plan"
              ? "Synthetic documentation only. Mention EEG or seizure to see availability."
              : "Enter synthetic encounter information…"
          }
          onChange={(e) => onChange(f.id, known(e.target.value))}
        />
      ) : (
        <input
          id={id}
          type={f.type === "datetime" ? "datetime-local" : "text"}
          value={String(v || "")}
          placeholder={
            f.id === "allergies" ? "e.g. none, or alteplase allergy" : ""
          }
          onChange={(e) => onChange(f.id, known(e.target.value))}
        />
      )}
      {f.id === "charge_entered" && (
        <small>
          This records your statement; it does not post a hospital charge.
        </small>
      )}
      {f.id === "plan_confirmed" && (
        <small>
          Prototype extension: record confirmation received from the hospital
          provider.
        </small>
      )}
    </div>
  );
}
function App() {
  const initial = useRef(loadSaved());
  const [hs, setHs] = useState<Hospital[]>(() => [
    ...seedHospitals,
    ...(initial.current?.hospitals || []),
  ]);
  const [c, setC] = useState<Context>(() => {
    const s = initial.current?.context;
    if (
      s &&
      [...seedHospitals, ...(initial.current?.hospitals || [])].some(
        (h) => h.id === s.hospitalId && h.version === s.guideVersion,
      )
    ) {
      try {
        localTime(s.instant, "UTC");
        return s;
      } catch {}
    }
    return freshContext(seedHospitals[5], "2026-03-17T19:30");
  });
  const h = hs.find(
    (h) => h.id === c.hospitalId && h.version === c.guideVersion,
  )!;
  const [tab, setTab] = useState("encounter");
  const [outage, setOutage] = useState(false);
  const [results, setResults] = useState<Result[]>(() =>
    evaluate(h, c, makeEvent(c, "encounter_opened")),
  );
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [completed, setCompleted] = useState(false);
  const [completionText, setCompletionText] = useState("");
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Result>();
  const [clarification, setClarification] = useState("");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [fixture, setFixture] = useState("N2");
  const [clock, setClock] = useState(c.instant);
  const [importText, setImportText] = useState("");
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [mapping, setMapping] = useState<ColumnMap>({});
  const [preview, setPreview] = useState<Preview>();
  const [importNotice, setImportNotice] = useState("");
  const [importHistory, setImportHistory] = useState<unknown[]>(
    initial.current?.imports || [],
  );
  const lastCompletion = useRef("");
  const [search, setSearch] = useState("");
  const [report, setReport] = useState<ReturnType<typeof runEvaluation>>();
  const pending = useRef<{ start: number; event: Event; cards: number }[]>([]);
  const latestC = useRef(c);
  latestC.current = c;
  const visible = outage
    ? []
    : results.filter((r) => !dismissed.includes(signature(r)));
  // One ranking decides prominence. Anything a clinician must act on or
  // reconcile is a card; routine documentation stays collapsed below it, so an
  // applicable rule is never dropped just because it is not urgent.
  const actionable = visible.filter((r) => nudgePriority(r) >= 50);
  const reference = visible.filter((r) => nudgePriority(r) < 50);
  useEffect(() => {
    if (
      !saveData({
        hospitals: hs.filter(
          (h) =>
            !seedHospitals.some(
              (s) => s.id === h.id && s.version === h.version,
            ),
        ),
        context: c,
        imports: importHistory,
      })
    )
      setError(
        "Local persistence unavailable or full; export data before reloading.",
      );
  }, [hs, c, importHistory]);
  useLayoutEffect(() => {
    const batch = pending.current.splice(0);
    if (!batch.length) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const end = performance.now();
        const xs = batch.map((p) => ({
          eventId: p.event.id,
          field: p.event.fieldId,
          type: p.event.type,
          revision: p.event.revision,
          ms: end - p.start,
          cards: p.cards,
          committed:
            latestC.current.revision === p.event.revision &&
            latestC.current.id === p.event.encounterId,
        }));
        setMeasures((prev) => [...prev, ...xs].slice(-1000));
        setAudit((prev) =>
          prev.map((a) => {
            const m = xs.find((x) => x.eventId === a.event.id);
            return m ? { ...a, latencyMs: m.ms } : a;
          }),
        );
      }),
    );
  }, [c, results]);
  function commit(next: Context, e: Event, guide = h, forceAvailable = false) {
    const start = performance.now();
    if (e.type !== "completion_requested") lastCompletion.current = "";
    const updated = reduceEvent(next, e);
    latestC.current = updated;
    const rs = outage && !forceAvailable ? [] : evaluate(guide, updated, e);
    pending.current.push({ start, event: e, cards: rs.length });
    setC(updated);
    setClock(updated.instant);
    setResults(rs);
    setAnswer(undefined);
    setClarification("");
    setError("");
    setCompleted(false);
    setCompletionText("");
    setAudit((a) =>
      [
        ...a,
        { event: e, hospitalId: guide.id, version: guide.version, results: rs },
      ].slice(-500),
    );
    return rs;
  }
  function change(id: string, val: Known) {
    commit(c, makeEvent(c, "field_changed", id, val));
  }
  function focus(id: string) {
    if (id === "thrombolytic_order_placed")
      commit(c, makeEvent(c, "field_focused", id));
  }
  function step(step: Step) {
    commit({ ...c, step }, makeEvent(c, "step_changed"));
  }
  function newHospital(hospital: Hospital) {
    const next = freshContext(hospital);
    setDismissed([]);
    setQuestion("");
    setAnswer(undefined);
    commit(next, makeEvent(next, "encounter_opened"), hospital);
  }
  function launch(id: string) {
    const f = challengeFixtures.find((f) => f.id === id)!;
    const guide = hs.find((h) => h.id === f.hospital)!;
    const next = fixtureContext(guide, f);
    setOutage(false);
    setDismissed([]);
    lastCompletion.current = "";
    setQuestion(f.question || "");
    const rs = commit(
      next,
      makeEvent(next, f.event || "encounter_opened", f.field, known(f.val)),
      guide,
      true,
    );
    if (f.kind === "question") setAnswer(ask(guide, next, f.question!).result);
    if (f.block && f.kind === "nudge")
      setCompletionText(
        rs.some((r) => r.blocksCompletion)
          ? "Completion blocked. Record the requirement below."
          : "",
      );
    setTab("encounter");
  }
  function complete() {
    const key = JSON.stringify([
      c.hospitalId,
      c.guideVersion,
      c.instant,
      c.values,
    ]);
    if (lastCompletion.current === key) return;
    lastCompletion.current = key;
    const event = makeEvent(c, "completion_requested");
    const rs = commit({ ...c, step: "sign_off" }, event);
    if (rs.some((r) => r.blocksCompletion)) {
      setCompletionText("Completion blocked. Record the required state below.");
      requestAnimationFrame(() =>
        document
          .getElementById(
            "field-" +
              rs.find((r) => r.blocksCompletion)!.missingRequirements[0],
          )
          ?.focus(),
      );
    } else {
      setCompleted(true);
      setCompletionText(
        outage
          ? "Mock encounter completed. Guide requirements could not be verified during outage."
          : rs.some(
                (r) =>
                  r.primaryStatus === "conflict" ||
                  r.flags.some((f) =>
                    ["stale", "interpretation_review"].includes(f),
                  ),
              )
            ? "Mock encounter completed with uncertain guide requirements. Review the source warnings."
            : "Mock encounter completed. Known supported guide requirements are satisfied.",
      );
    }
  }
  function applyClock() {
    try {
      if (!/[Zz]|[+-]\d\d:\d\d$/.test(clock))
        throw new Error("Use an ISO instant with Z or an offset.");
      localTime(clock, h.timezone);
      commit({ ...c, instant: clock }, makeEvent(c, "clock_changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function askQuestion(q = question) {
    if (outage) {
      setClarification(
        "Hospital guidance unavailable. No guide answer can be verified.",
      );
      setAnswer(undefined);
      return;
    }
    const response = ask(h, c, q);
    setAnswer(response.result);
    setClarification(response.clarification || "");
    setCandidates(response.candidates || []);
  }
  function previewNow() {
    setPreview(
      previewImport(importText, format, format === "csv" ? mapping : undefined),
    );
    setImportNotice("");
  }
  function activateNow() {
    if (!preview || preview.errors.length) return;
    try {
      const next = activate(hs, preview.hospitals);
      setHs(next);
      setImportHistory((a) => [
        ...a,
        {
          raw: preview.raw,
          diagnostics: preview.diagnostics,
          counts: preview.counts,
          activatedAt: new Date().toISOString(),
          identities: preview.hospitals.map((h) => ({
            id: h.id,
            version: h.version,
          })),
        },
      ]);
      setImportNotice(
        `Activated ${preview.hospitals.length} hospital version(s). Select a new hospital or refresh the active version explicitly.`,
      );
    } catch (e) {
      setImportNotice(e instanceof Error ? e.message : String(e));
    }
  }
  const fields = [
    ...registry,
    ...(h.mappings || [])
      .filter((m) => !registry.some((f) => f.id === m.fieldId))
      .map((m) => ({
        id: m.fieldId,
        label: m.label,
        step: m.step,
        type: "text" as const,
      })),
  ].filter((f) => f.step === c.step);
  // Everything applicable goes to one place — the dock — rather than being
  // split between a rail and the form. Showing a rule twice taught the eye to
  // skip both copies.
  const forField = (id: string) => visible.filter((r) => r.anchor === id);
  const fieldLabels = Object.fromEntries(fields.map((f) => [f.id, f.label]));
  const blocking = visible.filter((r) => r.blocksCompletion);
  // Which field the doctor is in. The dock leads with that field's guidance.
  const [focusedField, setFocusedField] = useState<string>();
  const [chatSeed, setChatSeed] = useState<Result>();
  const [contactsReason, setContactsReason] = useState<string>();
  const openDockOn = (resultId: string) => {
    document
      .querySelector(`[data-result="${CSS.escape(resultId)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const acknowledge = (r: Result) => {
    setDismissed((a) => [...a, signature(r)]);
    setAudit((a) => [
      ...a,
      {
        event: makeEvent(c, "field_focused", r.anchor),
        hospitalId: h.id,
        version: h.version,
        results: [r],
        action: "acknowledged",
      },
    ]);
  };
  const newer = latest(hs).find(
    (x) => x.id === h.id && x.version !== h.version,
  );
  const stats = percentiles(
    measures
      .filter((m) => m.type === "field_changed" && m.committed)
      .map((m) => m.ms),
  );
  return (
    <>
      <header>
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark">
            <Icon name="wave" size={26} />
          </span>
          <span>
            Encounter<span className="brand-accent">Guide</span>
            <small>PROACTIVE CARE COMPANION</small>
          </span>
        </a>
        <nav className="review-links" aria-label="Review resources">
          <a href="/workflow.html">App workflow</a>
          <a href="/integration-review.html">Sevaro integration review</a>
          <a href="/presentation.html">Mentor presentation</a>
        </nav>
        <span className="demo-badge">
          SYNTHETIC WORKSPACE <i /> Rutgers Health Hack
        </span>
      </header>
      <div className="app-shell">
        <nav className="rail" aria-label="Main navigation">
          <div>
            <span className="rail-label">WORKSPACE</span>
            {[
              ["encounter", "01", "Encounter"],
              ["guides", "02", "Guide library"],
              ["evaluation", "03", "Evaluation"],
            ].map(([id, num, name]) => (
              <button
                key={id}
                aria-label={name}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
              >
                <Icon
                  name={
                    id === "encounter"
                      ? "wave"
                      : id === "guides"
                        ? "book"
                        : "chart"
                  }
                />
                {name}
              </button>
            ))}
          </div>
          <div className="rail-footer">
            <Icon name="shield" size={20} /> Built around your workflow
            <p>
              The right guidance, at the right moment. Synthetic hospital data.
            </p>
            <small>Engine {engineVersion}</small>
          </div>
        </nav>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {tab === "encounter"
                  ? "YOUR CLINICAL WORKSPACE"
                  : tab === "guides"
                    ? "SOURCE KNOWLEDGE"
                    : "ENGINE VERIFICATION"}
              </p>
              <h1>
                {tab === "encounter"
                  ? "Less documenting. More presence."
                  : tab === "guides"
                    ? "Source records, made inspectable."
                    : "Evidence before claims."}
              </h1>
            </div>
            {tab === "encounter" && (
              <span className={`case-status ${completed ? "done" : ""}`}>
                {completed ? "✓ Completed" : "● In progress"}
              </span>
            )}
          </div>
          <section className="context-strip" aria-label="Encounter context">
            <label>
              Hospital
              <select
                aria-label="Hospital"
                value={h.id}
                onChange={(e) =>
                  newHospital(latest(hs).find((h) => h.id === e.target.value)!)
                }
              >
                {latest(hs).map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} · {h.id}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <small>Hospital-local clock</small>
              <strong>
                {localTime(c.instant, h.timezone)
                  .toPlainTime()
                  .toString({ smallestUnit: "minute" })}
              </strong>
              <small>
                {localTime(c.instant, h.timezone).toPlainDate().toString()} ·{" "}
                {h.timezone}
              </small>
            </div>
            <div>
              <small>Guide version</small>
              <strong>{h.version}</strong>
              <small>{outage ? "Unavailable" : "Loaded · read-only"}</small>
            </div>
          </section>
          {newer && (
            <div className="banner">
              A newer guide version is available. This encounter is pinned to{" "}
              {h.version}.{" "}
              <button
                onClick={() => {
                  commit(
                    { ...c, guideVersion: newer.version },
                    makeEvent(c, "guide_changed"),
                    newer,
                  );
                  setDismissed([]);
                }}
              >
                Refresh to {newer.version}
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="banner error">
              {error}
            </div>
          )}
          {outage && (
            <div role="status" className="banner">
              Hospital guidance unavailable. The caselog remains usable; guide
              completion requirements cannot be verified.
            </div>
          )}
          {tab === "encounter" && (
            <>
              <details className="demo-controls">
                <summary>Demo controls & scenario launcher</summary>
                <div className="control-grid">
                  <label>
                    Reproducible scenario
                    <select
                      aria-label="Scenario"
                      value={fixture}
                      onChange={(e) => setFixture(e.target.value)}
                    >
                      {challengeFixtures.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.id} · {f.question || label(f.step!)}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => launch(fixture)}>
                      Launch scenario
                    </button>
                  </label>
                  <label>
                    Encounter instant (ISO with offset)
                    <input
                      aria-label="Encounter instant"
                      value={clock}
                      onChange={(e) => setClock(e.target.value)}
                    />
                    <button onClick={applyClock}>Apply clock</button>
                  </label>
                  <label>
                    Provider display zone
                    <select
                      value={c.providerZone}
                      onChange={(e) =>
                        commit(
                          { ...c, providerZone: e.target.value },
                          makeEvent(c, "clock_changed"),
                        )
                      }
                    >
                      {[
                        "America/New_York",
                        "America/Chicago",
                        "America/Denver",
                        "America/Los_Angeles",
                        "UTC",
                        "Asia/Kolkata",
                      ].map((z) => (
                        <option key={z}>{z}</option>
                      ))}
                    </select>
                    <small>
                      {localTime(c.instant, c.providerZone).toString()}
                    </small>
                  </label>
                  <div>
                    <label>
                      <input
                        type="checkbox"
                        checked={outage}
                        onChange={(e) => {
                          setOutage(e.target.checked);
                          setAnswer(undefined);
                          setResults(
                            e.target.checked
                              ? []
                              : evaluate(h, c, makeEvent(c, "guide_changed")),
                          );
                        }}
                      />{" "}
                      Simulate guide outage
                    </label>
                    <button
                      className="secondary"
                      onClick={() => {
                        localStorage.removeItem(storageKey);
                        setHs(seedHospitals);
                        setOutage(false);
                        setDismissed([]);
                        setAudit([]);
                        setMeasures([]);
                        setImportHistory([]);
                        setReport(undefined);
                        setImportText("");
                        setPreview(undefined);
                        setQuestion("");
                        setImportNotice("");
                        setSearch("");
                        setFixture("N2");
                        setFormat("json");
                        setMapping({});
                        const next = freshContext(
                          seedHospitals[5],
                          "2026-03-17T19:30",
                        );
                        commit(
                          next,
                          makeEvent(next, "encounter_opened"),
                          seedHospitals[5],
                          true,
                        );
                      }}
                    >
                      Reset demo data
                    </button>
                  </div>
                </div>
              </details>
              <div className="workspace" id="encounter-workspace">
                <section className="caselog">
                  <div className="section-head">
                    <div>
                      <h2>Your encounter</h2>
                      <small>Synthetic encounter · {c.id.slice(0, 8)}</small>
                    </div>
                    <div className="type-controls">
                      <label>
                        Consult type
                        <select
                          aria-label="Consult type"
                          value={c.consultType}
                          onChange={(e) => {
                            setDismissed([]);
                            commit(
                              { ...c, consultType: e.target.value },
                              makeEvent(c, "step_changed"),
                            );
                          }}
                        >
                          <option>Stroke</option>
                          <option>General Neuro</option>
                        </select>
                      </label>
                      <label>
                        Encounter type
                        <select
                          aria-label="Encounter type"
                          value={c.encounterType}
                          onChange={(e) => {
                            setDismissed([]);
                            commit(
                              {
                                ...c,
                                encounterType: e.target.value,
                                step:
                                  e.target.value === "Rounding"
                                    ? "rounding"
                                    : "intake",
                              },
                              makeEvent(c, "step_changed"),
                            );
                          }}
                        >
                          <option>Acute</option>
                          <option>Rounding</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  <nav className="stepper" aria-label="Caselog steps">
                    {steps
                      .filter(
                        (s) =>
                          s !== "rounding" || c.encounterType === "Rounding",
                      )
                      .map((s, i) => (
                        <button
                          aria-current={c.step === s ? "step" : undefined}
                          key={s}
                          onClick={() => step(s)}
                        >
                          <span>{i + 1}</span>
                          {label(s)}
                        </button>
                      ))}
                  </nav>
                  <div className="form-body">
                    <div className="form-title">
                      <span className="eyebrow">
                        {label(c.step)} · {c.encounterType}
                      </span>
                      <h2>
                        {c.step === "imaging"
                          ? "Document imaging findings"
                          : c.step === "sign_off"
                            ? "Review & complete"
                            : c.step === "rounding"
                              ? "Rounding workflow"
                              : `${label(c.step)} details`}
                      </h2>
                      <p className="muted">
                        Guidance follows recorded context and the selected
                        hospital’s source records.
                      </p>
                    </div>
                    {fields.map((f) => (
                      <div key={f.id} className="manual-field">
                        {forField(f.id).length > 0 && (
                          <div
                            className="field-guidance"
                            aria-live="polite"
                            aria-atomic="false"
                          >
                            {forField(f.id).map((r) =>
                              nudgePriority(r) >= 50 ? (
                                <Card
                                  key={r.id}
                                  r={r}
                                  onDismiss={acknowledge}
                                />
                              ) : (
                                <ReferenceRow key={r.id} r={r} />
                              ),
                            )}
                          </div>
                        )}
                        <InputField
                          f={f}
                          c={c}
                          onChange={change}
                          onFocus={focus}
                        />
                        {f.id === "cta_done" && (
                          <small className="field-context">Record whether the scan was performed, including at another facility. Missing guide information does not mean CTA is unavailable.</small>
                        )}
                      </div>
                    ))}
                    {c.step === "note" && (
                      <details>
                        <summary>Draft note preview</summary>
                        <pre>
                          {String(value(c, "note_title") || "Untitled")}
                          {"\n\n"}
                          {String(
                            value(c, "note_body") || "No note text recorded.",
                          )}
                        </pre>
                      </details>
                    )}
                    {c.step === "sign_off" && (
                      <>
                        <p className="muted">
                          These fields record synthetic workflow statements.
                          Completion does not sign a note or submit a charge to
                          a hospital.
                        </p>
                        <button
                          className="primary"
                          onClick={complete}
                          disabled={completed}
                        >
                          Complete mock encounter →
                        </button>
                        <p
                          role="status"
                          className={completed ? "success" : "completion-error"}
                        >
                          {completionText}
                        </p>
                      </>
                    )}
                  </div>
                  <footer className="form-footer">
                    <span>Values saved locally · revision {c.revision}</span>
                    <button
                      className="secondary"
                      onClick={() =>
                        step(
                          steps[
                            Math.min(
                              steps.indexOf(c.step) + 1,
                              c.encounterType === "Rounding" ? 6 : 5,
                            )
                          ],
                        )
                      }
                    >
                      Next step →
                    </button>
                  </footer>
                </section>
                <aside className="ask-rail" aria-label="Ask the guide">
                  <section className="ask-panel">
                    <p className="eyebrow">ASK THE GUIDE · {h.id}</p>
                    <h2>Just ask, “Bot…”</h2>
                    <p className="muted">
                      Ask aloud while listening, or type below. Every answer
                      stays with this hospital.
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        askQuestion();
                      }}
                    >
                      <label className="sr-only" htmlFor="question">
                        Guide question
                      </label>
                      <textarea
                        id="question"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="e.g. Who mixes the TNK?"
                        maxLength={2000}
                      />
                      <button className="secondary" type="submit">
                        Ask this hospital’s guide →
                      </button>
                    </form>
                    <label className="field-picker">
                      Or choose a source field
                      <select
                        aria-label="Guide field picker"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            setQuestion(e.target.value);
                            askQuestion(e.target.value);
                          }
                        }}
                      >
                        <option value="">Select field…</option>
                        {[...new Set(h.fields.map((s) => s.field))].map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                    {clarification && (
                      <div role="status" className="banner">
                        {clarification}
                        {candidates.map((f) => (
                          <button key={f} onClick={() => askQuestion(f)}>
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                    {answer && <Card r={answer} />}
                  </section>
                  <small className="panel-foot">
                    Same-hospital sources only · No model on the field-event
                    path
                  </small>
                </aside>
              </div>
            </>
          )}
          {tab === "guides" && (
            <div className="guide-layout">
              <section className="panel">
                <div className="section-head">
                  <div>
                    <h2>Read-only source library</h2>
                    <small>
                      {h.fields.length} records · {h.name}
                    </small>
                  </div>
                </div>
                <input
                  aria-label="Search source fields"
                  placeholder="Search fields and original text…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="source-list">
                  {h.fields
                    .filter((s) =>
                      `${s.field} ${s.raw}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((s) => (
                      <details key={s.id}>
                        <summary>
                          <span>{s.field}</span>
                          <small>
                            {s.sourceKind} · {interpretation(s)}
                          </small>
                        </summary>
                        <div className="source">
                          <p>{s.raw}</p>
                          <small>
                            {s.id} · {s.locator} ·{" "}
                            {s.lastVerified
                              ? `Verified ${s.lastVerified}`
                              : `Verification unknown${s.updatedAt ? ` · updated ${s.updatedAt}` : ""}`}
                          </small>
                        </div>
                      </details>
                    ))}
                </div>
                <button
                  className="secondary"
                  onClick={() => download(`${h.id}-${h.version}.json`, h)}
                >
                  Export selected guide
                </button>
              </section>
              <section className="panel importer">
                <p className="eyebrow">DYNAMIC DATA · NO RESTART</p>
                <h2>Import a synthetic guide</h2>
                <p className="muted">
                  Create an immutable guide version. Preview validation and
                  interpretation before activation.
                </p>
                <label>
                  Upload JSON or CSV
                  <input
                    type="file"
                    accept=".json,.csv,application/json,text/csv"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 1_000_000) {
                        setImportNotice("File exceeds 1 MB.");
                        return;
                      }
                      const text = await file.text();
                      const fmt = file.name.endsWith(".csv") ? "csv" : "json";
                      setFormat(fmt);
                      setImportText(text);
                      setPreview(undefined);
                      if (fmt === "csv")
                        setMapping(suggestMap(csvHeaders(text).headers));
                    }}
                  />
                </label>
                <label>
                  Format
                  <select
                    aria-label="Import format"
                    value={format}
                    onChange={(e) => {
                      setFormat(e.target.value as "json" | "csv");
                      setPreview(undefined);
                      if (e.target.value === "csv")
                        setMapping(suggestMap(csvHeaders(importText).headers));
                    }}
                  >
                    <option value="json">JSON</option>
                    <option value="csv">CSV with header mapping</option>
                  </select>
                </label>
                <label>
                  Paste synthetic data
                  <textarea
                    aria-label="Import data"
                    className="code-input"
                    value={importText}
                    onChange={(e) => {
                      setImportText(e.target.value);
                      setPreview(undefined);
                      if (format === "csv")
                        setMapping(
                          suggestMap(csvHeaders(e.target.value).headers),
                        );
                    }}
                    placeholder={
                      '{"id":"DEMO-NEW","name":"New Synthetic Hospital", "timezone":"America/Chicago","version":"v1","fields":{"Interpreter connection procedure":"Call language desk"}}'
                    }
                  />
                </label>
                {format === "csv" && (
                  <div className="column-map">
                    {columnKeys.map((k) => (
                      <label key={k}>
                        {k}
                        <select
                          aria-label={k}
                          value={mapping[k] || ""}
                          onChange={(e) => {
                            setMapping({ ...mapping, [k]: e.target.value });
                            setPreview(undefined);
                          }}
                        >
                          <option value="">Unmapped</option>
                          {csvHeaders(importText).headers.map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
                <button className="secondary" onClick={previewNow}>
                  Preview & validate
                </button>
                {preview && (
                  <div className="preview" role="status">
                    <h3>
                      {preview.errors.length
                        ? "Import rejected"
                        : `${preview.hospitals.length} hospital(s) ready`}
                    </h3>
                    {preview.errors.map((x, i) => (
                      <p className="error-text" key={i}>
                        {x}
                      </p>
                    ))}
                    <p>{importSummary(preview)}</p>
                    {preview.hospitals.map((h) => (
                      <div key={h.id}>
                        <strong>
                          {h.name} · {h.id}
                        </strong>
                        <p>
                          {h.timezone} · {h.version} · {h.fields.length}{" "}
                          retained records
                        </p>
                        <details>
                          <summary>Mapped records & interpretations</summary>
                          {h.fields.map((s) => (
                            <div key={s.id} className="source">
                              <strong>
                                {s.field} · {interpretation(s)}
                              </strong>
                              <p>{s.raw}</p>
                              <small>
                                {s.lastVerified || "Verification unknown"}
                              </small>
                            </div>
                          ))}
                        </details>
                      </div>
                    ))}
                    <details>
                      <summary>
                        Interpretation diagnostics ({preview.diagnostics.length}
                        )
                      </summary>
                      {preview.diagnostics.map((d, i) => (
                        <p key={i}>{d}</p>
                      ))}
                    </details>
                    <button
                      className="primary"
                      disabled={
                        preview.errors.length > 0 || !preview.hospitals.length
                      }
                      onClick={activateNow}
                    >
                      Activate validated bundle
                    </button>
                  </div>
                )}
                {importNotice && <p role="status">{importNotice}</p>}
                <small>
                  Unknown fields are retained and searchable. Unsupported
                  conditional wording requires review; it cannot create
                  executable code or completion gates.
                </small>
              </section>
            </div>
          )}
          {tab === "evaluation" && (
            <>
              <section className="metrics">
                <div>
                  <small>Challenge nudges</small>
                  <strong>
                    {report ? `${report.summary.nudge} / 9` : "—"}
                  </strong>
                  <p>Includes required silence</p>
                </div>
                <div>
                  <small>Grounded questions</small>
                  <strong>
                    {report ? `${report.summary.questions} / 20` : "—"}
                  </strong>
                  <p>Meaning, status, source assertions</p>
                </div>
                <div>
                  <small>Observed field latency · p95</small>
                  <strong>
                    {stats.count ? `${stats.p95.toFixed(1)} ms` : "—"}
                  </strong>
                  <p>
                    {stats.count} browser samples · max {stats.max.toFixed(1)}{" "}
                    ms
                  </p>
                </div>
              </section>
              <section className="panel">
                <div className="section-head">
                  <div>
                    <h2>Acceptance workbench</h2>
                    <small>
                      Runs live engine against a separate source-authored
                      oracle.
                    </small>
                  </div>
                  <button
                    className="primary"
                    onClick={() => setReport(runEvaluation(seedHospitals))}
                  >
                    Run 29 sponsor cases
                  </button>
                </div>
                <div className="button-row">
                  <button
                    disabled={!report}
                    onClick={() =>
                      download("evaluation.json", {
                        ...report,
                        browserLatency: {
                          method:
                            "Event handler receipt → React commit → two requestAnimationFrame callbacks. Paint approximation; foreground tab; includes frame waiting.",
                          summary: stats,
                          samples: measures,
                        },
                      })
                    }
                  >
                    Export JSON
                  </button>
                  <button
                    disabled={!report}
                    onClick={() =>
                      download(
                        "evaluation.csv",
                        "id,pass,engine_ms,errors\n" +
                          report!.cases
                            .map(
                              (c) =>
                                `${c.id},${c.pass},${c.engineMs.toFixed(3)},"${c.errors.join("; ").replaceAll('"', '""')}"`,
                            )
                            .join("\n"),
                      )
                    }
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={() => download("encounter-audit.json", audit)}
                  >
                    Export encounter audit
                  </button>
                  <button
                    onClick={() =>
                      download("browser-latency.json", {
                        summary: stats,
                        samples: measures,
                      })
                    }
                  >
                    Export latency
                  </button>
                </div>
                {report ? (
                  <div className="case-list">
                    {report.cases.map((r) => (
                      <details key={r.id}>
                        <summary>
                          <span className={r.pass ? "pass" : "fail"}>
                            {r.pass ? "PASS" : "FAIL"}
                          </span>
                          <strong>{r.id}</strong>
                          <span>
                            {r.expected.question || label(r.expected.step!)}
                          </span>
                          <small>{r.engineMs.toFixed(2)} ms engine</small>
                        </summary>
                        <div className="case-detail">
                          <button
                            onClick={() => {
                              setFixture(r.id);
                              launch(r.id);
                            }}
                          >
                            Launch in encounter →
                          </button>
                          <p>
                            Expected:{" "}
                            {r.expected.status || r.expected.tier || "silence"}{" "}
                            · {r.expected.contains.join(" · ")}
                          </p>
                          {r.errors.map((x) => (
                            <p className="error-text" key={x}>
                              {x}
                            </p>
                          ))}
                          {r.actual.map((a) => (
                            <Card key={a.id} r={a} />
                          ))}
                          {!r.actual.length && <p>No cards emitted.</p>}
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <h3>Run the engine to see actual results.</h3>
                    <p>Results are calculated here, not precomputed badges.</p>
                  </div>
                )}
              </section>
              <section className="panel">
                <h2>Measurements & event rationale</h2>
                <p>
                  Latency starts at the adapter handler and ends after React
                  commit plus two animation frames. This approximates paint
                  readiness; it is not a browser pixel measurement. Samples from
                  a background tab may include scheduler delay.
                </p>
                <p>
                  Field samples: p50 {stats.p50.toFixed(1)} ms · p95{" "}
                  {stats.p95.toFixed(1)} ms · maximum {stats.max.toFixed(1)} ms.
                  Engine-only timings above exclude rendering.
                </p>
                <details>
                  <summary>Encounter-local event log ({audit.length})</summary>
                  {audit
                    .slice(-30)
                    .reverse()
                    .map((a, i) => (
                      <div className="source" key={a.event.id + ":" + i}>
                        <strong>
                          {a.action || a.event.type} ·{" "}
                          {a.event.fieldId || "context"} · {a.hospitalId}
                        </strong>
                        <p>
                          {a.results.length
                            ? a.results
                                .map((r) => `${r.primaryStatus}: ${r.message}`)
                                .join(" | ")
                            : "No applicable guidance"}
                        </p>
                        <small>
                          {a.event.id} · revision {a.event.revision} ·{" "}
                          {a.version} · {a.latencyMs?.toFixed(1) || "—"} ms
                        </small>
                      </div>
                    ))}
                </details>
                <p className="muted">
                  Local diagnostic log only. Not a tamper-proof compliance
                  audit.
                </p>
              </section>
            </>
          )}
          <footer className="page-footer">
            Synthetic rules for hackathon prototyping only. No real patient
            data, treatment decisions, or hospital connections.
          </footer>
        </main>
      </div>
    </>
  );
}
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main>
        <h1>The prototype encountered an error.</h1>
        <p>
          Saved source work is preserved. Reset prototype data to reopen the
          demo.
        </p>
        <button
          onClick={() => {
            localStorage.removeItem(storageKey);
            location.reload();
          }}
        >
          Reset prototype data
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
