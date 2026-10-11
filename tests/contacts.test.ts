import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import {
  ContactsSheet,
  type ContactsSheetProps,
} from "../src/contacts/ContactsSheet";
import { availabilityAt, verification } from "../src/contacts/availability";
import { seedHospitals } from "../src/data";
import { previewImportBundle } from "../src/imports";
import type { Contact } from "../src/domain";

const allContacts = seedHospitals.flatMap((h) => h.contacts ?? []);
const hospital = (id: string) => seedHospitals.find((h) => h.id === id)!;
const sheet = (p: Partial<ContactsSheetProps> & { hospitalId: string }) => {
  const h = seedHospitals.find((x) => x.id === p.hospitalId);
  return renderToStaticMarkup(
    createElement(ContactsSheet, {
      open: true,
      contacts: h?.contacts ?? [],
      instant: "2026-03-17T19:00:00Z",
      timezone: h?.timezone ?? "America/Phoenix",
      onClose: () => {},
      ...p,
    }),
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
};

describe("Availability is read in the hospital's time", () => {
  it("06:30 in Chicago is before opening, though it is 07:30 for a doctor in New York", () => {
    // 2026-03-17 11:30Z: 06:30 CDT at the hospital, 07:30 EDT for the doctor.
    expect(
      availabilityAt("Mon-Fri 0700-1900", "2026-03-17T11:30:00Z", "America/Chicago"),
    ).toEqual({ state: "opens_later", label: "Opens in 30 minutes (07:00 CDT)" });
    expect(
      availabilityAt("Mon-Fri 0700-1900", "2026-03-17T12:30:00Z", "America/Chicago")
        .label,
    ).toBe("Available now");
  });

  it("Phoenix keeps standard time in March", () =>
    expect(
      availabilityAt("Mon-Fri 0700-1700", "2026-03-17T13:45:00Z", "America/Phoenix")
        .label,
    ).toBe("Opens in 15 minutes (07:00 MST)"));

  it("after hours and at weekends it says so", () => {
    expect(
      availabilityAt("Mon-Fri 0700-1900", "2026-03-18T01:30:00Z", "America/Chicago")
        .label,
    ).toBe("Outside listed hours");
    // Saturday 21 March, midday in Chicago.
    expect(
      availabilityAt("Mon-Fri 0700-1900", "2026-03-21T17:00:00Z", "America/Chicago")
        .state,
    ).toBe("closed");
  });

  it("24/7 is always available", () =>
    expect(availabilityAt("24/7", "2026-03-21T08:00:00Z", "America/Denver").state).toBe(
      "available",
    ));

  it("hours the directory does not define are never guessed", () => {
    for (const text of ["As scheduled", "During business hours", undefined])
      expect(availabilityAt(text, "2026-03-17T19:00:00Z", "America/Denver")).toEqual({
        state: "unknown",
        label: "Hours not listed — call to check",
      });
  });

  it("uncovered on-call time is not reported as closed", () =>
    expect(
      availabilityAt(
        "Mon-Fri 0800-1700; weekends on call",
        "2026-03-21T17:00:00Z",
        "America/Chicago",
      ).state,
    ).toBe("unknown"));
});

describe("Verification", () => {
  it("more than 180 days old is marked out of date", () => {
    expect(verification("2025-06-30", "2026-03-17T19:00:00Z", "America/New_York")).toEqual({
      stale: true,
      label: "Contact details may be out of date (verified 2025-06-30)",
    });
    expect(
      verification("2026-02-02", "2026-03-17T19:00:00Z", "America/New_York").stale,
    ).toBe(false);
  });
});

describe("Contacts sheet", () => {
  it("renders nothing while closed", () =>
    expect(
      renderToStaticMarkup(
        createElement(ContactsSheet, {
          open: false,
          hospitalId: "SYN-006",
          contacts: allContacts,
          instant: "2026-03-17T19:00:00Z",
          timezone: "America/Chicago",
          onClose: () => {},
        }),
      ),
    ).toBe(""));

  it("shows the reason, all three roles, a dialable number and the hours", () => {
    const out = sheet({
      hospitalId: "SYN-006",
      reason: "Guide doesn't cover Required Note Title",
      instant: "2026-03-17T15:00:00Z",
    });
    expect(out).toContain("Who to call at SYN-006");
    expect(out).toContain("Guide doesn't cover Required Note Title");
    for (const role of ["Technical lead", "Nursing in charge", "Administrator"])
      expect(out).toContain(role);
    expect(out).toContain("Priya Raman (synthetic)");
    expect(out).toContain("Available now · Mon-Fri 0700-1900 (CDT, hospital time)");
    expect(out).toContain("Hours not listed — call to check");
    const html = renderToStaticMarkup(
      createElement(ContactsSheet, {
        open: true,
        hospitalId: "SYN-006",
        contacts: hospital("SYN-006").contacts!,
        instant: "2026-03-17T15:00:00Z",
        timezone: "America/Chicago",
        onClose: () => {},
      }),
    );
    expect(html).toContain('href="tel:+15550177"');
    expect(html).toContain('role="dialog"');
  });

  it("marks a stale entry", () =>
    expect(sheet({ hospitalId: "SYN-004" })).toContain(
      "Contact details may be out of date (verified 2025-06-30)",
    ));

  it("names a missing role, and never fills it from another hospital", () => {
    const own = hospital("SYN-002").contacts!.filter((c) => c.role !== "administrator");
    const out = sheet({ hospitalId: "SYN-002", contacts: [...own, ...allContacts.filter((c) => c.hospitalId !== "SYN-002")] });
    expect(out).toContain("No administrator on file for this hospital.");
    for (const c of allContacts.filter((x) => x.hospitalId !== "SYN-002"))
      expect(out).not.toContain(c.name);
  });

  it("never shows another hospital's contact, whatever it is handed", () => {
    for (const h of seedHospitals) {
      const out = sheet({ hospitalId: h.id, contacts: allContacts });
      for (const c of allContacts)
        if (c.hospitalId === h.id) expect(out).toContain(c.name);
        else expect(out).not.toContain(c.name);
    }
  });

  it("a hospital with no directory says so for every role", () => {
    const out = sheet({ hospitalId: "SYN-999", contacts: allContacts });
    expect(out.match(/on file for this hospital/g)).toHaveLength(3);
    for (const c of allContacts) expect(out).not.toContain(c.name);
  });

  it("SYN-108's people arrive with its import and read in Phoenix time", () => {
    const read = (p: string) => ({ name: p, text: readFileSync(p, "utf8"), format: "json" as const });
    const p = previewImportBundle(
      [
        read("data/fixtures/syn-108/hospital_guides.json"),
        read("data/fixtures/syn-108/storyboard_notes.json"),
        read("data/seeds/contacts.json"),
      ],
      { existing: seedHospitals },
    );
    const h = p.hospitals.find((x) => x.id === "SYN-108")!;
    const out = sheet({
      hospitalId: h.id,
      contacts: h.contacts as Contact[],
      timezone: h.timezone,
      instant: "2026-03-17T13:45:00Z",
    });
    expect(out).toContain("Opens in 15 minutes (07:00 MST)");
    expect(out).toContain("Contact details may be out of date (verified 2025-05-20)");
  });
});
