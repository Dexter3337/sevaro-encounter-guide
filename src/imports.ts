import Papa from "papaparse";
import { Temporal } from "@js-temporal/polyfill";
import {
  contactSchema,
  hospitalSchema,
  type Contact,
  type Hospital,
  type Source,
} from "./domain";
import { getSources, interpretation, normalize } from "./knowledge";
import { compare, unboundFields } from "./engine";
import fieldAliasData from "../data/field-aliases.json";
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
  timezone: ["timezone", "time_zone", "local_timezone", "tz"],
  field: ["field", "guide_field", "field_name"],
  raw: ["value", "raw", "synthetic_value"],
  lastVerified: ["last_verified", "lastVerified", "verified"],
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
export type ImportFormat = "json" | "csv";
export type ImportFile = {
  name: string;
  text: string;
  format: ImportFormat;
  /** CSV column mapping; suggested from the headers when absent. */
  map?: ColumnMap;
};
export type FileKind = "guide" | "storyboard" | "contacts";
export type FilePreview = {
  name: string;
  kinds: FileKind[];
  hospitals: number;
  storyboardRows: number;
  contacts: number;
  diagnostics: string[];
  errors: string[];
};
// Storyboard rows and contacts for a hospital we do not have yet. They are kept,
// not dropped, and attach when that hospital's guide is imported.
export type Held = {
  hospitalId: string;
  storyboard: Source[];
  contacts: Contact[];
};
export type ImportOptions = {
  /** Hospitals already active. A storyboard or contacts file for one of them
   * becomes a new immutable version of it. */
  existing?: Hospital[];
  /** Rows held back by an earlier preview, applied if their hospital arrives. */
  held?: Held[];
  /** Shown in diagnostics and recorded as each source's sourceName. */
  fileName?: string;
  /** Version label for hospitals whose file does not give one. */
  version?: string;
};
export type Preview = {
  hospitals: Hospital[];
  diagnostics: string[];
  raw: string;
  counts: Record<string, number>;
  errors: string[];
  files: FilePreview[];
  held: Held[];
};
type Row = Record<string, unknown>;
const isRow = (x: unknown): x is Row =>
  !!x && typeof x === "object" && !Array.isArray(x);
// Key aliases are matched without case or punctuation, so hospital_id,
// hospitalId and "Hospital ID" are the same key.
const keyOf = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
function take(row: Row, names: readonly string[], used?: Set<string>) {
  for (const n of names) {
    const want = keyOf(n);
    for (const [k, v] of Object.entries(row))
      if (keyOf(k) === want && v !== undefined && v !== null && v !== "") {
        used?.add(k);
        return v;
      }
  }
  return undefined;
}
const hasKey = (row: Row, names: readonly string[]) =>
  Object.keys(row).some((k) => names.some((n) => keyOf(n) === keyOf(k)));
