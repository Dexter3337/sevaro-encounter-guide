import { it, expect } from "vitest";
import { freshContext } from "../src/domain";
import { seedHospitals } from "../src/data";
import {
  syntheticTranscriptBatch,
  validateTranscriptBatch,
  approvedTranscriptValues,
} from "../src/transcript";
it("synthetic transcript approval is explicit and scoped", () => {
  const c = freshContext(seedHospitals[5]);
  const b = syntheticTranscriptBatch(c);
  expect(() => approvedTranscriptValues(b, c, [])).toThrow();
  expect(approvedTranscriptValues(b, c, ["lvo"])).toEqual({
    lvo_present: { state: "known", value: true },
  });
  expect(c.values).toEqual({});
});
it("wrong encounter, hospital, guide or revision rejects every draft", () => {
  const c = freshContext(seedHospitals[5]);
  const b = syntheticTranscriptBatch(c);
  for (const patch of [
    { id: "other" },
    { hospitalId: "other" },
    { guideVersion: "other" },
    { revision: c.revision + 1 },
  ])
    expect(() =>
      approvedTranscriptValues(b, { ...c, ...patch }, ["lvo"]),
    ).toThrow();
});
it("draft schema rejects gate fields, non-synthetic data, unknown speakers, questions, history and contradictions", () => {
  const c = freshContext(seedHospitals[5]);
  const b = syntheticTranscriptBatch(c);
  for (const patch of [
    { fieldId: "charge_entered" },
    { speaker: "unattributed" },
    { assertion: "question" },
    { assertion: "historical" },
    { value: false, assertion: "affirmed" },
  ])
    expect(() =>
      validateTranscriptBatch(
        { ...b, candidates: [{ ...b.candidates[2], ...patch }] },
        c,
      ),
    ).toThrow();
  expect(() =>
    validateTranscriptBatch({ ...b, synthetic: false }, c),
  ).toThrow();
  expect(() =>
    validateTranscriptBatch(
      { ...b, candidates: [b.candidates[2], b.candidates[2]] },
      c,
    ),
  ).toThrow();
});
