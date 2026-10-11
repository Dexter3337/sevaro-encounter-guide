/** A visual identity for the guide companion, never a listening indicator. */
export function AssistantOrb({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`assistant-orb${small ? " small" : ""}`}
      aria-hidden="true"
    >
      <span />
    </span>
  );
}
