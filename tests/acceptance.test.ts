import { describe, it, expect } from "vitest";
import { seedHospitals } from "../src/data";
import { challengeFixtures } from "../src/fixtures";
import { runFixture } from "../src/evaluation";
import { answerField, ask } from "../src/engine";
import { freshContext } from "../src/domain";

describe("Independent sponsor oracle", () => {
  for (const f of challengeFixtures)
    it(`${f.id} ${f.question || f.step}`, () => {
      const r = runFixture(seedHospitals, f);
      expect(r.errors).toEqual([]);
    });
});

// The fixture oracle compares case-insensitively, so a reworded sentence can
// still pass it. The handbook prescribes the words the doctor sees for a field
// the guide does not carry, so this guard is case-sensitive and exact.
const SPONSOR_ABSENT = "Not available in this hospital's guide.";

describe("Missing-field wording is the sponsor's, exactly", () => {
  it("every not_in_guide answer opens with the sponsor sentence", () => {
    const checked: string[] = [];
    for (const h of seedHospitals) {
      const c = freshContext(h);
      // Fields other hospitals carry but this one does not.
      const absent = [
        "Required Note Title",
        "CT Perfusion",
        "Pediatric Neurology",
        "Consult Completion Rule",
        "CTA Head/Neck",
      ].filter((f) => !h.fields.some((s) => s.field === f));
      for (const field of absent) {
        const r = answerField(h, c, field);
        expect(r.primaryStatus).toBe("not_in_guide");
        expect(r.message.startsWith(SPONSOR_ABSENT)).toBe(true);
        checked.push(`${h.id}:${field}`);
      }
    }
    // Guard the guard: if the seeds ever carry every field, this proves nothing.
    expect(checked.length).toBeGreaterThan(4);
  });

  it("V14 and V20 return it through the question path", () => {
    for (const [id, question] of [
      ["SYN-002", "Who covers pediatric neurology?"],
      ["SYN-005", "What note title is required?"],
    ] as const) {
      const h = seedHospitals.find((x) => x.id === id)!;
      const a = ask(h, freshContext(h), question).result!;
      expect(a.primaryStatus).toBe("not_in_guide");
      expect(a.message.startsWith(SPONSOR_ABSENT)).toBe(true);
    }
  });

  it("never claims the hospital lacks the capability, and never borrows", () => {
    const h = seedHospitals.find((x) => x.id === "SYN-006")!;
    const r = answerField(h, freshContext(h), "CT Perfusion");
    // SYN-001 documents "24/7" for this field; it must not leak in.
    expect(r.citations).toHaveLength(0);
    expect(r.message).not.toMatch(/24\/7/);
    expect(r.message).not.toMatch(/\bunavailable\b|\bnot available at\b/i);
    expect(r.missingEvidence?.absent).toBe(true);
  });
});
