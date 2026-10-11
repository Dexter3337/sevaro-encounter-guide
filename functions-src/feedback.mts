import { getStore } from "@netlify/blobs";
import { MAX_REPORTS, reportSchema } from "../src/feedback";

// GET  /api/feedback  → every guide report, newest first
// POST /api/feedback  → file one report about a guide rule
//
// A report is about guide content — hospital, version, rule, what looks wrong.
// The schema has no place for encounter values; the comment is capped and the
// doctor is asked to leave patient details out of it.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

export default async (req: Request) => {
  const store = getStore({ name: "feedback", consistency: "strong" });

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const reports = await Promise.all(
      blobs.map((b) => store.get(b.key, { type: "json" })),
    );
    return json(
      reports
        .filter(Boolean)
        .sort((a, b) => String(b.reportedAt).localeCompare(String(a.reportedAt))),
    );
  }

  if (req.method === "POST") {
    const text = await req.text();
    if (text.length > 10_000) return json({ error: "Report too large." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "Body is not valid JSON." }, 400);
    }
    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Not a valid guide report." }, 400);
    const { blobs } = await store.list();
    if (blobs.length >= MAX_REPORTS)
      return json({ error: "The report inbox is full." }, 507);
    // The server names the key, so a client cannot overwrite another report.
    const key = `${parsed.data.reportedAt}-${crypto.randomUUID()}`;
    await store.setJSON(key, parsed.data);
    return json({ stored: 1 }, 201);
  }

  return json({ error: "Method not allowed." }, 405);
};