const K = {
  hospitalId: ["hospital_id", "hospitalId", "id"],
  hospitalRef: ["hospital_id", "hospitalId"],
  name: ["hospital_name", "name", "hospitalName"],
  timezone: ["local_timezone", "timezone", "time_zone", "tz", "zone"],
  version: ["version", "guide_version", "source_version"],
  field: ["field", "field_name", "guide_field", "name", "label"],
  value: ["value", "raw", "text", "synthetic_value"],
  verified: ["last_verified", "lastVerified", "verified", "verified_on"],
  updated: ["updatedAt", "updated_at", "storyboard_updated", "updated"],
  kind: ["sourceKind", "source_kind", "source_type", "kind"],
  sbField: ["field", "field_name", "guide_field"],
  sbValue: ["storyboard_value", "value", "raw"],
  sbUpdated: [
    "storyboard_updated",
    "updated",
    "updated_at",
    "updatedAt",
    "last_updated",
  ],
  role: ["role"],
  person: ["name", "contact_name", "full_name"],
  title: ["title", "job_title"],
  phone: ["phone", "phone_number", "telephone", "tel"],
  alt: ["alt_channel", "alternate_channel", "alt_contact", "alternate"],
  availability: ["availability", "hours", "available"],
} as const;
const shown = (v: unknown) => {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
};
function text(v: unknown, where: string, what: string): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  throw new Error(`${where}: ${what} must be text, but it is ${shown(v)}.`);
}
// Dates are read only as YYYY-MM-DD. "03/04/2026" could be either month first,
// so it is refused rather than guessed. A missing date stays missing — it is
// never filled in with today.
function date(v: unknown, where: string): string | undefined {
  if (v === undefined) return undefined;
  const s = typeof v === "string" ? v.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    try {
      Temporal.PlainDate.from(s);
      return s;
    } catch {
      throw new Error(`${where}: "${s}" is not a real calendar date.`);
    }
  }
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(s))
    throw new Error(
      `${where}: the date "${s}" is ambiguous — it could be day-first or month-first. Write it as YYYY-MM-DD.`,
    );
  throw new Error(`${where}: ${shown(v)} is not a date. Write it as YYYY-MM-DD.`);
}
// Field names: a variant listed in data/field-aliases.json reads as the name
// the caselog knows. Anything else is kept exactly as written — a near miss is
// never forced onto a field it might not be.
const fieldKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9/]+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .trim();
const canonicalFields = new Map<string, string>();
for (const [canonical, variants] of Object.entries(fieldAliasData)) {
  if (canonical.startsWith("$") || !Array.isArray(variants)) continue;
  for (const n of [canonical, ...variants])
    if (!canonicalFields.has(fieldKey(n)))
      canonicalFields.set(fieldKey(n), canonical);
}
export function canonicalField(name: string): {
  field: string;
  known: boolean;
} {
  const c = canonicalFields.get(fieldKey(name));
  return c ? { field: c, known: true } : { field: name, known: false };
}
const slug = (s: string) => normalize(s).replace(/ /g, "-");
function preflight(text: string, label: string) {
  if (text.length > 1_000_000)
    throw new Error(`${label} is larger than the 1 MB import limit.`);
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
      if (depth > 20)
        throw new Error(`${label} is nested more than 20 levels deep.`);
    }
  }
}
type Parsed = {
  guides: Row[];
  storyboard: Source[];
  contacts: Contact[];
  notes: string[];
};
// The sponsor storyboard: hospital_id, field, storyboard_value,
// storyboard_updated, note. It carries no hospital name or time zone, so it is
// matched to a hospital by ID and never becomes one on its own.
//
// `note` is sponsor commentary about the row ("Disagrees with the on-call guide
// for stroke alerts"). It is kept under `extra` so it round-trips, and nothing
// reads it: letting it count would be letting the test data mark its own work.
function storyboardRows(
  rows: unknown[],
  file: string,
  sourceName: string | undefined,
  hospital?: string,
): Source[] {
  const out: Source[] = [];
  rows.forEach((row, i) => {
    const where = `${file}, storyboard row ${i + 1}`;
    if (!isRow(row))
      throw new Error(
        `${where}: expected an object with hospital_id, field and storyboard_value.`,
      );
    const used = new Set<string>();
    const hid = take(row, K.hospitalRef, used) ?? hospital;
    if (hid === undefined)
      throw new Error(
        `${where}: no hospital_id, so the row cannot be matched to a hospital.`,
      );
    const hospitalId = text(hid, where, "hospital_id");
    const named = take(row, K.sbField, used);
    if (named === undefined) throw new Error(`${where}: no field name.`);
    const original = text(named, where, "the field name");
    const { field } = canonicalField(original);
    const v = take(row, K.sbValue, used);
    if (v === undefined)
      throw new Error(
        `${where}: no storyboard_value for "${original}". Empty rows are not skipped silently — fill it in or remove the row.`,
      );
    const raw = text(v, where, `the storyboard_value for "${original}"`);
    const updatedAt = date(
      take(row, K.sbUpdated, used),
      `${where} ("${original}")`,
    );
    take(row, K.kind, used);
    const extra = Object.fromEntries(
      Object.entries(row).filter(([k]) => !used.has(k)),
    );
    out.push({
      id: `${hospitalId}:storyboard:${slug(field)}`,
      hospitalId,
      field,
      raw,
      ...(updatedAt ? { updatedAt } : {}),
      sourceKind: "storyboard",
      sourceName: sourceName ?? "Synthetic import",
      version: "",
      locator: `storyboard row ${i + 1}`,
      ...(field !== original ? { aliases: [original] } : {}),
      ...(Object.keys(extra).length ? { extra } : {}),
    });
  });
  return out;
}
// The doctor's third escalation step: technical_lead, nursing_in_charge and
// administrator for each hospital. More roles are allowed.
function contactRows(
  rows: unknown[],
  file: string,
  sourceName: string | undefined,
  hospital?: string,
): { contacts: Contact[]; notes: string[] } {
  const contacts: Contact[] = [],
    notes: string[] = [];
  const count = new Map<string, number>();
  rows.forEach((row, i) => {
    const where = `${file}, contact ${i + 1}`;
    if (!isRow(row))
      throw new Error(
        `${where}: expected an object with hospital_id, role, name and phone.`,
      );
    const used = new Set<string>();
    const hid = take(row, K.hospitalRef, used) ?? hospital;
    if (hid === undefined)
      throw new Error(
        `${where}: no hospital_id, so the contact cannot be matched to a hospital.`,
      );
    const hospitalId = text(hid, where, "hospital_id");
    const r = take(row, K.role, used);
    if (r === undefined)
      throw new Error(
        `${where}: no role (expected technical_lead, nursing_in_charge or administrator).`,
      );
    const role = text(r, where, "the role")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const n = take(row, K.person, used);
    if (n === undefined)
      throw new Error(`${where}: the ${role} for ${hospitalId} has no name.`);
    const name = text(n, where, "the name");
    const ph = take(row, K.phone, used);
    if (ph === undefined)
      throw new Error(`${where}: ${name} has no phone number.`);
    const phone = text(ph, where, "the phone number");
    if (!/555-01\d\d\b/.test(phone))
      notes.push(
        `${file}: ${name}'s phone ${phone} is outside the fictional 555-01xx range.`,
      );
    const optional = (names: readonly string[], what: string) => {
      const v = take(row, names, used);
      return v === undefined ? undefined : text(v, where, what);
    };
    const title = optional(K.title, "the title"),
      altChannel = optional(K.alt, "the alternate channel"),
      availability = optional(K.availability, "the availability"),
      lastVerified = date(take(row, K.verified, used), `${where} (${name})`),
      id = optional(["id"], "the contact id"),
      source = optional(["source"], "the source");
    const k = `${hospitalId}\u0000${role}`;
    count.set(k, (count.get(k) ?? 0) + 1);
    const extra = Object.fromEntries(
      Object.entries(row).filter(([key]) => !used.has(key)),
    );
    contacts.push(
      contactSchema.parse({
        id:
          id ??
          `${hospitalId}:contact:${role}${count.get(k)! > 1 ? `:${count.get(k)}` : ""}`,
        hospitalId,
        role,
        name,
        ...(title ? { title } : {}),
        phone,
        ...(altChannel ? { altChannel } : {}),
        ...(availability ? { availability } : {}),
        ...(lastVerified ? { lastVerified } : {}),
        source: source ?? sourceName ?? "Synthetic directory",
        ...(Object.keys(extra).length ? { extra } : {}),
      }),
    );
  });
  return { contacts, notes };
}
// Keys a Source already understands pass through untouched, so a hospital
// exported from this app re-imports exactly. Anything else is kept in `extra`.
const SOURCE_KEYS = [
  "id",
  "hospitalId",
  "version",
  "sourceName",
  "locator",
  "aliases",
  "original",
];
function guideField(
  key: string | undefined,
  v: unknown,
  ctx: {
    file: string;
    hospitalId: string;
    hospitalName: string;
    version: string;
    index: number;
    locator: string;
    sourceName?: string;
    notes: string[];
  },
): Row {
  const where = `${ctx.file}, ${ctx.hospitalId} field ${key !== undefined ? `"${key}"` : ctx.index + 1}`;
  let row: Row;
  if (isRow(v)) row = v;
  else if (key !== undefined && (typeof v === "string" || typeof v === "number"))
    row = { value: v };
  else if (key !== undefined)
    throw new Error(`${where}: the value must be text, but it is ${shown(v)}.`);
  else
    throw new Error(
      `${where}: expected an object with a field name and a value, but it is ${shown(v)}.`,
    );
  const used = new Set<string>();
  const nameV = key ?? take(row, K.field, used);
  if (nameV === undefined) throw new Error(`${where}: no field name.`);
  const named = text(nameV, where, "the field name");
  const at = `${ctx.file}, ${ctx.hospitalId} · ${named}`;
  const valueV = take(row, K.value, used);
  if (valueV === undefined)
    throw new Error(
      `${at}: no value. Empty fields are not skipped silently — fill it in or remove it.`,
    );
  const raw = text(valueV, at, "the value");
  const kindV = take(row, K.kind, used);
  const kind = kindV === undefined ? "guide" : String(kindV).toLowerCase();
  if (kind !== "guide" && kind !== "storyboard")
    throw new Error(
      `${at}: source kind "${String(kindV)}" is neither guide nor storyboard.`,
    );
  const verified = date(take(row, K.verified, used), at);
  const updated = date(take(row, K.updated, used), at);
  const { field, known } = canonicalField(named);
  if (field !== named)
    ctx.notes.push(`${ctx.hospitalName} · "${named}" read as "${field}".`);
  else if (!known)
    ctx.notes.push(
      `${ctx.hospitalName} · "${named}": a field we have not seen before — kept exactly as written and answerable by asking.`,
    );
  const passed: Row = {};
  for (const k of SOURCE_KEYS)
    if (row[k] !== undefined) {
      passed[k] = row[k];
      used.add(k);
    }
  const hid = take(row, ["hospital_id"], used);
  used.add("extra");
  const extra = {
    ...(isRow(row.extra) ? row.extra : {}),
    ...Object.fromEntries(Object.entries(row).filter(([k]) => !used.has(k))),
  };
  const known_aliases = Array.isArray(passed.aliases) ? passed.aliases : [];
  const fieldAliases =
    field !== named && !known_aliases.includes(named)
      ? [...known_aliases, named]
      : known_aliases;
  return {
    ...passed,
    id: passed.id ?? `${ctx.hospitalId}:import:${ctx.index}`,
    hospitalId: passed.hospitalId ?? hid ?? ctx.hospitalId,
    field,
    raw,
    sourceKind: kind,
    ...(ctx.sourceName && passed.sourceName === undefined
      ? { sourceName: ctx.sourceName }
      : {}),
    version: passed.version ?? ctx.version,
    // Storyboard rows carry when they were updated, never a verification date.
    ...(kind === "guide" && verified ? { lastVerified: verified } : {}),
    ...(kind === "storyboard" && (updated ?? verified)
      ? { updatedAt: updated ?? verified }
      : kind === "guide" && updated
        ? { updatedAt: updated }
        : {}),
    // Cited on screen beside the answer, so it names the file and the field
    // as written there — the same form as "PDF p5 · Video Eval Location".
    locator:
      passed.locator ??
      (ctx.sourceName ? `${ctx.sourceName} · ${named}` : ctx.locator),
    ...(fieldAliases.length ? { aliases: fieldAliases } : {}),
    ...(Object.keys(extra).length ? { extra } : {}),
  };
}
const HOSPITAL_KEYS = ["fields", "contacts", "storyboard", "mappings"];
// Where a file's rows came from: its name, when we were given one, and the
// version label to use when the file does not state its own.
type Src = { name: string | undefined; version: string };
function guideHospital(
  raw: unknown,
  file: string,
  index: number,
  src: Src,
): Parsed {
  const sourceName = src.name;
  const where = `${file}, hospital ${index + 1}`;
  if (!isRow(raw)) throw new Error(`${where}: expected a hospital object.`);
  const used = new Set<string>(HOSPITAL_KEYS);
  const idV = take(raw, K.hospitalId, used);
  if (idV === undefined) throw new Error(`${where}: no hospital_id.`);
  const id = text(idV, where, "hospital_id");
  const nameV = take(raw, K.name, used);
  if (nameV === undefined)
    throw new Error(`${file}, ${id}: no hospital name. Add hospital_name.`);
  const name = text(nameV, `${file}, ${id}`, "the hospital name");
  const at = `${file}, ${id} (${name})`;
  const tzV = take(raw, K.timezone, used);
  // Every schedule is read in the hospital's own time. Guessing a zone would
  // put every window hours out, so a hospital without one is refused.
  if (tzV === undefined)
    throw new Error(
      `${at}: no time zone. Schedules are read in the hospital's own time, so one is never assumed — add local_timezone, for example "America/Phoenix".`,
    );
  const written = text(tzV, at, "the time zone").trim();
  const timezone = written.match(/\(([A-Za-z_]+\/[A-Za-z_/+-]+)\)/)?.[1] ?? written;
  try {
    Temporal.Now.zonedDateTimeISO(timezone);
  } catch {
    throw new Error(
      `${at}: "${written}" is not a recognised time zone. Use an IANA name such as "America/Chicago".`,
    );
  }
  const versionV = take(raw, K.version, used);
  const version =
    versionV === undefined ? src.version : text(versionV, at, "the version");
  let entries: [string | undefined, unknown, string][];
  if (Array.isArray(raw.fields))
    entries = raw.fields.map((x, i) => [undefined, x, `fields[${i}]`]);
  else if (isRow(raw.fields))
    entries = Object.entries(raw.fields).map(([k, v]) => [k, v, `/fields/${k}`]);
  else if (raw.fields === undefined) entries = [];
  else
    throw new Error(
      `${at}: "fields" must be a list of fields or an object keyed by field name.`,
    );
  if (entries.length > 500)
    throw new Error(`${at}: more than 500 fields in one hospital.`);
  const notes: string[] = [];
  const fields = entries.map(([key, v, locator], i) =>
    guideField(key, v, {
      file,
      hospitalId: id,
      hospitalName: name,
      version,
      index: i,
      locator,
      sourceName,
      notes,
    }),
  );
  const rest = Object.fromEntries(
    Object.entries(raw).filter(([k]) => !used.has(k)),
  );
  const contacts = Array.isArray(raw.contacts)
    ? contactRows(raw.contacts, file, sourceName, id)
    : { contacts: [], notes: [] };
  return {
    guides: [
      {
        ...rest,
        id,
        name,
        timezone,
        version,
        fields,
        ...(raw.mappings !== undefined ? { mappings: raw.mappings } : {}),
      },
    ],
    storyboard: Array.isArray(raw.storyboard)
      ? storyboardRows(raw.storyboard, file, sourceName, id)
      : [],
    contacts: contacts.contacts,
    notes: [...notes, ...contacts.notes],
  };
}
// Flat records — one row per field, each carrying its hospital's metadata.
// This is the CSV path, and the JSON `records` path.
function fromRecords(
  rows: Row[],
  file: string,
  src: Src,
  map: ColumnMap | undefined,
  rowLabel: (i: number) => string,
): Parsed {
  const sourceName = src.name;
  const take1 = (row: Row, k: string) =>
    map
      ? map[k]
        ? row[map[k]]
        : undefined
      : take(row, aliases[k]);
  const groups = new Map<
    string,
    { id: string; name: string; timezone: string; version: string; fields: Row[] }
  >();
  const notes: string[] = [];
  for (const [i, row] of rows.entries()) {
    const where = `${file}, ${rowLabel(i)}`;
    const blank = (v: unknown) => v === undefined || v === null || v === "";
    const idV = take1(row, "hospitalId");
    if (blank(idV)) throw new Error(`${where}: no hospital ID.`);
    const id = text(idV, where, "the hospital ID");
    const fieldV = take1(row, "field"),
      rawV = take1(row, "raw");
    if (blank(fieldV)) throw new Error(`${where}: no field name.`);
    const named = text(fieldV, where, "the field name");
    if (blank(rawV))
      throw new Error(
        `${where}: no value for "${named}". Empty rows are not skipped silently — fill it in or remove the row.`,
      );
    const raw = text(rawV, where, `the value for "${named}"`);
    const meta = {
      id,
      name: blank(take1(row, "name")) ? "" : String(take1(row, "name")),
      timezone: blank(take1(row, "timezone"))
        ? ""
        : String(take1(row, "timezone")),
      version: blank(take1(row, "version"))
        ? src.version
        : String(take1(row, "version")),
    };
    const g = groups.get(id);
    if (g) {
      const clash = (["name", "timezone", "version"] as const).find(
        (k) => meta[k] && g[k] && meta[k] !== g[k],
      );
      if (clash)
        throw new Error(
          `${where}: ${id}'s ${clash} is "${meta[clash]}" here but "${g[clash]}" in an earlier row.`,
        );
      g.name ||= meta.name;
      g.timezone ||= meta.timezone;
    } else groups.set(id, { ...meta, fields: [] });
    const h = groups.get(id)!;
    const kindV = take1(row, "sourceKind");
    const kind = blank(kindV) ? "guide" : String(kindV).toLowerCase();
    if (kind !== "guide" && kind !== "storyboard")
      throw new Error(
        `${where}: source kind "${String(kindV)}" is neither guide nor storyboard.`,
      );
    const dated = date(
      blank(take1(row, "lastVerified")) ? undefined : take1(row, "lastVerified"),
      `${where} ("${named}")`,
    );
    const { field, known } = canonicalField(named);
    if (field !== named) notes.push(`${id} · "${named}" read as "${field}".`);
    else if (!known)
      notes.push(
        `${id} · "${named}": a field we have not seen before — kept exactly as written and answerable by asking.`,
      );
    h.fields.push({
      ...row,
      id: `${id}:import:${i}`,
      hospitalId: id,
      field,
      raw,
      sourceKind: kind,
      ...(sourceName ? { sourceName } : {}),
      version: h.version,
      ...(dated
        ? kind === "storyboard"
          ? { updatedAt: dated }
          : { lastVerified: dated }
        : {}),
      locator: `Import ${rowLabel(i)}`,
      ...(field !== named ? { aliases: [named] } : {}),
      original: row,
    });
  }
  for (const g of groups.values()) {
    if (!g.name)
      throw new Error(`${file}: ${g.id} has no hospital name in any row.`);
    if (!g.timezone)
      throw new Error(
        `${file}: ${g.id} (${g.name}) has no time zone in any row. Schedules are read in the hospital's own time, so one is never assumed.`,
      );
    try {
      Temporal.Now.zonedDateTimeISO(g.timezone);
    } catch {
      throw new Error(
        `${file}: ${g.id} (${g.name}): "${g.timezone}" is not a recognised time zone. Use an IANA name such as "America/Chicago".`,
      );
    }
  }
  return { guides: [...groups.values()], storyboard: [], contacts: [], notes };
}
const isStoryboardRow = (r: Row) =>
  hasKey(r, K.hospitalRef) &&
  (hasKey(r, ["storyboard_value", "storyboard_updated"]) ||
    /^storyboard$/i.test(String(take(r, K.kind) ?? "")));
