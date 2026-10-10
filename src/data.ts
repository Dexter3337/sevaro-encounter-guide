import seeds from "./data/seeds.json";
import { hospitalSchema, type Hospital } from "./domain";
export const seedHospitals: Hospital[] = seeds.map((h) =>
  hospitalSchema.parse(h),
);
export function latest(hs: Hospital[]) {
  return [...new Map(hs.map((h) => [h.id, h])).values()];
}
export const storageKey = "encounter-guide:v1";
export function loadSaved() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return undefined;
    const x = JSON.parse(raw);
    return {
      ...x,
      hospitals: (x.hospitals || []).map((h: unknown) =>
        hospitalSchema.parse(h),
      ),
    };
  } catch {
    return undefined;
  }
}
export function saveData(x: unknown) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(x));
    return true;
  } catch {
    return false;
  }
}
export function download(name: string, value: unknown) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const url = URL.createObjectURL(
    new Blob([text], {
      type: name.endsWith(".csv") ? "text/csv" : "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
