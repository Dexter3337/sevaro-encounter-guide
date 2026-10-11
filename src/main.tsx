import React, {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  useMemo,
  useCallback,
} from "react";
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
  liveContext,
  nowInstant,
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
  answerField,
  gates,
  engineVersion,
  completionChecklist,
  resultSignature,
} from "./engine";
import { NudgeDock } from "./guidance/NudgeDock";
import { NudgeCard } from "./guidance/NudgeCard";
import { FieldMarker } from "./guidance/FieldMarker";
import { GateBanner } from "./encounter/GateBanner";
import { StoryboardCard } from "./encounter/StoryboardCard";
import { ChatPanel } from "./chat/ChatPanel";
import { ContactsSheet } from "./contacts/ContactsSheet";
import { fetchShared, newFromShared, publishShared } from "./sharedLibrary";
import { clean, interpretation } from "./knowledge";
import {
  previewImportBundle,
  activate,
  csvHeaders,
  csvKind,
  suggestMap,
  columnKeys,
  importSummary,
  type ColumnMap,
  type Held,
  type ImportFile,
  type Preview,
} from "./imports";
import { challengeFixtures } from "./fixtures";
import { runEvaluation, fixtureContext, percentiles } from "./evaluation";
import "./style.css";
import { Icon } from "./Icon";
import "./workspace.css";
import "./sprint.css";
import "./consultation.css";
import { ConsultationPane } from "./encounter/ConsultationPane";
import "./shell.css";
import "./demo-polish.css";
import { TranscriptDrafts } from "./llm/TranscriptDrafts";
import type { Segment } from "./stt/protocol";
import type { GuideMode, ReportReason } from "./guidance/types";
import {
  makeReport,
  submitReport,
  localReports,
  fetchReports,
  reasonText,
  type GuideReport,
} from "./feedback";

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
// `?guidance-fail` makes every evaluation throw, to prove the caselog survives
// a guidance failure (guardrail 14). Never set in normal use.
const forcedGuidanceFailure =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("guidance-fail");
function InputField({
  f,
  c,
  onChange,
  onFocus,
  onBlur,
  marker,
  hint,
}: {
  f: Field;
  c: Context;
  onChange: (id: string, v: Known) => void;
  onFocus: (id: string) => void;
  onBlur: () => void;
  marker?: React.ReactNode;
  hint?: React.ReactNode;
}) {
  const v = value(c, f.id);
  const id = `field-${f.id}`;
  // Focus is the doctor looking at a field; the dock leads with its guidance.
  const watch = { onFocusCapture: () => onFocus(f.id), onBlurCapture: onBlur };
  return (
    <div className="field" data-field={f.id} {...watch}>
      <span className="field-label-row">
        <label htmlFor={id}>{f.label}</label>
        {marker}
      </span>
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
              : f.id === "reason_for_consult"
                ? "e.g. Synthetic stroke alert, left-sided weakness"
                : "Synthetic encounter information…"
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
      {hint}
    </div>
  );
}
function App() {
  const initial = useRef(loadSaved());
  const [hs, setHs] = useState<Hospital[]>(() => [
    ...seedHospitals,
    ...(initial.current?.hospitals || []),
  ]);
  // Every visit opens a new encounter at the current time. The caselog belongs
  // to one patient: nothing recorded in a previous session is carried into
  // this one, whichever hospital it was for. Hospitals, imports and held rows
  // are what persist on this device.
  const [c, setC] = useState<Context>(() => liveContext(seedHospitals[5]));
  // Live: the encounter follows the real clock. A scenario or a set instant
  // pins it, and the header says so.
  const [live, setLive] = useState(true);
  const h = hs.find(
    (h) => h.id === c.hospitalId && h.version === c.guideVersion,
  )!;
  const [tab, setTab] = useState("encounter");
  const [outage, setOutage] = useState(false);
  const [results, setResults] = useState<Result[]>(() => {
    try {
      return evaluate(h, c, makeEvent(c, "encounter_opened"));
    } catch {
      return [];
    }
  });
  const resultsRef = useRef<Result[]>(results);
  // Acknowledged nudges stay on screen, marked, and never reopen by themselves.
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [reported, setReported] = useState<string[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [completed, setCompleted] = useState(false);
  const [completionText, setCompletionText] = useState("");
  const [error, setError] = useState("");
  // The doctor's escalation ladder, in one column beside the form: the
  // guidance, then the guide chat, then a person.
  const [mode, setMode] = useState<GuideMode>("guidance");
  const [attention, setAttention] = useState(false);
  const chatOpen = mode === "chat";
  const [transcriptState, setTranscriptState] = useState<{ id: string; segments: Segment[] }>({ id: "", segments: [] });
  const transcriptKey = `${c.id}:${h.version}`;
  const transcript = transcriptState.id === transcriptKey ? transcriptState.segments : [];
  const onTranscript = useCallback((segments: Segment[]) => setTranscriptState({ id: transcriptKey, segments }), [transcriptKey]);
  const [llmAccessCode, setLlmAccessCode] = useState("");
  const [chatSeed, setChatSeed] = useState<Result>();
  const [contactsFor, setContactsFor] = useState<{ reason?: string }>();
  const showContacts = (reason?: string) => {
    setContactsFor({ reason });
    setMode("contacts");
  };
  const setChatOpen = (open: boolean) => setMode(open ? "chat" : "guidance");
  // Layout preferences for this device only.
  const [ui, setUi] = useState(() => {
    const narrow = typeof window !== "undefined" && window.innerWidth < 1200;
    try {
      const saved = JSON.parse(localStorage.getItem("encounter-guide:ui") || "{}");
      return { rail: saved.rail ?? !narrow, video: saved.video ?? !narrow };
    } catch {
      return { rail: !narrow, video: !narrow };
    }
  });
  const setUiPref = (next: Partial<typeof ui>) =>
    setUi((prev) => {
      const v = { ...prev, ...next };
      try {
        localStorage.setItem("encounter-guide:ui", JSON.stringify(v));
      } catch {}
      return v;
    });
  const [dockRequest, setDockRequest] = useState<{
    resultId?: string;
    nonce: number;
  }>();
  const [focusedField, setFocusedField] = useState<string>();
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The hard stop lives at the Complete button once the doctor has tried it.
  const [gateShown, setGateShown] = useState(false);
  const [released, setReleased] = useState<{ id: string; reason: string }[]>(
    [],
  );
  const [guidanceFailed, setGuidanceFailed] = useState(false);
  const [notice, setNotice] = useState("");
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
  // Files dropped or chosen together; the pasted text joins them as one more.
  const [importFiles, setImportFiles] = useState<ImportFile[]>([]);
  // Storyboard rows and contacts for a hospital not loaded yet. Kept between
  // drops so the guide can arrive second.
  const [held, setHeld] = useState<Held[]>(initial.current?.held || []);
  const [dragging, setDragging] = useState(false);
  // The team's cloud library. Loading from it and sharing to it are explicit
  // actions: a hospital someone else rehearsed with never appears unasked, so
  // importing an unseen hospital stays a clean, repeatable demonstration.
  const [sharedStatus, setSharedStatus] = useState("");
  const [shareable, setShareable] = useState<Hospital[]>([]);
  async function loadShared() {
    setSharedStatus("Contacting the team library…");
    const shared = await fetchShared();
    if (!shared) {
      setSharedStatus("The team library is not reachable — working on this device only.");
      return;
    }
    const add = newFromShared(hs, shared);
    if (add.length) setHs((prev) => [...prev, ...newFromShared(prev, add)]);
    setSharedStatus(
      `Team library: ${shared.length} hospital version(s) · ${add.length ? `${add.length} added to this device` : "nothing new for this device"}.`,
    );
  }
  async function shareNow() {
    setSharedStatus("Sharing with the team library…");
    const r = await publishShared(shareable);
    setSharedStatus(
      r
        ? `Shared with the team library (${r.stored} new, ${r.existing} already there).`
        : "The team library is not reachable — saved on this device only.",
    );
    if (r) setShareable([]);
  }
  const lastCompletion = useRef("");
  // Bumped when a report is filed, so the library's list re-reads this device.
  const [reportsTick, setReportsTick] = useState(0);
  const [search, setSearch] = useState("");
  const [report, setReport] = useState<ReturnType<typeof runEvaluation>>();
  const pending = useRef<{ start: number; event: Event; cards: number }[]>([]);
  const latestC = useRef(c);
  latestC.current = c;
  const visible = outage ? [] : results;
  // Only hospital data persists on this device — never the encounter.
  useEffect(() => {
    if (
      !saveData({
        hospitals: hs.filter(
          (h) =>
            !seedHospitals.some(
              (s) => s.id === h.id && s.version === h.version,
            ),
        ),
        imports: importHistory,
        held,
      })
    )
      setError(
        "Local persistence unavailable or full; export data before reloading.",
      );
  }, [hs, importHistory, held]);
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
    // Guidance failing must never stop the caselog: the value is recorded
    // whatever the engine does, and the dock says guidance is unavailable.
    let rs: Result[] = [];
    if (!outage || forceAvailable)
      try {
        if (forcedGuidanceFailure)
          throw new Error("Guidance failure forced for testing.");
        // Passing the last results lets the engine tell new from already seen,
        // so the panel does not reopen on every keystroke.
        const fresh =
          e.type === "encounter_opened" ||
          e.type === "guide_changed" ||
          guide.id !== h.id;
        rs = evaluate(guide, updated, e, fresh ? [] : resultsRef.current);
        setGuidanceFailed(false);
      } catch {
        rs = [];
        setGuidanceFailed(true);
      }
    resultsRef.current = rs;
    pending.current.push({ start, event: e, cards: rs.length });
    setC(updated);
    setClock(updated.instant);
    setResults(rs);
    if (e.type === "encounter_opened" || e.type === "guide_changed") {
      setGateShown(false);
      setReleased([]);
    }
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
  // The live clock: the encounter moves to the real time as minutes pass, so
  // coverage windows and who is on duty stay correct while the doctor works.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    if (!live || completed) return;
    const tick = () => {
      const now = nowInstant(),
        cur = latestC.current;
      if (now !== cur.instant)
        commitRef.current(
          { ...cur, instant: now },
          makeEvent(cur, "clock_changed"),
        );
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [live, completed, h.id, h.version]);
  function goLive() {
    setLive(true);
    commit({ ...c, instant: nowInstant() }, makeEvent(c, "clock_changed"));
  }
  function change(id: string, val: Known) {
    commit(c, makeEvent(c, "field_changed", id, val));
  }
  // Results are already per step, so focus needs no engine call: it only tells
  // the dock which field's guidance to lead with. Leaving a field lets the dock
  // settle after a moment rather than flicker between fields.
  function focus(id: string) {
    clearTimeout(blurTimer.current);
    setFocusedField(id);
  }
  function blur() {
    clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => setFocusedField(undefined), 1500);
  }
  function step(step: Step) {
    commit({ ...c, step }, makeEvent(c, "step_changed"));
  }
  function newHospital(hospital: Hospital) {
    // A new patient: nothing recorded carries over. A pinned scenario time is
    // kept; otherwise the encounter starts now.
    const next = live
      ? liveContext(hospital)
      : { ...liveContext(hospital), instant: c.instant };
    setAcknowledged([]);
    setReported([]);
    setMode("guidance");
    setChatSeed(undefined);
    setContactsFor(undefined);
    commit(next, makeEvent(next, "encounter_opened"), hospital);
  }
  function launch(id: string) {
    const f = challengeFixtures.find((f) => f.id === id)!;
    const guide = hs.find((h) => h.id === f.hospital)!;
    const next = fixtureContext(guide, f);
    setLive(false);
    setOutage(false);
    setAcknowledged([]);
    setReported([]);
    lastCompletion.current = "";
    const rs = commit(
      next,
      makeEvent(next, f.event || "encounter_opened", f.field, known(f.val)),
      guide,
      true,
    );
    setContactsFor(undefined);
    // A question scenario opens the guide chat on its answer.
    if (f.kind === "question") {
      setChatSeed(ask(guide, next, f.question!).result);
      setChatOpen(true);
    } else {
      setChatSeed(undefined);
      setChatOpen(false);
    }
    if (f.block && f.kind === "nudge" && rs.some((r) => r.blocksCompletion)) {
      setGateShown(true);
      setCompletionText("Completion blocked — record what is marked Required.");
    }
    setTab("encounter");
  }
  function complete(release = released) {
    const key = JSON.stringify([
      c.hospitalId,
      c.guideVersion,
      c.instant,
      c.values,
      release,
    ]);
    if (lastCompletion.current === key) return;
    lastCompletion.current = key;
    const event = makeEvent(c, "completion_requested");
    const rs = commit({ ...c, step: "sign_off" }, event);
    // A gate clears only by recording the value, or — where the hospital's
    // rule allows it — by an acknowledgement with a reason. Never silently.
    const blocking = rs.filter(
      (r) =>
        r.blocksCompletion &&
        !(
          r.release === "acknowledge_with_reason" &&
          release.some((x) => x.id === r.id)
        ),
    );
    if (blocking.length) {
      setGateShown(true);
      setCompletionText("Completion blocked — record what is marked Required.");
      requestAnimationFrame(() =>
        document
          .getElementById("field-" + blocking[0].missingRequirements[0])
          ?.focus(),
      );
    } else {
      setGateShown(false);
      setCompleted(true);
      const acknowledged = rs
        .filter((r) => r.blocksCompletion)
        .map((r) => {
          const why = release.find((x) => x.id === r.id)?.reason;
          return ` ${r.title} acknowledged without confirmation: "${why}".`;
        })
        .join("");
      setCompletionText(
        (outage
          ? "Encounter completed. Guide requirements could not be verified during the outage."
          : rs.some(
                (r) =>
                  r.primaryStatus === "conflict" ||
                  r.flags.some((f) =>
                    ["stale", "interpretation_review"].includes(f),
                  ),
              )
            ? "Encounter completed with uncertain guide requirements. Review the source warnings."
            : "Encounter completed. Known supported guide requirements are satisfied.") +
          acknowledged,
      );
    }
  }
  function acknowledgeGate(r: Result, reason: string) {
    const next = [
      ...released.filter((x) => x.id !== r.id),
      { id: r.id, reason },
    ];
    setReleased(next);
    setAudit((a) => [
      ...a,
      {
        event: makeEvent(c, "completion_requested"),
        hospitalId: h.id,
        version: h.version,
        results: [r],
        action: `gate acknowledged with reason: ${reason}`,
      },
    ]);
    complete(next);
  }
  function applyClock() {
    try {
      if (!/[Zz]|[+-]\d\d:\d\d$/.test(clock))
        throw new Error("Use an ISO instant with Z or an offset.");
      localTime(clock, h.timezone);
      setLive(false);
      commit({ ...c, instant: clock }, makeEvent(c, "clock_changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function openChat(seed?: Result) {
    setChatSeed(seed);
    setChatOpen(true);
  }
  function previewNow() {
    const pasted: ImportFile[] = importText.trim()
      ? [
          {
            name: "",
            text: importText,
            format,
            map: format === "csv" ? mapping : undefined,
          },
        ]
      : [];
    setPreview(
      previewImportBundle([...importFiles, ...pasted], { existing: hs, held }),
    );
    setImportNotice("");
  }
  async function addFiles(list: FileList | null) {
    const files = [...(list || [])];
    if (!files.length) return;
    const tooBig = files.filter((f) => f.size > 1_000_000);
    if (tooBig.length) {
      setImportNotice(
        `${tooBig.map((f) => f.name).join(", ")} exceeds the 1 MB limit.`,
      );
      return;
    }
    const read: ImportFile[] = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        text: await f.text(),
        format: f.name.toLowerCase().endsWith(".csv") ? "csv" : "json",
      })),
    );
    setImportFiles((prev) => [
      ...prev.filter((p) => !read.some((r) => r.name === p.name)),
      ...read,
    ]);
    setPreview(undefined);
    setImportNotice("");
  }
  function activateNow() {
    if (!preview || preview.errors.length) return;
    try {
      const next = activate(hs, preview.hospitals);
      setHs(next);
      setHeld(preview.held);
      setImportFiles([]);
      setPreview(undefined);
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
        preview.hospitals.length
          ? `Activated ${preview.hospitals.length} hospital version(s). Select a new hospital or refresh the active version explicitly.`
          : "Nothing new to activate. Held rows are kept until their hospital's guide is imported.",
      );
      // Offer to share what was just activated; never share it unasked.
      setShareable(preview.hospitals);
      setSharedStatus("");
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
  const openDockOn = (resultId?: string) => {
    setMode("guidance");
    setAttention(false);
    setDockRequest({ resultId, nonce: Date.now() });
  };
  // The gate is re-read from the engine on every render once the doctor has
  // tried to complete, so recording the value clears it as they type.
  const gateResults = (() => {
    if (!gateShown || outage || c.step !== "sign_off") return [];
    try {
      return gates(h, c).filter(
        (r) =>
          r.blocksCompletion &&
          !(
            r.release === "acknowledge_with_reason" &&
            released.some((x) => x.id === r.id)
          ),
      );
    } catch {
      return [];
    }
  })();
  // "See both sources" on the storyboard card: the dock entry when there is
  // one at this step, otherwise the guide chat on that field.
  const openConflict = (field: string) => {
    const r = visible.find((x) => x.title === field);
    if (r) openDockOn(r.id);
    else
      try {
        openChat(answerField(h, c, field));
      } catch {
        openChat();
      }
  };
  const reportNudge = async (r: Result, reason: ReportReason, comment: string) => {
    setReported((x) => [...x, r.id]);
    setAudit((a) => [
      ...a,
      {
        event: makeEvent(c, "field_focused", r.anchor),
        hospitalId: h.id,
        version: h.version,
        results: [r],
        action: `reported: ${reasonText[reason]}${comment ? ` — ${comment}` : ""}`,
      },
    ]);
    const report = makeReport(r, reason, comment);
    const delivered = await submitReport(report);
    setReportsTick((n) => n + 1);
    const receipt = delivered ? "Report received by the team inbox."
      : localReports().some((item) => item.id === report.id)
        ? "Saved on this device only. The report was not delivered to the team."
        : "Report could not be delivered or saved. Please try again.";
    return receipt;
  };
  const undoAcknowledge = (r: Result) =>
    setAcknowledged((a) => a.filter((x) => x !== resultSignature(r)));
  const acknowledge = (r: Result) => {
    setAcknowledged((a) => [...a, resultSignature(r)]);
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
  const checklist =
    c.step === "sign_off" && !outage
      ? (() => {
          try {
            return completionChecklist(h, c);
          } catch {
            return [];
          }
        })()
      : [];
  // Each requirement field says, under itself, where this hospital stands:
  // the doctor never has to press Complete to find out.
  const requirementHint = (id: string) => {
    const i = checklist.find((x) => x.requirement === id);
    if (!i) return undefined;
    const said = {
      missing: `Required by ${h.name} before completion.`,
      satisfied: `Required by ${h.name} — recorded.`,
      unclear: `${h.name}'s rule may be out of date — check before completing.`,
      not_required: `Not required by ${h.name}.`,
      not_in_guide: `${h.name}'s guide doesn't say whether this is required.`,
    }[i.state];
    return (
      <small className={`eg-req ${i.state}`} data-state={i.state}>
        {said}
        {id === "charge_entered" && " Records your statement; no charge is posted."}
      </small>
    );
  };
  const stepList = steps.filter(
    (s) => s !== "rounding" || c.encounterType === "Rounding",
  );
  const stepIndex = stepList.indexOf(c.step);
  const nextStep = stepList[stepIndex + 1];
  const prevStep = stepList[stepIndex - 1];
  const recorded = Object.values(c.values).filter(
    (v) => v.state !== "unknown",
  ).length;
  const clockOf = (zone: string) => {
    const t = localTime(c.instant, zone);
    let date = t.toPlainDate().toString();
    try {
      date = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(c.instant));
    } catch {}
    let abbr = zone;
    try {
      abbr =
        new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
          .formatToParts(new Date(c.instant))
          .find((p) => p.type === "timeZoneName")?.value ?? zone;
    } catch {}
    return {
      time: t.toPlainTime().toString({ smallestUnit: "minute" }),
      date,
      abbr,
    };
  };
  const hospitalClock = clockOf(h.timezone);
  const yourClock = clockOf(c.providerZone);
  const guidanceCount = visible.length;
  const loudest = visible.some((r) => r.blocksCompletion)
    ? "hard_stop"
    : visible.some((r) => r.tier === "advisory")
      ? "advisory"
      : "info";
  return (
    <>
      <div className={`eg${ui.rail ? "" : " rail-closed"}`}>
        <header className="eg-top">
          <button
            className="eg-icon"
            onClick={() => setUiPref({ rail: !ui.rail })}
            aria-label={ui.rail ? "Hide navigation" : "Show navigation"}
            aria-expanded={ui.rail}
            title={ui.rail ? "Hide navigation" : "Show navigation"}
          >
            <Icon name="menu" />
          </button>
          <a
            className="eg-brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setTab("encounter");
            }}
          >
            <span className="eg-brand-mark">
              <Icon name="wave" size={18} />
            </span>
            <span>
              Encounter<b>Guide</b>
            </span>
          </a>
          <label className="eg-hospital">
            <span>Hospital</span>
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
          {/* Every rule is read on the hospital's clock; the doctor's own is
              shown beside it so the difference is never a surprise. */}
          <div className="eg-clocks">
            <div className="eg-clock hospital" data-testid="hospital-clock">
              <span className="eg-clock-label">
                Hospital time
                {live ? (
                  <i className="eg-live">Live</i>
                ) : (
                  <i className="eg-pinned">Scenario</i>
                )}
              </span>
              <strong>{hospitalClock.time}</strong>
              <small title={h.timezone}>
                {hospitalClock.date} · {hospitalClock.abbr}
              </small>
            </div>
            <div className="eg-clock" data-testid="provider-clock">
              <span className="eg-clock-label">Your time</span>
              <strong>{yourClock.time}</strong>
              <small title={c.providerZone}>
                {yourClock.date} · {yourClock.abbr}
              </small>
            </div>
            {!live && (
              <button className="eg-btn small" onClick={goLive}>
                <Icon name="clock" size={15} /> Use live time
              </button>
            )}
          </div>
          <div className="eg-top-actions">
            <button
              className="eg-btn"
              onClick={() => newHospital(h)}
              title="Start a new, empty encounter for this hospital"
            >
              <Icon name="plus" size={16} /> New encounter
            </button>
            <details className="demo-controls eg-demo">
              <summary>Demo</summary>
              <div className="eg-demo-panel control-grid">
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
                  <button onClick={() => launch(fixture)}>Launch scenario</button>
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
                  Your display zone
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
                      ...new Set([
                        c.providerZone,
                        "America/New_York",
                        "America/Chicago",
                        "America/Denver",
                        "America/Los_Angeles",
                        "UTC",
                        "Asia/Kolkata",
                        "Asia/Tokyo",
                      ]),
                    ].map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </label>
                <div>
                  <label className="eg-check">
                    <input
                      type="checkbox"
                      checked={outage}
                      onChange={(e) => {
                        setOutage(e.target.checked);
                        const rs = e.target.checked
                          ? []
                          : evaluate(h, c, makeEvent(c, "guide_changed"));
                        resultsRef.current = rs;
                        setResults(rs);
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
                      setAcknowledged([]);
                      setReported([]);
                      setAudit([]);
                      setMeasures([]);
                      setImportHistory([]);
                      setImportFiles([]);
                      setHeld([]);
                      setShareable([]);
                      setSharedStatus("");
                      setReport(undefined);
                      setImportText("");
                      setPreview(undefined);
                      setMode("guidance");
                      setChatSeed(undefined);
                      setContactsFor(undefined);
                      setNotice("");
                      setImportNotice("");
                      setSearch("");
                      setFixture("N2");
                      setFormat("json");
                      setMapping({});
                      setLive(true);
                      const next = liveContext(seedHospitals[5]);
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
            <span className="eg-badge" title="All hospitals, people and patients here are synthetic.">
              Synthetic data
            </span>
          </div>
        </header>
        <div className="eg-body">
          <nav className="eg-rail" aria-label="Main navigation" hidden={!ui.rail}>
            {[
              ["encounter", "Encounter", "wave"],
              ["guides", "Guide library", "book"],
              ["evaluation", "Evaluation", "chart"],
            ].map(([id, name, icon]) => (
              <button
                key={id}
                aria-label={name}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
              >
                <Icon name={icon} />
                <span>{name}</span>
              </button>
            ))}
            <small className="eg-rail-foot">Engine {engineVersion}</small>
          </nav>
          <main className={`eg-main page-${tab}`}>
            {(notice || newer || error || outage) && (
              <div className="eg-banners">
                {notice && (
                  <div role="status" className="banner">
                    {notice}{" "}
                    <button className="link" onClick={() => setNotice("")}>
                      Dismiss
                    </button>
                  </div>
                )}
                {newer && (
                  <div className="banner">
                    A newer guide version is available. This encounter is
                    pinned to {h.version}.{" "}
                    <button
                      onClick={() => {
                        commit(
                          { ...c, guideVersion: newer.version },
                          makeEvent(c, "guide_changed"),
                          newer,
                        );
                        setAcknowledged([]);
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
                    Hospital guidance unavailable. The caselog remains usable;
                    guide completion requirements cannot be verified.
                  </div>
                )}
              </div>
            )}
            {tab !== "encounter" && (
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {tab === "guides" ? "SOURCE KNOWLEDGE" : "ENGINE VERIFICATION"}
                  </p>
                  <h1>
                    {tab === "guides"
                      ? "Source records, made inspectable."
                      : "Evidence before claims."}
                  </h1>
                </div>
              </div>
            )}
            {tab === "encounter" && (
              <div
                className={`eg-work${ui.video ? "" : " video-closed"}`}
                id="encounter-workspace"
              >
                {ui.video ? (
                  <ConsultationPane
                    key={c.id}
                    onTranscript={onTranscript}
                    hospital={h.name}
                    onHide={() => setUiPref({ video: false })}
                  />
                ) : (
                  <button
                    className="eg-video-tab"
                    onClick={() => setUiPref({ video: true })}
                    aria-label="Show video"
                    title="Show video"
                  >
                    <Icon name="camera" />
                    <span>Video</span>
                  </button>
                )}
                <section className="eg-case caselog" aria-label="Caselog">
                  <header className="eg-case-head">
                    <div className="eg-case-id">
                      <h2>Encounter</h2>
                      <span className={`case-status ${completed ? "done" : ""}`}>
                        {completed ? "✓ Completed" : "In progress"}
                      </span>
                      <small>#{c.id.slice(0, 6)} · synthetic patient</small>
                    </div>
                    <div className="eg-types">
                      <label>
                        Consult
                        <select
                          aria-label="Consult type"
                          value={c.consultType}
                          onChange={(e) => {
                            setAcknowledged([]);
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
                        Encounter
                        <select
                          aria-label="Encounter type"
                          value={c.encounterType}
                          onChange={(e) => {
                            setAcknowledged([]);
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
                  </header>
                  <nav className="eg-steps stepper" aria-label="Caselog steps">
                    {stepList.map((s, i) => (
                      <button
                        aria-current={c.step === s ? "step" : undefined}
                        className={i < stepIndex ? "done" : ""}
                        key={s}
                        onClick={() => step(s)}
                      >
                        <span>{i < stepIndex ? "✓" : i + 1}</span>
                        {label(s)}
                      </button>
                    ))}
                  </nav>
                  <div className="eg-case-body form-body">
                    <p className="eg-step-title">
                      {c.step === "imaging"
                        ? "Imaging findings"
                        : c.step === "sign_off"
                          ? "Review and complete"
                          : c.step === "rounding"
                            ? "Rounding"
                            : `${label(c.step)}`}
                    </p>
                    {c.step === "sign_off" && (
                      <GateBanner
                        gates={gateResults}
                        onGoToField={(id) =>
                          document.getElementById(`field-${id}`)?.focus()
                        }
                        onAcknowledge={acknowledgeGate}
                      />
                    )}
                    <details className="ai-drafting-tools">
                      <summary>Transcript & AI field suggestions</summary>
                      <TranscriptDrafts key={transcriptKey} hospital={h} context={c} transcript={transcript}
                        accessCode={llmAccessCode} onAccessCode={setLlmAccessCode}
                        onApply={(field, text) => change(field, known(text))} />
                    </details>
                    {fields.map((f) => (
                      <div key={f.id} className="manual-field">
                        <InputField
                          f={f}
                          c={c}
                          onChange={change}
                          onFocus={focus}
                          onBlur={blur}
                          hint={requirementHint(f.id)}
                          marker={
                            <FieldMarker
                              results={forField(f.id)}
                              fieldLabel={f.label}
                              onOpen={openDockOn}
                              acknowledged={(r) =>
                                acknowledged.includes(resultSignature(r))
                              }
                            />
                          }
                        />
                        {f.id === "cta_done" && (
                          <small className="field-context">
                            Include a scan done at another facility. A guide
                            that doesn't mention CTA doesn't mean it's
                            unavailable.
                          </small>
                        )}
                      </div>
                    ))}
                <aside className={`eg-guide${chatOpen ? " is-chat-open" : ""}`} aria-label="Guide companion">
                  <div className="eg-guide-tabs" role="tablist" aria-label="Guide companion">
                    <button
                      role="tab"
                      aria-selected={mode === "guidance"}
                      className={`eg-tab${attention ? " attention" : ""}`}
                      onClick={() => {
                        setMode("guidance");
                        setAttention(false);
                      }}
                    >
                      <Icon name="book" size={17} /> Guidance
                      {guidanceCount > 0 && (
                        <span className={`eg-count ${loudest}`}>{guidanceCount}</span>
                      )}
                    </button>
                    <button
                      role="tab"
                      aria-selected={mode === "contacts"}
                      className="eg-tab call"
                      onClick={() => showContacts()}
                    >
                      <Icon name="phone" size={17} /> Care team contacts
                    </button>
                  </div>
                  <div className="eg-guide-body">
                    <div className="eg-pane" hidden={mode !== "guidance"}>
                      <GuidanceBoundary key={`dock:${h.id}:${h.version}`}>
                        <NudgeDock
                          results={visible}
                          acknowledged={acknowledged}
                          reported={reported}
                          focusedFieldId={focusedField}
                          fieldLabels={fieldLabels}
                          hospitalName={h.name}
                          onAsk={openChat}
                          onAcknowledge={acknowledge}
                          onUndoAcknowledge={undoAcknowledge}
                          onContacts={showContacts}
                          onReport={reportNudge}
                          unavailable={outage || guidanceFailed}
                          openRequest={dockRequest}
                          onNewNudge={() => {
                            if (mode !== "guidance") setAttention(true);
                          }}
                          storyboard={
                            <GuidanceBoundary key={`sb:${h.id}:${h.version}`} quiet>
                              <StoryboardCard
                                hospital={h}
                                context={c}
                                onOpenConflict={openConflict}
                              />
                            </GuidanceBoundary>
                          }
                        />
                      </GuidanceBoundary>
                    </div>
                    <div className="eg-pane chat-pane" hidden={mode !== "chat"}>
                      <GuidanceBoundary key={`chat:${h.id}:${h.version}`} quiet>
                        <ChatPanel
                          transcript={transcript}
                          accessCode={llmAccessCode}
                          onAccessCode={setLlmAccessCode}
                          open={chatOpen && !outage}
                          hospital={h}
                          context={c}
                          seed={chatSeed}
                          onClose={() => setMode("guidance")}
                          onContacts={showContacts}
                        />
                      </GuidanceBoundary>
                    </div>
                    <div className="eg-pane" hidden={mode !== "contacts"}>
                      <GuidanceBoundary key={`contacts:${h.id}`} quiet>
                        <ContactsSheet
                          open={mode === "contacts"}
                          hospitalId={h.id}
                          hospitalName={h.name}
                          contacts={h.contacts ?? []}
                          instant={c.instant}
                          timezone={h.timezone}
                          reason={contactsFor?.reason}
                          onClose={() => setMode("guidance")}
                        />
                      </GuidanceBoundary>
                    </div>
                  </div>
                </aside>
                    {c.step === "note" && (
                      <details className="eg-note-preview">
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
                  </div>
                  <footer className="eg-case-foot">
                    <button
                      className="eg-btn"
                      disabled={!prevStep}
                      onClick={() => prevStep && step(prevStep)}
                    >
                      <Icon name="left" size={16} /> Back
                    </button>
                    {completionText ? (
                      <p
                        role="status"
                        className={`eg-foot-note ${completed ? "success" : "completion-error"}`}
                        title={completionText}
                      >
                        {completionText}
                      </p>
                    ) : (
                      <span className="eg-foot-note">
                        {recorded} value{recorded === 1 ? "" : "s"} recorded ·
                        cleared when you start a new encounter
                      </span>
                    )}
                    {c.step === "sign_off" || !nextStep ? (
                      <button
                        className="eg-btn primary"
                        onClick={() =>
                          c.step === "sign_off" ? complete() : step("sign_off")
                        }
                        disabled={completed}
                      >
                        {c.step === "sign_off" ? (
                          <>
                            <Icon name="check" size={16} /> Complete encounter
                          </>
                        ) : (
                          "Go to sign off"
                        )}
                      </button>
                    ) : (
                      <button
                        className="eg-btn primary"
                        onClick={() => step(nextStep)}
                        aria-label="Next step"
                      >
                        Next: {label(nextStep)} <Icon name="right" size={16} />
                      </button>
                    )}
                  </footer>
                </section>
                  <button type="button" className="eg-guide-launcher" aria-label="Ask the Guide"
                    aria-expanded={chatOpen} onClick={() => chatOpen ? setMode("guidance") : openChat()}>
                    <span className="guide-orb"><Icon name="chat" size={22} /></span>
                    <span><strong>Ask the Guide</strong><small>{chatOpen ? "Return to guidance" : "Hospital answers, with sources"}</small></span>
                    <Icon name={chatOpen ? "close" : "right"} size={18} />
                  </button>

              </div>
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
                <ReportedProblems hospitalId={h.id} tick={reportsTick} />
              </section>
              <section className="panel importer">
                <p className="eyebrow">DYNAMIC DATA · NO RESTART</p>
                <h2>Import hospital files</h2>
                <p className="muted">
                  Drop guides, storyboards and contact directories together, in
                  any order. Each file is read by its shape, previewed, and
                  activated all at once or not at all.
                </p>
                <div
                  className={`drop-zone${dragging ? " dragging" : ""}`}
                  data-testid="drop-zone"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    void addFiles(e.dataTransfer.files);
                  }}
                >
                  <p>
                    <strong>Drop files here</strong> — JSON or CSV, up to 1 MB
                    each
                  </p>
                  <label>
                    Choose files
                    <input
                      type="file"
                      multiple
                      aria-label="Choose import files"
                      accept=".json,.csv,application/json,text/csv"
                      onChange={(e) => {
                        void addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {importFiles.length > 0 && (
                    <ul className="drop-files">
                      {importFiles.map((f) => (
                        <li key={f.name}>
                          {f.name} · {f.format.toUpperCase()} ·{" "}
                          {(f.text.length / 1024).toFixed(1)} KB{" "}
                          <button
                            className="link"
                            aria-label={`Remove ${f.name}`}
                            onClick={() => {
                              setImportFiles((p) =>
                                p.filter((x) => x.name !== f.name),
                              );
                              setPreview(undefined);
                            }}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* An uploaded CSV of guide records may use column names we
                      have never seen; the mapping is shown, never guessed. */}
                  {importFiles
                    .filter(
                      (f) =>
                        f.format === "csv" && csvKind(f.text) === "records",
                    )
                    .map((f) => {
                      const headers = csvHeaders(f.text).headers;
                      const map = f.map ?? suggestMap(headers);
                      return (
                        <div key={f.name} className="file-column-map">
                          <p className="file-column-title">
                            Columns in {f.name}
                          </p>
                          <div className="column-grid">
                            {columnKeys.map((k) => (
                              <label key={k}>
                                {k}
                                <select
                                  aria-label={`${f.name} ${k}`}
                                  value={map[k] || ""}
                                  onChange={(e) => {
                                    const next = {
                                      ...map,
                                      [k]: e.target.value,
                                    };
                                    setImportFiles((p) =>
                                      p.map((x) =>
                                        x.name === f.name
                                          ? { ...x, map: next }
                                          : x,
                                      ),
                                    );
                                    setPreview(undefined);
                                  }}
                                >
                                  <option value="">Unmapped</option>
                                  {headers.map((v) => (
                                    <option key={v}>{v}</option>
                                  ))}
                                </select>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
                {held.length > 0 && (
                  <p className="banner" data-testid="held-rows">
                    Holding{" "}
                    {held
                      .map(
                        (x) =>
                          `${[x.storyboard.length && `${x.storyboard.length} storyboard row(s)`, x.contacts.length && `${x.contacts.length} contact(s)`].filter(Boolean).join(" and ")} for ${x.hospitalId}`,
                      )
                      .join("; ")}
                    . They attach when that hospital's guide is imported.
                  </p>
                )}
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
                    {preview.files.length > 1 && (
                      <ul className="preview-files" data-testid="preview-files">
                        {preview.files.map((f, i) => (
                          <li
                            key={i}
                            className={f.errors.length ? "rejected" : ""}
                          >
                            <strong>{f.name}</strong> ·{" "}
                            {f.errors.length
                              ? "rejected"
                              : [
                                  f.hospitals && `${f.hospitals} guide(s)`,
                                  f.storyboardRows &&
                                    `${f.storyboardRows} storyboard row(s)`,
                                  f.contacts && `${f.contacts} contact(s)`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p>{importSummary(preview)}</p>
                    {preview.diagnostics
                      .filter((d) =>
                        /guide field|held|added to the active|nothing new/.test(
                          d,
                        ),
                      )
                      .map((d, i) => (
                        <p key={i} className="preview-summary">
                          {d}
                        </p>
                      ))}
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
                        preview.errors.length > 0 ||
                        (!preview.hospitals.length && !preview.held.length)
                      }
                      onClick={activateNow}
                    >
                      {preview.hospitals.length || !preview.held.length
                        ? "Activate validated bundle"
                        : "Hold rows for later"}
                    </button>
                  </div>
                )}
                {importNotice && <p role="status">{importNotice}</p>}
                <div className="button-row team-library">
                  <button className="secondary" onClick={() => void loadShared()}>
                    Load hospitals from the team library
                  </button>
                  {shareable.length > 0 && (
                    <button className="secondary" onClick={() => void shareNow()}>
                      Share {shareable.length} activated version(s) with the team
                    </button>
                  )}
                </div>
                {sharedStatus && (
                  <p className="muted" role="status" data-testid="shared-status">
                    {sharedStatus}
                  </p>
                )}
                {!preview &&
                  importHistory.length > 0 &&
                  (() => {
                    const last = importHistory.at(-1) as {
                      identities?: { id: string; version: string }[];
                    };
                    const opened = (last.identities || [])
                      .map((x) =>
                        hs.find(
                          (y) => y.id === x.id && y.version === x.version,
                        ),
                      )
                      .filter((x): x is Hospital => !!x);
                    return opened.length ? (
                      <div className="button-row">
                        {opened.map((x) => (
                          <button
                            key={x.id + x.version}
                            className="secondary"
                            onClick={() => {
                              newHospital(x);
                              setTab("encounter");
                            }}
                          >
                            Open {x.name} in an encounter
                          </button>
                        ))}
                      </div>
                    ) : null;
                  })()}
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
                            <NudgeCard
                              key={a.id}
                              r={a}
                              onAsk={() => launch(r.id)}
                            />
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
            {tab !== "encounter" && (
              <footer className="page-footer">
                Synthetic rules for hackathon prototyping only. No real patient
                data, treatment decisions, or hospital connections.
              </footer>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
// What doctors reported as looking wrong in this hospital's guide. Reports
// filed on this device are always listed; the team inbox is read on request.
function ReportedProblems({ hospitalId, tick }: { hospitalId: string; tick: number }) {
  const [team, setTeam] = useState<GuideReport[]>();
  const [status, setStatus] = useState("");
  const mine = useMemo(() => localReports(), [tick]);
  const all = [...(team ?? []), ...mine.filter((m) => !team?.some((t) => t.id === m.id))]
    .filter((r) => r.hospitalId === hospitalId)
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
  return (
    <section className="reported-problems" data-testid="reported-problems">
      <div className="section-head">
        <div>
          <h3>Reported problems</h3>
          <small>
            Rules doctors flagged with “Report a problem” · {hospitalId}
          </small>
        </div>
        <button
          className="secondary"
          onClick={async () => {
            setStatus("Contacting the team inbox…");
            const got = await fetchReports();
            setTeam(got);
            setStatus(
              got
                ? `Team inbox: ${got.length} report(s).`
                : "The team inbox is not reachable — showing this device only.",
            );
          }}
        >
          Load team reports
        </button>
      </div>
      {status && (
        <p className="muted" role="status">
          {status}
        </p>
      )}
      {all.length ? (
        <ul className="report-list">
          {all.map((r) => (
            <li key={r.id}>
              <strong>{r.field}</strong> · {reasonText[r.reason]}
              {r.comment && <> — “{r.comment}”</>}
              <br />
              <small>
                {r.version} · {r.reportedAt.slice(0, 16).replace("T", " ")} UTC
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No problems reported for this hospital.</p>
      )}
    </section>
  );
}
// Guidance is an addition to the caselog, never a dependency of it. If any
// guidance surface throws while rendering, it is replaced by a quiet notice and
// the form carries on. `quiet` renders nothing instead (secondary surfaces).
class GuidanceBoundary extends React.Component<
  { children: React.ReactNode; quiet?: boolean },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <section className="gp-guidance" data-state="pill" data-testid="nudge-dock">
        <p className="gp-unavailable" role="status">
          Guidance unavailable — the caselog still works
        </p>
      </section>
    );
  }
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
