import { getStore } from "@netlify/blobs";
import {
  MAX_PUBLISH_BYTES,
  MAX_SHARED_HOSPITALS,
  sharedKey,
  validateForSharing,
} from "../../src/sharedLibrary";

// GET  /api/hospitals  → every hospital version in the team library
// POST /api/hospitals  → publish validated hospital versions (never overwrites)
//
// Runs as a Netlify Function; the library lives in Netlify Blobs. Only
// synthetic guide data is accepted — the schema has no place for encounter
// or patient values.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

export default async (req: Request) => {
  const store = getStore({ name: "hospitals", consistency: "strong" });

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const hospitals = await Promise.all(
      blobs.map((b) => store.get(b.key, { type: "json" })),
    );
    return json(hospitals.filter(Boolean));
  }

  if (req.method === "POST") {
    const text = await req.text();
    if (text.length > MAX_PUBLISH_BYTES)
      return json({ error: "Publish request exceeds 1 MB." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "Body is not valid JSON." }, 400);
    }
    const { hospitals, error } = validateForSharing(body);
    if (error) return json({ error }, 400);

    const { blobs } = await store.list();
    const existing = new Set(blobs.map((b) => b.key));
    let stored = 0,
      already = 0;
    for (const h of hospitals) {
      const key = sharedKey(h);
      if (existing.has(key)) {
        already++;
        continue;
      }
      if (existing.size + stored >= MAX_SHARED_HOSPITALS)
        return json({ error: "The shared library is full.", stored }, 507);
      await store.setJSON(key, h);
      stored++;
    }
    return json({ stored, existing: already });
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: "/api/hospitals" };
