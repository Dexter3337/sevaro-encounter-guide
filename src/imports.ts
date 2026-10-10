import Papa from "papaparse";
import { Temporal } from "@js-temporal/polyfill";
import { hospitalSchema, type Hospital, type Source } from "./domain";
import { interpretation, normalize } from "./knowledge";
export type ColumnMap = Record<string, string>;
export const columnKeys = [
  "hospitalId",
  "name",
  "timezone",
  "field",
  "raw",
  "lastVerified",
  "sourceKind",
  "version",
] as const;
const aliases: Record<string, string[]> = {
  hospitalId: ["hospital_id", "hospitalId", "id"],
  name: ["name", "hospital_name", "hospital"],
  timezone: ["timezone", "time_zone", "local_timezone"],
  field: ["field", "guide_field", "field_name"],
  raw: ["value", "raw", "synthetic_value"],
  lastVerified: ["last_verified", "lastVerified"],
  sourceKind: ["sourceKind", "source_type", "source_kind"],
  version: ["version", "guide_version", "source_version"],
};
export function csvHeaders(text: string) {
  const r = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return { headers: r.meta.fields || [], rows: r.data, errors: r.errors };
}
export function suggestMap(headers: string[]): ColumnMap {
  return Object.fromEntries(
    columnKeys.map((k) => [
      k,
      headers.find((h) =>
        aliases[k].some((a) => normalize(a) === normalize(h)),
      ) || "",
    ]),
  );
}
export type Preview = {
  hospitals: Hospital[];
  diagnostics: string[];
  raw: string;
  counts: Record<string, number>;
  errors: string[];
};
function preflight(text: string) {
  if (text.length > 1_000_000) throw new Error("Import exceeds 1 MB limit.");
  let depth = 0,
    inString = false,
    escape = false;
  for (const ch of text) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "{" || ch === "[") depth++;
      if (ch === "}" || ch === "]") depth--;
      if (depth > 20) throw new Error("Import nesting exceeds 20 levels.");
    }
  }
}
function mapRecord(row: Record<string, unknown>, map?: ColumnMap) {
  const take = (k: string) =>
    map
      ? row[map[k]]
      : aliases[k].map((a) => row[a]).find((x) => x !== undefined);
  return {
    hospitalId: take("hospitalId"),
    name: take("name"),
    timezone: take("timezone"),
    field: take("field"),
    raw: take("raw"),
    lastVerified: take("lastVerified"),
    sourceKind: take("sourceKind"),
    version: take("version"),
    original: row,
  };
}
function fromRecords(
  rows: Record<string, unknown>[],
  map?: ColumnMap,
): unknown[] {
  const groups = new Map<
    string,
    {
      id: string;
      name: string;
      timezone: string;
      version: string;
      fields: unknown[];
    }
  >();
  for (const [i, row] of rows.entries()) {
    const r = mapRecord(row, map);
    const id = String(r.hospitalId || "");
    if (!id) throw new Error(`Row ${i + 1}: hospital ID required.`);
    if (typeof r.field !== "string" || typeof r.raw !== "string")
      throw new Error(`Row ${i + 1}: field and text value required.`);
    const meta = {
      id,
      name: String(r.name || ""),
      timezone: String(r.timezone || ""),
      version: String(r.version || "Imported v1"),
    };
    const g = groups.get(id);
    if (
      g &&
      ((meta.name && g.name !== meta.name) ||
        (meta.timezone && g.timezone !== meta.timezone) ||
        g.version !== meta.version)
    )
      throw new Error(`Row ${i + 1}: conflicting metadata for ${id}.`);
    if (!g) groups.set(id, { ...meta, fields: [] });
    const h = groups.get(id)!;
    h.fields.push({
      ...r.original,
      id: `${id}:import:${i}`,
      hospitalId: id,
      field: r.field,
      raw: r.raw,
      sourceKind: r.sourceKind || "guide",
      version: h.version,
      lastVerified: r.lastVerified || undefined,
      locator: `Import row ${i + 1}`,
      original: r.original,
    });
  }
  return [...groups.values()];
}
function adaptHospital(raw: Record<string, unknown>): unknown {
  const id = String(raw.id || raw.hospital_id || "");
  const version = String(raw.version || raw.guide_version || "Imported v1");
  if (Array.isArray(raw.fields))
    return {
      ...raw,
      id,
      name: raw.name || raw.hospital_name,
      timezone: raw.timezone || raw.local_timezone || raw.time_zone,
      version,
      fields: raw.fields.map((x, i) => {
        const r = x as Record<string, unknown>;
        return {
          ...r,
          id: r.id || `${id}:import:${i}`,
          hospitalId: r.hospitalId || r.hospital_id || id,
          field: r.field || r.field_name,
          raw: r.raw ?? r.value,
          sourceKind: r.sourceKind || r.source_kind || "guide",
          version: r.version || version,
          lastVerified: r.lastVerified || r.last_verified || undefined,
        };
      }),
    };
  if (raw.fields && typeof raw.fields === "object")
    return {
      ...raw,
      id,
      version,
      name: raw.name || raw.hospital_name,
      timezone: raw.timezone || raw.local_timezone || raw.time_zone,
      fields: Object.entries(raw.fields).map(([field, v], i) => {
        const r: Record<string, unknown> =
          typeof v === "object" && v !== null
            ? (v as Record<string, unknown>)
            : { value: v };
        return {
          ...r,
          id: `${id}:import:${i}`,
          hospitalId: id,
          field,
          raw: r.raw ?? r.value,
          sourceKind: r.sourceKind || "guide",
          version,
          lastVerified: r.lastVerified || r.last_verified || undefined,
          locator: `/fields/${field}`,
        };
      }),
    };
  return raw;
}
export function previewImport(
  text: string,
  format: "json" | "csv",
  map?: ColumnMap,
): Preview {
  const p: Preview = {
    hospitals: [],
    diagnostics: [],
    raw: text,
    counts: { supported: 0, partial: 0, needs_review: 0, unsupported: 0 },
    errors: [],
  };
  try {
    preflight(text);
    let items: unknown[];
    if (format === "csv") {
      const r = csvHeaders(text);
      if (r.errors.length)
        throw new Error(r.errors.map((x) => x.message).join("; "));
      if (r.rows.length > 2000) throw new Error("Import exceeds 2,000 rows.");
      items = fromRecords(r.rows, map || suggestMap(r.headers));
    } else {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object")
        throw new Error("Expected hospital object, records or bundle.");
      const x = parsed as Record<string, unknown>;
      if (Array.isArray(parsed)) {
        if (parsed.length > 2000) throw new Error("Too many records.");
        items = parsed[0]?.fields
          ? parsed.map(adaptHospital)
          : fromRecords(parsed);
      } else if (Array.isArray(x.hospitals) && Array.isArray(x.fields)) {
        const hospitals = x.hospitals as Record<string, unknown>[];
        const records = x.fields as Record<string, unknown>[];
        const identities = new Set(
          hospitals.map((h) => String(h.id || h.hospital_id)),
        );
        if (
          records.some(
            (r) => !identities.has(String(r.hospitalId || r.hospital_id)),
          )
        )
          throw new Error("Bundle contains records for unknown hospitals.");
        items = hospitals.map((h) =>
          adaptHospital({
            ...h,
            timezone: String(h.timezone).match(/\((.*?)\)/)?.[1] || h.timezone,
            fields: records.filter(
              (r) =>
                (r.hospitalId || r.hospital_id) === (h.id || h.hospital_id),
            ),
          }),
        );
      } else if (Array.isArray(x.hospitals))
        items = x.hospitals.map((h) =>
          adaptHospital(h as Record<string, unknown>),
        );
      else if (Array.isArray(x.records))
        items = fromRecords(x.records as Record<string, unknown>[]);
      else items = [adaptHospital(x)];
    }
    if (!items.length || items.length > 50)
      throw new Error("Import must contain 1–50 hospitals.");
    const seen = new Set<string>();
    for (const item of items) {
      const h = hospitalSchema.parse(item);
      Temporal.Now.zonedDateTimeISO(h.timezone);
      if (seen.has(h.id)) throw new Error("Duplicate hospital identity.");
      seen.add(h.id);
      const ids = new Set<string>(),
        fields = new Set<string>();
      for (const s of h.fields) {
        if (s.hospitalId !== h.id || s.version !== h.version)
          throw new Error(`Cross-hospital/version contamination: ${s.id}`);
        if (ids.has(s.id)) throw new Error(`Duplicate source ID: ${s.id}`);
        ids.add(s.id);
        const identity = `${s.sourceKind}:${normalize(s.field)}`;
        if (fields.has(identity))
          throw new Error(
            `Duplicate field identity: ${s.field}. Combine conflicting records explicitly before import.`,
          );
        fields.add(identity);
        for (const d of [s.lastVerified, s.updatedAt])
          if (d) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d))
              throw new Error("Date must be YYYY-MM-DD.");
            Temporal.PlainDate.from(d);
          }
        const state = interpretation(s);
        p.counts[state]++;
        if (state !== "supported")
          p.diagnostics.push(
            `${h.name} · ${s.field}: ${state}; retained source, limited automatic interpretation.`,
          );
        if (!s.lastVerified && s.sourceKind === "guide")
          p.diagnostics.push(`${s.field}: verification date unknown.`);
      }
      for (const m of h.mappings || [])
        if (
          !h.fields.some((s) => normalize(s.field) === normalize(m.sourceField))
        )
          throw new Error(`Mapping ${m.id} references absent source.`);
      p.hospitals.push(h);
    }
  } catch (e) {
    p.errors.push(e instanceof Error ? e.message : String(e));
    p.hospitals = [];
  }
  return p;
}
export function activate(
  existing: Hospital[],
  incoming: Hospital[],
): Hospital[] {
  for (const h of incoming)
    if (existing.some((x) => x.id === h.id && x.version === h.version))
      throw new Error(
        `Version ${h.version} already exists for ${h.id}; choose a new immutable version.`,
      );
  return [...existing, ...incoming];
}
export function importSummary(p: Preview) {
  return Object.entries(p.counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(" · ");
}
