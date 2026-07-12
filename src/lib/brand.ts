/**
 * Central brand constants for อีแจ๋ว.
 *
 * Single source of truth for the assistant's name, persona, and user-facing
 * copy fragments. Import from here instead of hard-coding Thai strings.
 *
 * Legacy: "โฮชิ" (Hoshi) is retained as a recognized invocation alias so
 * existing owner commands keep working after the rebrand.
 */

export const BRAND = {
  /** Full display name (Thai). */
  name: "อีแจ๋ว",
  /** Short name the assistant uses to refer to herself. */
  selfRef: "แจ๋ว",
  /** English descriptor for metadata and status pages. */
  descriptor: "Personal LINE AI Secretary",
  /** One-line brand promise. */
  tagline: "เรื่องจุกจิก ให้แจ๋วจัดการ",
  /** Legacy names still accepted as invocation aliases. */
  legacyNames: ["โฮชิ", "Hoshi", "hoshi"],
  /** Pronoun the assistant uses for herself. */
  pronoun: "แจ๋ว",
  /** Polite particle (used naturally, not mechanically). */
  politeParticle: "ค่ะ",
} as const;

/**
 * LINE command text that opens the LIFF dashboard.
 * Keep in sync with the rich menu "เปิดอีแจ๋ว" cell.
 */
export const DASHBOARD_OPEN_COPY = `เปิด dashboard ของแจ๋วได้ที่ลิงก์นี้`;
