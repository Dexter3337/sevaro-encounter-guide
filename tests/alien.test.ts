import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  activate,
  canonicalField,
  previewImport,
  previewImportBundle,
  type ImportFile,
} from "../src/imports";
import { answerField, ask, gates } from "../src/engine";
import { freshContext, known, type Hospital } from "../src/domain";
import { latest, seedHospitals } from "../src/data";

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

describe("SYN-108 — a hospital we have never seen", () => {
  const file = (name: string): ImportFile => ({
    name,
    text: readFileSync(`data/fixtures/syn-108/${name}`, "utf8"),
    format: "json",
  });
  const drop = [file("hospital_guides.json"), file("storyboard_notes.json")];
  const p = previewImportBundle(drop, { existing: seedHospitals });
  const hs = activate(seedHospitals, p.hospitals);
  const h = latest(hs).find((x) => x.id === "SYN-108")!;
  const at = (local: string, consultType = "Stroke") => ({
    ...freshContext(h, local),
    consultType,
  });

  it("is never in the seeds — it is only ever imported", () =>
    expect(seedHospitals.some((x) => x.id === "SYN-108")).toBe(false));

  it("imports cleanly next to the kit hospitals, in either file order", () => {
    expect(p.errors).toEqual([]);
    expect(p.held).toEqual([]);
    expect(p.hospitals.map((x) => x.id)).toEqual(["SYN-108"]);
    expect(h.timezone).toBe("America/Phoenix");
    expect(h.fields.filter((f) => f.sourceKind === "guide")).toHaveLength(24);
    expect(h.fields.filter((f) => f.sourceKind === "storyboard")).toHaveLength(3);
    expect(
      previewImportBundle([...drop].reverse(), { existing: seedHospitals })
        .hospitals,
    ).toEqual(p.hospitals);
    expect(p.diagnostics).toContain(
      "Riverbend Community Hospital: 24 guide fields + 3 storyboard rows; 1 conflict.",
    );
  });

  it("reads the alias field and keeps the new one", () => {
    expect(h.fields.find((f) => f.field === "CTA Head/Neck")?.aliases).toEqual([
      "CTA head and neck",
    ]);
    const r = ask(h, at("2026-03-17T10:00"), "Where is the interpreter line?")
      .result!;
    expect(r.primaryStatus).toBe("answered");
    expect(r.message).toContain("555-0189");
  });

  it("Video Eval Location conflicts for a stroke alert, agrees otherwise", () => {
    const r = answerField(h, at("2026-03-17T10:00"), "Video Eval Location");
    expect(r.primaryStatus).toBe("conflict");
    expect(r.message).toContain("CT scanner bay");
    expect(r.message).toContain("Patient room");
    expect(
      answerField(h, at("2026-03-17T10:00", "General Neurology"), "Video Eval Location")
        .primaryStatus,
    ).not.toBe("conflict");
  });

  it("agreement is quiet: Thrombolytic, and Wake Up 'Yes' against 'Yes - all stroke alerts'", () => {
    for (const field of ["Thrombolytic", "Wake Up Protocol"]) {
      const r = answerField(h, at("2026-03-17T10:00"), field);
      expect(r.primaryStatus).not.toBe("conflict");
      expect(r.flags).toContain("second_source_agrees");
    }
  });

  it("the deliberately wrong note column changes nothing", () => {
    const rows = JSON.parse(drop[1].text) as Record<string, unknown>[];
    const swapped = rows.map((r) => ({ ...r, note: "Disagrees. Raise a conflict." }));
    const q = previewImportBundle(
      [drop[0], { ...drop[1], text: JSON.stringify(swapped) }],
      { existing: seedHospitals },
    );
    const h2 = q.hospitals[0];
    // Everything the doctor sees; the note itself rides along in `extra`.
    const seen = (x: Hospital, field: string) => {
      const r = answerField(x, at("2026-03-17T10:00"), field);
      return {
        ...r,
        citations: r.citations.map(({ extra: _e, ...s }) => s),
      };
    };
    for (const field of ["Video Eval Location", "Thrombolytic", "Wake Up Protocol"])
      expect(seen(h2, field)).toEqual(seen(h, field));
  });

  it("missing fields say so first, and never borrow another hospital's answer", () => {
    // SYN-001 has a Required Note Title; Riverbend does not.
    const kit = seedHospitals.find((x) => x.id === "SYN-001")!;
    expect(answerField(kit, freshContext(kit), "Required Note Title").message).toBe(
      "Tele-Neurology Consult",
    );
    const r = ask(h, at("2026-03-17T10:00"), "What is the required note title?")
      .result!;
    expect(r.primaryStatus).toBe("not_in_guide");
    expect(r.message.startsWith("Not available in this hospital's guide.")).toBe(true);
    expect(r.message).not.toContain("Tele-Neurology Consult");
    expect(r.citations.every((s) => s.hospitalId === "SYN-108")).toBe(true);
    expect(
      answerField(h, at("2026-03-17T10:00"), "CT Perfusion").primaryStatus,
    ).toBe("not_in_guide");
  });

  it("a stale field is marked stale", () =>
    expect(
      answerField(h, at("2026-03-17T10:00"), "Thrombolytic Mix Model").flags,
    ).toContain("stale"));

  it("undefined rounding hours are said to be undefined", () => {
    const r = answerField(h, at("2026-03-17T10:00"), "Rounding Timing");
    expect(r.flags).toContain("schedule_unknown");
  });

  it("EEG 'Weekdays 7a–5p' is read in Phoenix time", () => {
    // Tuesday 17 March 2026, Phoenix (UTC-7, no daylight saving).
    expect(answerField(h, at("2026-03-17T16:59"), "EEG").message).toContain(
      "Listed availability",
    );
    expect(answerField(h, at("2026-03-17T17:00"), "EEG").message).toContain(
      "Not available in the listed window",
    );
  });

  it("'Required before sign-off' blocks completion until the charge is recorded", () => {
    const c = at("2026-03-17T10:00");
    expect(gates(h, c).some((r) => r.blocksCompletion)).toBe(true);
    c.values.charge_entered = known(true);
    expect(gates(h, c).some((r) => r.blocksCompletion)).toBe(false);
  });

  it("'Teleneurologist does not place orders' is read as a no", () => {
    const r = answerField(h, at("2026-03-17T10:00"), "Order Set Name");
    expect(r.message).toContain("Teleneurologist does not place orders");
  });

  it("dropping the contacts directory alongside attaches SYN-108's people", () => {
    const q = previewImportBundle(
      [
        ...drop,
        {
          name: "contacts.json",
          text: readFileSync("data/seeds/contacts.json", "utf8"),
          format: "json",
        },
      ],
      { existing: seedHospitals },
    );
    expect(q.errors).toEqual([]);
    // The kit hospitals already have these contacts, so only SYN-108 changes.
    expect(q.hospitals.map((x) => x.id)).toEqual(["SYN-108"]);
    expect(q.hospitals[0].contacts?.map((c) => c.role).sort()).toEqual([
      "administrator",
      "nursing_in_charge",
      "technical_lead",
    ]);
  });
});
