# Encounter Guide interface

The clinician surface uses Operate mode. On desktop, the consultation canvas is on the left and documentation on the right. The bottom-right guide companion uses a luminous orb, quiet field previews and an expandable panel. It occupies reserved layout space so guidance cannot cover the active form. Mobile stacks these areas and collapses the video canvas initially.

Deep green is reserved for the consultation stage and companion launcher. Paper-white documentation sits on a pale green-grey canvas. Existing Segoe UI/system sans typography remains; compact labels, readable forms, modest heading scale, 44px controls, visible focus and explicit severity words take priority over decorative motion. The orb briefly brightens when guidance opens; reduced motion disables this effect.

The local camera preview and synthetic mode must be labeled accurately. Do not show a connected-call badge, listening animation, voice controls or live-AI claims unless those capabilities are actually active. Source evidence, uncertain results and completion requirements remain visible through their existing components.

Implementation: `src/consultation.css`, `src/encounter/ConsultationPane.tsx`, `src/guidance/AssistantOrb.tsx`; existing guidance/chat components retain the behavior contracts.
