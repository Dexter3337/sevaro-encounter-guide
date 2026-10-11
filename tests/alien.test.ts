import { describe, it, expect } from "vitest";
import {
  canonicalField,
  previewImport,
  previewImportBundle,
} from "../src/imports";
import { answerField, ask } from "../src/engine";
import { freshContext, type Hospital } from "../src/domain";

// Their file will not look like ours. These are the shapes and spellings a
// judge's file might reasonably use, and the things we must never guess.
const json = (x: unknown, name = "their_guides.json") =>
  previewImport(JSON.stringify(x), "json", undefined, { fileName: name });
const hospital = (fields: unknown, extra: Record<string, unknown> = {}) => ({
  hospital_id: "ALIEN-1",
  hospital_name: "Alien Test Hospital (synthetic)",
  local_timezone: "America/Phoenix",
  fields,
  ...extra,
});
const fieldOf = (h: Hospital, name: string) =>
  h.fields.find((f) => f.field === name);

describe("Top-level shapes", () => {
  const fields = [
    { field: "Thrombolytic", value: "Tenecteplase", last_verified: "2026-02-02" },
  ];
  it("{hospitals: [...]}", () =>
    expect(json({ hospitals: [hospital(fields)] }).hospitals).toHaveLength(1));
  it("a bare array of hospitals", () =>
    expect(json([hospital(fields)]).hospitals).toHaveLength(1));
  it("a single hospital object", () =>
    expect(json(hospital(fields)).hospitals).toHaveLength(1));
  it("{hospital: {...}}", () =>
    expect(json({ hospital: hospital(fields) }).hospitals).toHaveLength(1));
});

describe("fields as a list or an object map", () => {
  it("reads an object map of plain values", () => {
    const p = json(hospital({ "CT Head": "24/7", Thrombolytic: "Alteplase" }));
    expect(p.errors).toEqual([]);
    expect(fieldOf(p.hospitals[0], "CT Head")?.raw).toBe("24/7");
  });
  it("reads an object map of {value, last_verified}", () => {
    const p = json(
      hospital({ EEG: { value: "Weekdays 7a-5p", last_verified: "2026-01-05" } }),
    );
    expect(p.errors).toEqual([]);
    expect(fieldOf(p.hospitals[0], "EEG")).toMatchObject({
      raw: "Weekdays 7a-5p",
      lastVerified: "2026-01-05",
    });
  });
});

describe("Key aliases", () => {
  it("accepts id / name / tz / verified spellings", () => {
    const p = json({
      hospitals: [
        {
          id: "ALIEN-2",
          name: "Alias Keys Hospital (synthetic)",
          tz: "America/Chicago",
          fields: [{ field_name: "Thrombolytic", raw: "Alteplase", verified: "2026-02-02" }],
        },
      ],
    });
    expect(p.errors).toEqual([]);
    const [h] = p.hospitals;
    expect([h.id, h.timezone]).toEqual(["ALIEN-2", "America/Chicago"]);
    expect(fieldOf(h, "Thrombolytic")?.lastVerified).toBe("2026-02-02");
  });
  it("reads a zone written with a label around it", () => {
    const p = json(hospital([], { local_timezone: "Mountain (America/Denver)" }));
    expect(p.hospitals[0].timezone).toBe("America/Denver");
  });
});

describe("Field names", () => {
  it("normalises case, spacing, & and punctuation onto a known field", () => {
    for (const written of [
      "CTA head and neck",
      "cta (head & neck)",
      "CTA Head / Neck",
      "  CTA   HEAD/NECK. ",
    ])
      expect(canonicalField(written)).toEqual({
        field: "CTA Head/Neck",
        known: true,
      });
    expect(canonicalField("when do we round")).toEqual({
      field: "When Do We Round?",
      known: true,
    });
  });

  it("maps an alias field, and keeps the name they wrote", () => {
    const p = json(hospital([{ field: "CTA head and neck", value: "24/7" }]));
    expect(p.errors).toEqual([]);
    const f = fieldOf(p.hospitals[0], "CTA Head/Neck")!;
    expect(f.aliases).toEqual(["CTA head and neck"]);
    expect(p.diagnostics).toContain(
      'Alien Test Hospital (synthetic) · "CTA head and neck" read as "CTA Head/Neck".',
    );
  });

  it("keeps an unmatched name verbatim, reports it, and still answers it", () => {
    const p = json(
      hospital([
        {
          field: "Interpreter Line",
          value: "Dial 555-0161 for the synthetic language line",
          last_verified: "2026-02-02",
        },
      ]),
    );
    expect(p.errors).toEqual([]);
    const h = p.hospitals[0];
    expect(fieldOf(h, "Interpreter Line")).toBeDefined();
    expect(p.diagnostics.join("\n")).toContain(
      '"Interpreter Line": a field we have not seen before — kept exactly as written',
    );
    expect(p.diagnostics.join("\n")).toMatch(
      /not mapped to a caselog trigger.*Interpreter Line/,
    );
    const r = ask(h, freshContext(h), "What is the interpreter line?").result!;
    expect(r.message).toContain("synthetic language line");
  });

  it("never forces a near miss onto a field it might not be", () => {
    expect(canonicalField("CT Head and Neck Angio Protocol")).toEqual({
      field: "CT Head and Neck Angio Protocol",
      known: false,
    });
    expect(canonicalField("Order")).toEqual({ field: "Order", known: false });
  });
});

