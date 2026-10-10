import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { previewImport } from "../src/imports";
import { importEncounterContext } from "../src/adapter";
import { evaluate } from "../src/engine";
import { makeEvent, known } from "../src/domain";
import { seedHospitals } from "../src/data";
const raw = readFileSync("data/official/hospital_guides.json", "utf8");
const officialContext = JSON.parse(
  readFileSync("data/official/encounter_context_example.json", "utf8"),
);
it("loads the untouched sponsor hospital format, including dates and timezones", () => {
  const p = previewImport(raw, "json");
  expect(p.errors).toEqual([]);
  expect(p.hospitals).toHaveLength(7);
  expect(p.hospitals.reduce((n, h) => n + h.fields.length, 0)).toBe(162);
  expect(p.hospitals[5].timezone).toBe("America/Chicago");
  expect(
    p.hospitals[3].fields.find((f) => f.field === "EEG")?.lastVerified,
  ).toBe("2025-06-10");
});
it("replays the official encounter envelope into outside-hours LVO guidance", () => {
  const h = previewImport(raw, "json").hospitals[5];
  const c = importEncounterContext(officialContext, h);
  expect(c.step).toBe("imaging");
  expect(c.values.lvo_present).toEqual(known(true));
  expect(c.values.charge_entered).toEqual(known(false));
  expect(c.instant).toBe("2026-03-18T00:30:00Z");
  const result = evaluate(
    h,
    c,
    makeEvent(c, "field_changed", "lvo_present", known(true)),
  );
  expect(result[0].message).toContain("Outside coverage");
  expect(result[0].message).toContain("ED provider initiates transfer");
});
it("preserves provider timezone, false values and explicit DST fold offsets", () => {
  const h = seedHospitals[5];
  const c = importEncounterContext(
    {
      ...officialContext,
      provider_timezone: "America/Los_Angeles",
      local_time: "2026-11-01T01:30:00-06:00",
      field_event: { field: "lvo_present", value: false },
    },
    h,
  );
  expect(c.providerZone).toBe("America/Los_Angeles");
  expect(c.values.lvo_present).toEqual(known(false));
  expect(c.instant).toBe("2026-11-01T07:30:00Z");
});
it("rejects malformed envelope fields and inconsistent timezone offsets", () => {
  for (const patch of [
    { caselog_step: "Unknown" },
    { charge_entered: "false" },
    { provider_timezone: "invalid" },
    { field_event: { field: "lvo_present", value: "true" } },
    { field_event: { field: "patient_identity", value: "other" } },
    { local_time: "2026-03-17T19:30:00-04:00" },
  ])
    expect(() =>
      importEncounterContext(
        { ...officialContext, ...patch },
        seedHospitals[5],
      ),
    ).toThrow();
});