const isContactRow = (r: Row) => hasKey(r, K.role) && hasKey(r, K.phone);
const isHospital = (r: Row) => hasKey(r, ["fields"]);
type RowKind = "storyboard" | "contacts" | "hospitals" | "records";
const rowKind = (r: unknown): RowKind | undefined =>
  !isRow(r)
    ? undefined
    : isStoryboardRow(r)
      ? "storyboard"
      : isContactRow(r)
        ? "contacts"
        : isHospital(r)
          ? "hospitals"
          : "records";
function fromList(
  list: unknown[],
  file: string,
  src: Src,
  what: string,
): Parsed {
  const sourceName = src.name;
  if (!list.length) throw new Error(`${file}: ${what} is empty.`);
  if (list.length > 2000)
    throw new Error(`${file}: ${what} has more than 2,000 rows.`);
  const kinds = list.map(rowKind);
  const bad = kinds.findIndex((k) => k === undefined);
  if (bad >= 0)
    throw new Error(`${file}: row ${bad + 1} of ${what} is not an object.`);
  // A row that is missing its value no longer looks like anything in
  // particular. It takes the kind of the rows around it, so the reader can say
  // exactly what is missing rather than that the file is muddled.
  const distinct = [...new Set(kinds.filter((k) => k !== "records"))];
  if (distinct.length > 1) {
    const other = kinds.findIndex((k) => k !== "records" && k !== distinct[0]);
    throw new Error(
      `${file}: ${what} mixes kinds of row — row ${kinds.indexOf(distinct[0]) + 1} reads as ${distinct[0]}, row ${other + 1} as ${kinds[other]}. Put each kind in its own file.`,
    );
  }
  const kind = distinct[0] ?? "records";
  if (kind === "storyboard")
    return {
      guides: [],
      storyboard: storyboardRows(list, file, sourceName),
      contacts: [],
      notes: [],
    };
  if (kind === "contacts")
    return { guides: [], storyboard: [], ...contactRows(list, file, sourceName) };
  if (kind === "hospitals") return hospitals(list, file, src);
  return fromRecords(list as Row[], file, src, undefined, (i) => `record ${i + 1}`);
}
function hospitals(list: unknown[], file: string, src: Src): Parsed {
  if (list.length > 50)
    throw new Error(`${file}: more than 50 hospitals in one file.`);
  return merge(list.map((h, i) => guideHospital(h, file, i, src)));
}
function merge(parts: Parsed[]): Parsed {
  return {
    guides: parts.flatMap((p) => p.guides),
    storyboard: parts.flatMap((p) => p.storyboard),
    contacts: parts.flatMap((p) => p.contacts),
    notes: parts.flatMap((p) => p.notes),
  };
}
/** What a CSV holds, judged by its headers. Only guide records take a column
 * map; storyboard and contacts files are read by their own column names. */
