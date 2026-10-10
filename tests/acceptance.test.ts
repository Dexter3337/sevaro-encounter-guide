import { describe, it, expect } from "vitest";
import { seedHospitals } from "../src/data";
import { challengeFixtures } from "../src/fixtures";
import { runFixture } from "../src/evaluation";
describe("Independent sponsor oracle", () => {
  for (const f of challengeFixtures)
    it(`${f.id} ${f.question || f.step}`, () => {
      const r = runFixture(seedHospitals, f);
      expect(r.errors).toEqual([]);
    });
});
