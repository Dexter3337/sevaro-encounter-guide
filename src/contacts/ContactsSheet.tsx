import { useEffect, useRef, useState } from "react";
import type { Contact } from "../domain";
import {
  ROLES,
  availabilityAt,
  contactsFor,
  roleLabel,
  verification,
  zoneName,
} from "./availability";

// Machine 2 owns this file. Machine 3 created it so the mount point and the
// prop signature exist; the signature is frozen for the sprint.
export interface ContactsSheetProps {
  open: boolean;
  hospitalId: string;
  contacts: Contact[];
  /** ISO instant, for working out who is available now. */
  instant: string;
  /** The hospital's IANA zone. Availability is read in its time, not ours. */
  timezone: string;
  /** Why the doctor was sent here, e.g. "Guide doesn't cover note title". */
  reason?: string;
  onClose: () => void;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="link"
      onClick={() => {
        // Demo laptops have no dialler; copying is the fallback.
        navigator.clipboard?.writeText(value).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function ContactCard({
  contact: c,
  instant,
  timezone,
}: {
  contact: Contact;
  instant: string;
  timezone: string;
}) {
  const now = availabilityAt(c.availability, instant, timezone);
  const checked = verification(c.lastVerified, instant, timezone);
  return (
    <article
      className={`contact-card ${now.state}${checked.stale ? " stale" : ""}`}
      data-testid="contact-card"
      data-role={c.role}
    >
      <p className="eyebrow">{roleLabel(c.role)}</p>
      <h3>{c.name}</h3>
      {c.title && <p className="muted">{c.title}</p>}
      <p className="contact-phone">
        <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a>{" "}
        <a className="link" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>
          Call
        </a>{" "}
        <CopyButton value={c.phone} />
      </p>
      {c.altChannel && <p className="contact-alt">{c.altChannel}</p>}
      <p className={`contact-availability ${now.state}`}>
        <strong>{now.label}</strong>
        {c.availability && (
          <>
            {" "}
            · {c.availability} ({zoneName(instant, timezone)}, hospital time)
          </>
        )}
      </p>
      <small className={checked.stale ? "contact-stale" : "muted"}>
        {checked.label}
      </small>
    </article>
  );
}

export function ContactsSheet({
  open,
  hospitalId,
  contacts,
  instant,
  timezone,
  reason,
  onClose,
}: ContactsSheetProps) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) close.current?.focus();
  }, [open]);
  if (!open) return null;
  const mine = contactsFor(hospitalId, contacts);
  const extra = [...new Set(mine.map((c) => c.role))].filter(
    (r) => !ROLES.some(([known]) => known === r),
  );
  return (
    <section
      className="contacts-sheet"
      role="dialog"
      aria-modal="false"
      aria-label={`Who to call at ${hospitalId}`}
      data-testid="contacts-sheet"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="contacts-head">
        <div>
          <p className="eyebrow">Escalate · {hospitalId}</p>
          <h2>Who to call at {hospitalId}</h2>
          {reason && <p className="contacts-reason">{reason}</p>}
        </div>
        <button
          ref={close}
          type="button"
          className="link"
          onClick={onClose}
          aria-label="Close contacts"
        >
          Close
        </button>
      </header>
      {[...ROLES.map(([role]) => role), ...extra].map((role) => {
        const people = mine.filter((c) => c.role === role);
        return people.length ? (
          people.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              instant={instant}
              timezone={timezone}
            />
          ))
        ) : (
          <p key={role} className="contact-missing" data-role={role}>
            No {roleLabel(role).toLowerCase()} on file for this hospital.
          </p>
        );
      })}
      <small className="muted">
        Synthetic directory · availability read in the hospital's own time.
      </small>
    </section>
  );
}