describe("Unknown keys", () => {
  it("keeps unknown keys on fields and hospitals", () => {
    const p = json(
      hospital(
        [{ field: "Thrombolytic", value: "Alteplase", owner: "pharmacy", page: 4 }],
        { region: "Southwest" },
      ),
    );
    expect(p.errors).toEqual([]);
    const h = p.hospitals[0];
    expect(fieldOf(h, "Thrombolytic")?.extra).toEqual({
      owner: "pharmacy",
      page: 4,
    });
    expect(h.region).toBe("Southwest");
  });
});

describe("Never guess", () => {
  it("a missing last_verified stays missing — never today", () => {
    const p = json(hospital([{ field: "Thrombolytic", value: "Alteplase" }]));
    expect(p.errors).toEqual([]);
    const f = fieldOf(p.hospitals[0], "Thrombolytic")!;
    expect(f.lastVerified).toBeUndefined();
    expect(p.diagnostics).toContain("Thrombolytic: verification date unknown.");
    const h = p.hospitals[0];
    expect(answerField(h, freshContext(h), "Thrombolytic").flags).toContain(
      "verification_unknown",
    );
  });

  it("a missing time zone is refused, not invented", () => {
    const p = json({ hospital_id: "ALIEN-3", hospital_name: "No Zone", fields: [] });
    expect(p.hospitals).toEqual([]);
    expect(p.errors).toEqual([
      'their_guides.json, ALIEN-3 (No Zone): no time zone. Schedules are read in the hospital\'s own time, so one is never assumed — add local_timezone, for example "America/Phoenix".',
    ]);
  });

  it("an unknown time zone is refused by name", () => {
    const p = json(hospital([], { local_timezone: "Mountain Time" }));
    expect(p.errors[0]).toContain('"Mountain Time" is not a recognised time zone');
  });

  it("an ambiguous date is refused with words a presenter can read aloud", () => {
    const p = json(
      hospital([{ field: "EEG", value: "24/7", last_verified: "03/04/2026" }]),
    );
    expect(p.hospitals).toEqual([]);
    expect(p.errors).toEqual([
      'their_guides.json, ALIEN-1 · EEG: the date "03/04/2026" is ambiguous — it could be day-first or month-first. Write it as YYYY-MM-DD.',
    ]);
  });

  it("an impossible date is refused", () => {
    const p = json(
      hospital([{ field: "EEG", value: "24/7", last_verified: "2026-02-30" }]),
    );
    expect(p.errors[0]).toContain('"2026-02-30" is not a real calendar date');
  });

  it("an unreadable row is reported with file, row and reason — never dropped", () => {
    const p = json(
      hospital([
        { field: "Thrombolytic", value: "Alteplase" },
        { field: "EEG", value: null },
        { value: "orphan value" },
      ]),
    );
    expect(p.hospitals).toEqual([]);
    expect(p.errors[0]).toBe(
      "their_guides.json, ALIEN-1 · EEG: no value. Empty fields are not skipped silently — fill it in or remove it.",
    );
    const q = json(hospital([{ value: "orphan value" }]));
    expect(q.errors[0]).toBe("their_guides.json, ALIEN-1 field 1: no field name.");
    const r = json(hospital({ EEG: ["24/7"] }));
    expect(r.errors[0]).toBe(
      'their_guides.json, ALIEN-1 field "EEG": the value must be text, but it is ["24/7"].',
    );
  });

  it("a file with nothing recognisable says what it did find", () => {
    const p = json({ sites: [], updated: "2026-01-01" }, "mystery.json");
    expect(p.errors).toEqual([
      "mystery.json: no hospitals, storyboard rows or contacts found (top-level keys: sites, updated).",
    ]);
  });
});

describe("CSV with unfamiliar headers", () => {
  it("maps known aliases automatically and keeps every column", () => {
    const csv = [
      "Hospital ID,Hospital Name,TZ,Field,Value,Last Verified,Site Owner",
      "ALIEN-4,CSV Alien (synthetic),America/New_York,CT Perfusion,No,2026-02-02,Radiology",
      "ALIEN-4,CSV Alien (synthetic),America/New_York,Wake-up protocol,Yes,,Neurology",
    ].join("\n");
    const p = previewImport(csv, "csv", undefined, { fileName: "alien.csv" });
    expect(p.errors).toEqual([]);
    const h = p.hospitals[0];
    expect(h.timezone).toBe("America/New_York");
    expect(fieldOf(h, "Wake Up Protocol")?.lastVerified).toBeUndefined();
    expect(fieldOf(h, "CT Perfusion")?.original).toHaveProperty(
      "Site Owner",
      "Radiology",
    );
  });

  it("names the line when a CSV row cannot be read", () => {
    const csv = [
      "hospital_id,hospital_name,timezone,field,value",
      "ALIEN-5,CSV Alien,America/New_York,EEG,",
    ].join("\n");
    expect(
      previewImport(csv, "csv", undefined, { fileName: "alien.csv" }).errors,
    ).toEqual([
      'alien.csv, line 2: no value for "EEG". Empty rows are not skipped silently — fill it in or remove the row.',
    ]);
  });

  it("a storyboard CSV with a missing hospital is held, not dropped", () => {
    const csv = [
      "Hospital_ID,Field,Storyboard Value,Storyboard Updated",
      "ALIEN-404,Thrombolytic,Tenecteplase,2026-01-20",
    ].join("\n");
    const p = previewImportBundle([{ name: "sb.csv", text: csv, format: "csv" }]);
    expect(p.errors).toEqual([]);
    expect(p.held[0].storyboard[0]).toMatchObject({
      hospitalId: "ALIEN-404",
      raw: "Tenecteplase",
      updatedAt: "2026-01-20",
    });
  });
});
