import { z } from "zod";
import type { Result } from "./domain";
import type { ReportReason } from "./guidance/types";

// "This looks wrong", made useful: a report names the hospital, the guide
// version, the rule and what the doctor says is wrong with it, so whoever owns
// that hospital's guide can fix it. It carries guide content only — never the
// encounter's recorded values — and the doctor is asked to leave out patient
// details in the comment.
export const FEEDBACK_ENDPOINT = "/api/feedback";
export const MAX_REPORTS = 2000;

export const reportSchema = z.object({
  id: z.string().min(1).max(80),
  hospitalId: z.string().min(1).max(80),
  version: z.string().min(1).max(80),
  field: z.string().min(1).max(200),
  status: z.string().min(1).max(40),
  shown: z.string().max(2000),
  reason: z.enum(["outdated", "wrong_field", "wrong_time", "not_applicable", "other"]),
  comment: z.string().max(500),
  reportedAt: z.string().max(40),
});
export type GuideReport = z.infer<typeof reportSchema>;

export const reasonText: Record<ReportReason, string> = {
  outdated: "Out of date",
  wrong_field: "Wrong field or hospital",
  wrong_time: "Wrong hours or time window",
  not_applicable: "Doesn't apply",
  other: "Other",
};

export function makeReport(r: Result, reason: ReportReason, comment: string): GuideReport {
  return {
    id: crypto.randomUUID(),
    hospitalId: r.hospitalId,
    version: r.version,
    field: r.title,
    status: r.primaryStatus,
    shown: r.message.slice(0, 2000),
    reason,
    comment: comment.slice(0, 500),
    reportedAt: new Date().toISOString(),
  };
}

const localKey = "encounter-guide:reports";
export function localReports(): GuideReport[] {
  try {
    const x = JSON.parse(localStorage.getItem(localKey) || "[]");
    return Array.isArray(x)
      ? x.flatMap((r) => {
          const p = reportSchema.safeParse(r);
          return p.success ? [p.data] : [];
        })
      : [];
  } catch {
    return [];
  }
}
function keepLocal(r: GuideReport) {
  try {
    localStorage.setItem(localKey, JSON.stringify([...localReports(), r].slice(-200)));
  } catch {
    /* Storage full or blocked: the report is still sent if the server is up. */
  }
}

/** Keeps the report on this device and sends it to the team's report inbox.
 * Resolves to whether the inbox accepted it; the app works either way. */
export async function submitReport(r: GuideReport): Promise<boolean> {
  keepLocal(r);
  try {
    const res = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(r),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchReports(): Promise<GuideReport[] | undefined> {
  try {
    const res = await fetch(FEEDBACK_ENDPOINT, { signal: AbortSignal.timeout(5000) });
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return undefined;
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return undefined;
    return body.flatMap((x) => {
      const p = reportSchema.safeParse(x);
      return p.success ? [p.data] : [];
    });
  } catch {
    return undefined;
  }
}
