import { describe, it, expect } from "vitest";
import {
  newFromShared,
  sharedKey,
  validateForSharing,
} from "../src/sharedLibrary";
import { seedHospitals } from "../src/data";

const h = seedHospitals[1];

describe("Shared hospital library", () => {
  it("accepts valid hospital versions", () => {
    const r = validateForSharing([h]);
    expect(r.error).toBeUndefined();
    expect(r.hospitals.map((x) => x.id)).toEqual(["SYN-002"]);
  });

  it("refuses the whole request if any hospital is invalid", () => {
    expect(validateForSharing([h, { id: "X" }]).error).toBe(
      "Hospital 2 is not a valid hospital record.",
    );
    expect(validateForSharing([]).error).toBeDefined();
    expect(validateForSharing({ hospitals: [h] }).error).toBeDefined();
  });

  it("refuses sources from another hospital or version", () => {
    const bad = { ...h, fields: [{ ...h.fields[0], hospitalId: "SYN-001" }] };
    expect(validateForSharing([bad]).error).toContain("belongs to another hospital");
    const other = { ...h, fields: [{ ...h.fields[0], version: "other" }] };
    expect(validateForSharing([other]).error).toContain("another hospital or version");
  });

  it("refuses a contact for another hospital", () => {
    const bad = {
      ...h,
      contacts: [{ ...h.contacts![0], hospitalId: "SYN-001" }],
    };
    expect(validateForSharing([bad]).error).toContain("contact belongs to another");
  });

  it("adds only versions this device does not already have", () => {
    const fresh = { ...h, version: "Shared v9", fields: h.fields.map((f) => ({ ...f, version: "Shared v9" })) };
    expect(newFromShared(seedHospitals, [h, fresh, fresh]).map(sharedKey)).toEqual([
      sharedKey(fresh),
    ]);
  });

  it("keys versions so that no two collide", () => {
    expect(sharedKey({ id: "A@B", version: "v1" })).not.toBe(
      sharedKey({ id: "A", version: "B@v1" }),
    );
  });
});
