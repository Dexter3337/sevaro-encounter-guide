import { Temporal } from "@js-temporal/polyfill";
import { localTime } from "./domain";
const days = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
export function daySet(raw: string): number[] | undefined {
  const s = raw
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\bthrough\b|\bto\b/g, "-");
  if (/daily|24\/7|every day/.test(s)) return [1, 2, 3, 4, 5, 6, 7];
  if (/weekdays/.test(s)) return [1, 2, 3, 4, 5];
  if (/weekend/.test(s)) return [6, 7];
  const names =
    "mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?";
  const matches = [...s.matchAll(new RegExp(`\\b(${names})\\b`, "g"))];
  if (!matches.length) return undefined;
  const out = new Set<number>();
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i],
      a = days.findIndex((d) => d.startsWith(m[1].slice(0, 3))) + 1;
    out.add(a);
    const n = matches[i + 1];
    if (n && /^\s*-\s*$/.test(s.slice(m.index! + m[0].length, n.index))) {
      let b = days.findIndex((d) => d.startsWith(n[1].slice(0, 3))) + 1;
      for (let j = a; j !== b; j = (j % 7) + 1) out.add(j);
      out.add(b);
      i++;
    }
  }
  return [...out];
}
export type Window = {
  days: number[];
  start: number;
  end: number;
  raw: string;
};
function minute(s: string): number | undefined {
  s = s.trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m) {
    const hr = Number(m[1]);
    if (hr < 1 || hr > 12) return;
    return (hr % 12) * 60 + (m[3] === "pm" ? 720 : 0) + Number(m[2] || 0);
  }
  const x = s.replace(":", "");
  if (!/^\d{4}$/.test(x)) return;
  const h = +x.slice(0, 2),
    n = +x.slice(2);
  if (h > 23 || n > 59) return;
  return h * 60 + n;
}
export function windows(raw: string, defaultDays?: number[]): Window[] {
  if (/24\/7/.test(raw))
    return [{ days: [1, 2, 3, 4, 5, 6, 7], start: 0, end: 1440, raw: "24/7" }];
  const out: Window[] = [];
  const time = "(?:\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)|\\d{2}:?\\d{2})";
  for (const part of raw.split(/[;.]\s*/)) {
    const ds = daySet(part) || defaultDays;
    if (!ds) continue;
    for (const m of part.matchAll(
      new RegExp(`(${time})\\s*(?:-|–|—|to)\\s*(${time})`, "gi"),
    )) {
      const a = minute(m[1]),
        b = minute(m[2]);
      if (a !== undefined && b !== undefined)
        out.push({ days: ds, start: a, end: b, raw: part });
    }
  }
  return out;
}
export function matchWindow(ws: Window[], instant: string, zone: string) {
  const t = localTime(instant, zone),
    n = t.hour * 60 + t.minute;
  return ws.some((w) =>
    w.start <= w.end
      ? w.days.includes(t.dayOfWeek) && n >= w.start && n < w.end
      : (w.days.includes(t.dayOfWeek) && n >= w.start) ||
        (w.days.includes(((t.dayOfWeek + 5) % 7) + 1) && n < w.end),
  );
}
export function untilOpen(ws: Window[], instant: string, zone: string) {
  const t = localTime(instant, zone),
    n = t.hour * 60 + t.minute;
  const starts = ws
    .filter((w) => w.days.includes(t.dayOfWeek) && w.start > n)
    .map((w) => w.start - n);
  return starts.length ? Math.min(...starts) : undefined;
}
export function ageDays(verified: string, instant: string, zone: string) {
  return Temporal.PlainDate.from(verified).until(
    localTime(instant, zone).toPlainDate(),
    { largestUnit: "days" },
  ).days;
}
export function queryInstant(q: string, instant: string, zone: string) {
  let t = localTime(instant, zone);
  const date = q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (date)
    t = Temporal.PlainDate.from(date[1])
      .toPlainDateTime(t.toPlainTime())
      .toZonedDateTime(zone, { disambiguation: "reject" });
  else {
    const day = days.findIndex((d) => new RegExp(`\\b${d}\\b`, "i").test(q));
    if (day >= 0) t = t.add({ days: (day + 1 - t.dayOfWeek + 7) % 7 });
  }
  const hm =
    q.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ||
    q.match(/\bat\s+(\d{2}):(\d{2})\b/i);
  if (hm) {
    let h = +hm[1];
    if (hm[3]) h = (h % 12) + (/pm/i.test(hm[3]) ? 12 : 0);
    t = t.with(
      { hour: h, minute: +(hm[2] || 0) },
      { disambiguation: "reject" },
    );
  }
  if (/\byesterday\b/i.test(q)) t = t.subtract({ days: 1 });
  if (/\btomorrow\b/i.test(q)) t = t.add({ days: 1 });
  return t.toInstant().toString();
}
