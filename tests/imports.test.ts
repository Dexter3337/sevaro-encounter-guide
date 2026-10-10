import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { previewImport } from "../src/imports";

const officialRaw = readFileSync("data/raw/hospital_guides.json", "utf8");

describe("Official hospital_guides.json import (bug reproduction)", () => {
  it("imports the official bundle with 7 hospitals and 0 errors", () => {
    const p = previewImport(officialRaw, "json");
    expect(p.errors).toEqual([]);
    expect(p.hospitals).toHaveLength(7);
  });

  it("imports a single hospital object whose timezone is a labeled value", () => {
    const obj = JSON.stringify({
      id: "SYN-LABEL",
      name: "Labeled Zone Hospital",
      timezone: "Central (America/Chicago)",
      version: "Imported v1",
      fields: { "CT Perfusion": { value: "No", lastVerified: "2026-02-02" } },
    });
    const p = previewImport(obj, "json");
    expect(p.errors).toEqual([]);
    expect(p.hospitals[0]?.timezone).toBe("America/Chicago");
  });

  it("imports a single hospital object whose timezone is under local_timezone alias", () => {
    const obj = JSON.stringify({
      id: "SYN-ALIAS",
      name: "Alias Zone Hospital",
      local_timezone: "America/Denver",
      version: "Imported v1",
      fields: { "CT Perfusion": { value: "No", lastVerified: "2026-02-02" } },
    });
    const p = previewImport(obj, "json");
    expect(p.errors).toEqual([]);
    expect(p.hospitals[0]?.timezone).toBe("America/Denver");
  });

  it("imports a single hospital object whose timezone is under time_zone alias", () => {
    const obj = JSON.stringify({
      id: "SYN-SNAKE",
      name: "Snake Zone Hospital",
      time_zone: "America/New_York",
      version: "Imported v1",
      fields: { "CT Perfusion": { value: "No", lastVerified: "2026-02-02" } },
    });
    const p = previewImport(obj, "json");
    expect(p.errors).toEqual([]);
    expect(p.hospitals[0]?.timezone).toBe("America/New_York");
  });
});

describe("Import preservation (clean-IANA and error paths unchanged)", () => {
  const holdoutRaw = readFileSync(
    "data/holdout/unfamiliar-hospitals.json",
    "utf8",
  );

  it("still imports the holdout bundle with 4 hospitals and 0 errors", () => {
    const p = previewImport(holdoutRaw, "json");
    expect(p.errors).toEqual([]);
    expect(p.hospitals).toHaveLength(4);
  });

  it("passes a clean IANA timezone through unchanged", () => {
    const obj = JSON.stringify({
      id: "SYN-CLEAN",
      name: "Clean Zone Hospital",
      timezone: "America/Los_Angeles",
      version: "Imported v1",
      fields: { "CT Perfusion": { value: "No", lastVerified: "2026-02-02" } },
    });
    const p = previewImport(obj, "json");
    expect(p.errors).toEqual([]);
    expect(p.hospitals[0]?.timezone).toBe("America/Los_Angeles");
  });

  it("still rejects malformed JSON", () => {
    const p = previewImport('{"id":', "json");
    expect(p.errors.length).toBeGreaterThan(0);
    expect(p.hospitals).toHaveLength(0);
  });

  it("still rejects oversized input", () => {
    const p = previewImport("x".repeat(1_000_001), "json");
    expect(p.errors.length).toBeGreaterThan(0);
  });
});