export function csvKind(text: string): "storyboard" | "contacts" | "records" {
  const head = Object.fromEntries(csvHeaders(text).headers.map((h) => [h, ""]));
  return isStoryboardRow(head)
    ? "storyboard"
    : isContactRow(head)
      ? "contacts"
      : "records";
}
// Work out what a file is from its shape, not its name: their files will not be
// called what ours are.
function parseFile(f: ImportFile, label: string, version: string): Parsed {
  preflight(f.text, label);
  const sourceName = f.name || undefined;
  const src: Src = { name: sourceName, version };
  if (f.format === "csv") {
    const r = csvHeaders(f.text);
    if (r.errors.length)
      throw new Error(
        `${label} could not be read as CSV: ${r.errors
          .slice(0, 3)
          .map((e) => `${e.row !== undefined ? `line ${e.row + 2}: ` : ""}${e.message}`)
          .join("; ")}.`,
      );
    if (!r.rows.length) throw new Error(`${label} has no data rows.`);
    if (r.rows.length > 2000)
      throw new Error(`${label} has more than 2,000 rows.`);
    const head = Object.fromEntries(r.headers.map((h) => [h, ""]));
    if (!f.map && isStoryboardRow(head))
      return {
        guides: [],
        storyboard: storyboardRows(r.rows, label, sourceName),
        contacts: [],
        notes: [],
      };
    if (!f.map && isContactRow(head))
      return { guides: [], storyboard: [], ...contactRows(r.rows, label, sourceName) };
    return fromRecords(
      r.rows,
      label,
      src,
      f.map || suggestMap(r.headers),
      (i) => `line ${i + 2}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(f.text);
  } catch (e) {
    throw new Error(
      `${label} is not valid JSON (${e instanceof Error ? e.message : String(e)}).`,
    );
  }
  if (Array.isArray(parsed)) return fromList(parsed, label, src, "the list");
  if (!isRow(parsed))
    throw new Error(
      `${label}: expected hospitals, storyboard rows or contacts, but found ${shown(parsed)}.`,
    );
  const x = parsed;
  // The {hospitals, fields} bundle: hospital metadata and field records apart.
  if (Array.isArray(x.hospitals) && Array.isArray(x.fields)) {
    const hs = x.hospitals as unknown[];
    const records = x.fields as unknown[];
    const ids = new Set(
      hs.map((h) => (isRow(h) ? String(take(h, K.hospitalId) ?? "") : "")),
    );
    const stray = records.findIndex(
      (r) => !isRow(r) || !ids.has(String(take(r, K.hospitalRef) ?? "")),
    );
    if (stray >= 0)
      throw new Error(
        `${label}: field record ${stray + 1} names a hospital that is not in this file.`,
      );
    return hospitals(
      hs.map((h) =>
        isRow(h)
          ? {
              ...h,
              fields: records.filter(
                (r) =>
                  String(take(r as Row, K.hospitalRef)) ===
                  String(take(h, K.hospitalId)),
              ),
            }
          : h,
      ),
      label,
      src,
    );
  }
  const parts: Parsed[] = [];
  if (Array.isArray(x.hospitals)) parts.push(hospitals(x.hospitals, label, src));
  else if (isRow(x.hospital)) parts.push(hospitals([x.hospital], label, src));
  for (const k of ["storyboard", "storyboard_notes", "records"])
    if (Array.isArray(x[k]))
      parts.push(fromList(x[k] as unknown[], label, src, `"${k}"`));
  if (Array.isArray(x.contacts) && !isHospital(x))
    parts.push(fromList(x.contacts, label, src, `"contacts"`));
  if (parts.length) return merge(parts);
  if (isHospital(x)) return hospitals([x], label, src);
  if (isStoryboardRow(x)) return fromList([x], label, src, "the row");
  throw new Error(
    `${label}: no hospitals, storyboard rows or contacts found${Object.keys(x).length ? ` (top-level keys: ${Object.keys(x).slice(0, 8).join(", ")})` : ""}.`,
  );
}
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const zodMessage = (e: unknown) =>
  e && typeof e === "object" && "issues" in e && Array.isArray(e.issues)
    ? (e.issues as { path: PropertyKey[]; message: string }[])
        .slice(0, 3)
        .map((i) => `${i.path.map(String).join(".") || "hospital"}: ${i.message}`)
        .join("; ")
    : e instanceof Error
      ? e.message
      : String(e);
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
function latestById(hs: Hospital[]) {
  return new Map(hs.map((h) => [h.id, h]));
}
// A storyboard or contacts file for a hospital that is already active becomes
// a new immutable version of it. The label says what was added so the version
// list explains itself.
function versionLabel(
  base: Hospital,
  existing: Hospital[],
  storyboard: Source[] | undefined,
  contacts: Contact[] | undefined,
) {
  const newest = (ds: (string | undefined)[]) =>
    ds.filter(Boolean).sort().at(-1) ?? "undated";
  const stem = base.version.replace(/\s\+(storyboard|contacts)\b.*$/, "");
  const parts = [
    storyboard && `+storyboard ${newest(storyboard.map((s) => s.updatedAt))}`,
    contacts && `+contacts ${newest(contacts.map((c) => c.lastVerified))}`,
  ].filter(Boolean);
  const label = `${stem} ${parts.join(" ")}`;
  const taken = new Set(
    existing.filter((h) => h.id === base.id).map((h) => h.version),
  );
  let out = label,
    n = 2;
  while (taken.has(out)) out = `${label} #${n++}`;
  return out;
}
const sameRow = (a: Source, b: Source) =>
  a.raw === b.raw && (a.updatedAt ?? "") === (b.updatedAt ?? "");
const contactKey = (c: Contact) =>
  JSON.stringify([
    c.name,
    c.title,
    c.phone,
    c.altChannel,
    c.availability,
    c.lastVerified,
  ]);
// Incoming contacts replace whatever the hospital had on file for the same
// role; roles not mentioned are kept.
function withContacts(current: Contact[] | undefined, incoming: Contact[]) {
  const roles = new Set(incoming.map((c) => c.role));
  return [...(current ?? []).filter((c) => !roles.has(c.role)), ...incoming];
}
// Where the guide and the storyboard may disagree, counted the way the engine
// decides it. A field can disagree for a stroke alert and agree otherwise, so
// both consult types are checked; this summary never decides anything itself.
function disagreements(h: Hospital) {
  let conflicts = 0,
    storyboardOnly = 0;
  for (const s of h.fields.filter((x) => x.sourceKind === "storyboard")) {
    const guide = getSources(h, s.field).filter((x) => x.sourceKind === "guide");
    if (!guide.length) {
      storyboardOnly++;
      continue;
    }
    if (
      ["Stroke", "General Neurology"].some(
        (consult) => compare(guide[0], [s], consult).verdict !== "agree",
      )
    )
      conflicts++;
  }
  return { conflicts, storyboardOnly };
}
/**
 * Preview several files dropped together — guides, storyboards and contacts in
 * any order. Each file is classified by its shape; storyboard rows and contacts
 * attach to their hospital in the same drop, or to the active version of it
 * (as a new version), or are held with a diagnostic. Any error in any file
 * leaves `hospitals` empty, so activation is all or nothing.
 */
export function previewImportBundle(
  files: ImportFile[],
  options: ImportOptions = {},
): Preview {
  const p: Preview = {
    hospitals: [],
    diagnostics: [],
    raw:
      files.length === 1
        ? files[0].text
        : JSON.stringify(
            files.map(({ name, format, text }) => ({ name, format, text })),
          ),
    counts: { supported: 0, partial: 0, needs_review: 0, unsupported: 0 },
    errors: [],
    files: [],
    held: [],
  };
  if (!files.length) {
    p.errors.push("No files to import.");
    return p;
  }
  if (files.length > 10) {
    p.errors.push("Import at most 10 files at once.");
    return p;
  }
  const parsed: { label: string; out: Parsed }[] = [];
  files.forEach((f, i) => {
    const label =
      f.name || (files.length > 1 ? `File ${i + 1}` : "The import");
    const fp: FilePreview = {
      name: f.name || label,
      kinds: [],
      hospitals: 0,
      storyboardRows: 0,
      contacts: 0,
      diagnostics: [],
      errors: [],
    };
    p.files.push(fp);
    try {
      const out = parseFile(f, label, options.version ?? "Imported v1");
      fp.hospitals = out.guides.length;
      fp.storyboardRows = out.storyboard.length;
      fp.contacts = out.contacts.length;
      if (out.guides.length) fp.kinds.push("guide");
      if (out.storyboard.length) fp.kinds.push("storyboard");
      if (out.contacts.length) fp.kinds.push("contacts");
      fp.diagnostics.push(...out.notes);
      parsed.push({ label, out });
    } catch (e) {
      fp.errors.push(errorText(e));
      p.errors.push(errorText(e));
    }
  });
  if (p.errors.length) return p;
  try {
    combine(parsed, options, p);
  } catch (e) {
    p.errors.push(errorText(e));
  }
  if (p.errors.length) {
    p.hospitals = [];
    p.held = [];
  }
  return p;
}
function combine(
  parsed: { label: string; out: Parsed }[],
  options: ImportOptions,
  p: Preview,
) {
  const existing = options.existing ?? [];
  const guides: { label: string; data: Row }[] = [];
  const from = new Map<string, string>();
  for (const { label, out } of parsed)
    for (const data of out.guides) {
      const id = String(data.id);
      if (from.has(id))
        throw new Error(
          `${id} appears in both ${from.get(id)} and ${label}. Import one guide per hospital.`,
        );
      from.set(id, label);
      guides.push({ label, data });
    }
  const storyboard: Source[] = [],
    contacts: Contact[] = [];
  // A hospital's storyboard may hold several rows for one field; all of them
  // are kept and the engine compares each against the guide.
  const rowKey = (s: Source) => `${s.hospitalId}\u0000${normalize(s.field)}`;
  for (const { out } of parsed) {
    storyboard.push(...out.storyboard);
    contacts.push(...out.contacts);
  }
  const incoming = new Set(storyboard.map(rowKey));
  // Rows held from an earlier drop come along, unless this drop gives the same
  // field again, in which case the newer rows replace them.
  for (const h of options.held ?? []) {
    for (const s of h.storyboard)
      if (!incoming.has(rowKey(s))) storyboard.push(s);
    for (const c of h.contacts)
      if (
        !contacts.some((x) => x.hospitalId === c.hospitalId && x.role === c.role)
      )
        contacts.push(c);
  }
  // One ID per row: the first row for a field keeps the plain ID, later rows
  // for the same field are numbered.
  const seen = new Map<string, number>();
  for (const [i, s] of storyboard.entries()) {
    const k = rowKey(s);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    const id = `${s.hospitalId}:storyboard:${slug(s.field)}${n > 1 ? `:${n}` : ""}`;
    if (s.id !== id) storyboard[i] = { ...s, id };
  }
  const ids = (xs: { hospitalId: string }[]) => [
    ...new Set(xs.map((x) => x.hospitalId)),
  ];
  const sbFor = (id: string) => storyboard.filter((s) => s.hospitalId === id);
  const contactsFor = (id: string) => contacts.filter((c) => c.hospitalId === id);
  const out: { label: string; h: Hospital; isNew: boolean }[] = [];
  for (const { label, data } of guides) {
    let h: Hospital;
    try {
      h = hospitalSchema.parse(data);
    } catch (e) {
      throw new Error(`${label}, ${String(data.id)}: ${zodMessage(e)}`);
    }
    const rows = sbFor(h.id);
    const embedded = new Set(
      h.fields
        .filter((f) => f.sourceKind === "storyboard")
        .map((f) => normalize(f.field)),
    );
    for (const s of rows) {
      if (embedded.has(normalize(s.field)))
        throw new Error(
          `${h.name}: "${s.field}" has a storyboard row in the guide file and another in ${s.sourceName}. Keep one.`,
        );
      h.fields.push({ ...s, version: h.version });
    }
    const cs = contactsFor(h.id);
    if (cs.length) h.contacts = withContacts(h.contacts, cs);
    if (existing.some((x) => x.id === h.id && x.version === h.version))
      throw new Error(
        `${label}: ${h.name} (${h.id}) already has a version "${h.version}" active. Versions are never overwritten — give this file a new version label.`,
      );
    out.push({ label, h, isNew: true });
  }
  const active = latestById(existing);
  for (const id of ids([...storyboard, ...contacts])) {
    if (from.has(id)) continue;
    const rows = sbFor(id),
      cs = contactsFor(id);
    const base = active.get(id);
    if (!base) {
      p.held.push({ hospitalId: id, storyboard: rows, contacts: cs });
      const what = [
        rows.length && plural(rows.length, "storyboard row"),
        cs.length && plural(cs.length, "contact"),
      ]
        .filter(Boolean)
        .join(" and ");
      p.diagnostics.push(
        `${what} for ${id} held — no hospital ${id} is loaded. Import that hospital's guide to apply them.`,
      );
      continue;
    }
    const h: Hospital = structuredClone(base);
    const changedRows: Source[] = [];
    // Per field, the incoming rows replace whatever rows the active version
    // has — unless they are the same rows, in which case nothing changes.
    for (const field of new Set(rows.map((s) => normalize(s.field)))) {
      const next = rows.filter((s) => normalize(s.field) === field);
      const isField = (f: Source) =>
        f.sourceKind === "storyboard" && normalize(f.field) === field;
      const now = h.fields.filter(isField);
      const same =
        now.length === next.length &&
        next.every((s) => now.some((f) => sameRow(f, s)));
      if (same) continue;
      h.fields = [...h.fields.filter((f) => !isField(f)), ...next];
      changedRows.push(...next);
    }
    const before = new Set((h.contacts ?? []).map(contactKey));
    const changedContacts = cs.some((c) => !before.has(contactKey(c)));
    if (!changedRows.length && !changedContacts) {
      p.diagnostics.push(
        `${h.name}: the active version already has these ${[rows.length && "storyboard rows", cs.length && "contacts"].filter(Boolean).join(" and ")} — nothing new to activate.`,
      );
      continue;
    }
    if (changedContacts) h.contacts = withContacts(h.contacts, cs);
    h.version = versionLabel(
      base,
      existing,
      changedRows.length ? changedRows : undefined,
      changedContacts ? cs : undefined,
    );
    h.fields = h.fields.map((f) => ({ ...f, version: h.version }));
    p.diagnostics.push(
      `${h.name}: ${[changedRows.length && plural(changedRows.length, "storyboard row"), changedContacts && plural(cs.length, "contact")].filter(Boolean).join(" and ")} added to the active guide (${base.version}) as new version "${h.version}".`,
    );
    out.push({
      label: rows[0]?.sourceName ?? cs[0]?.source ?? id,
      h,
      isNew: false,
    });
  }
  for (const { label, h, isNew } of out) {
    validate(h, label, p);
    const g = h.fields.filter((f) => f.sourceKind === "guide").length,
      s = h.fields.length - g,
      c = h.contacts?.length ?? 0;
    const { conflicts, storyboardOnly } = disagreements(h);
    p.diagnostics.push(
      `${h.name}: ${plural(g, "guide field")}${s ? ` + ${plural(s, "storyboard row")}` : ""}${c ? ` + ${plural(c, "contact")}` : ""}${s ? `; ${plural(conflicts, "conflict")}${storyboardOnly ? `, ${storyboardOnly} storyboard-only` : ""}` : ""}.`,
    );
    if (isNew) {
      const unbound = unboundFields(h);
      if (unbound.length)
        p.diagnostics.push(
          `${h.name}: ${plural(unbound.length, "field")} not mapped to a caselog trigger — answered when asked, never raised unprompted: ${unbound.join(", ")}.`,
        );
    }
    p.hospitals.push(h);
  }
  for (const { out: o } of parsed) p.diagnostics.push(...o.notes);
}
function validate(h: Hospital, label: string, p: Preview) {
  const ids = new Set<string>(),
    fields = new Set<string>();
  for (const s of h.fields) {
    if (s.hospitalId !== h.id || s.version !== h.version)
      throw new Error(
        `${label}: "${s.field}" (${s.id}) belongs to ${s.hospitalId} ${s.version}, not ${h.id} ${h.version}. Rows from different hospitals or versions cannot be mixed.`,
      );
    if (ids.has(s.id))
      throw new Error(`${label}: two sources share the ID ${s.id}.`);
    ids.add(s.id);
    // A guide gives one value per field. A storyboard may give several, and a
    // disagreement among them is shown, not resolved.
    const identity = normalize(s.field);
    if (s.sourceKind === "guide") {
      if (fields.has(identity))
        throw new Error(
          `${label}: ${h.name} lists "${s.field}" twice as a guide field. Combine the two before importing.`,
        );
      fields.add(identity);
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
    if (!h.fields.some((s) => normalize(s.field) === normalize(m.sourceField)))
      throw new Error(
        `${label}: mapping ${m.id} points at "${m.sourceField}", which ${h.name}'s guide does not have.`,
      );
}
export function previewImport(
  text: string,
  format: ImportFormat,
  map?: ColumnMap,
  options: ImportOptions = {},
): Preview {
  return previewImportBundle(
    [{ name: options.fileName ?? "", text, format, map }],
    options,
  );
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
