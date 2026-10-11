import { hospitalSchema, type Hospital } from "./domain";

// The team's shared hospital library: a guide activated on one laptop becomes
// available on every other. Hospital data is synthetic guide content — never
// encounter or patient data, which stays in the browser that recorded it.
//
// Versions are immutable here as they are locally: a hospital version is
// stored once and never overwritten.
export const SHARED_ENDPOINT = "/api/hospitals";
export const MAX_SHARED_HOSPITALS = 200;
export const MAX_PUBLISH_BYTES = 1_000_000;

export const sharedKey = (h: Pick<Hospital, "id" | "version">) =>
  `${encodeURIComponent(h.id)}@${encodeURIComponent(h.version)}`;

/** Validate a publish request body. Every hospital must parse, and every
 * source must belong to that hospital and version, or the whole request is
 * refused — the same all-or-nothing rule as a local import. */
export function validateForSharing(
  body: unknown,
): { hospitals: Hospital[]; error?: string } {
  if (!Array.isArray(body) || !body.length)
    return { hospitals: [], error: "Expected a non-empty list of hospitals." };
  if (body.length > 50)
    return { hospitals: [], error: "Publish at most 50 hospitals at once." };
  const out: Hospital[] = [];
  for (const [i, raw] of body.entries()) {
    const parsed = hospitalSchema.safeParse(raw);
    if (!parsed.success)
      return { hospitals: [], error: `Hospital ${i + 1} is not a valid hospital record.` };
    const h = parsed.data;
    const stray = h.fields.find(
      (s) => s.hospitalId !== h.id || s.version !== h.version,
    );
    if (stray)
      return {
        hospitals: [],
        error: `${h.id}: source ${stray.id} belongs to another hospital or version.`,
      };
    if ((h.contacts ?? []).some((c) => c.hospitalId !== h.id))
      return { hospitals: [], error: `${h.id}: a contact belongs to another hospital.` };
    out.push(h);
  }
  return { hospitals: out };
}

/** Hospitals from the shared library that this device does not have yet. */
export function newFromShared(local: Hospital[], shared: Hospital[]) {
  const have = new Set(local.map(sharedKey));
  const seen = new Set<string>();
  return shared.filter((h) => {
    const k = sharedKey(h);
    if (have.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// The library is an addition, never a dependency: offline, on the dev server
// (no functions), or on any error, the app simply works with what it has.
async function call(init?: RequestInit): Promise<Response | undefined> {
  try {
    const r = await fetch(SHARED_ENDPOINT, {
      ...init,
      signal: AbortSignal.timeout(5000),
    });
    return r.ok && r.headers.get("content-type")?.includes("json") ? r : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchShared(): Promise<Hospital[] | undefined> {
  const r = await call();
  if (!r) return undefined;
  const body: unknown = await r.json().catch(() => undefined);
  if (!Array.isArray(body)) return undefined;
  return body.flatMap((x) => {
    const p = hospitalSchema.safeParse(x);
    return p.success ? [p.data] : [];
  });
}

export async function publishShared(
  hospitals: Hospital[],
): Promise<{ stored: number; existing: number } | undefined> {
  if (!hospitals.length) return { stored: 0, existing: 0 };
  const r = await call({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(hospitals),
  });
  return r ? r.json().catch(() => undefined) : undefined;
}
