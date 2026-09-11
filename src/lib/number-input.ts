import type { KeyboardEvent } from "react";

/**
 * Guards for numeric inputs. Counts, capital and fees can never be negative,
 * but `<input type="number" min={0}>` only constrains the spinner — the user
 * can still type or paste "-5". These close that gap.
 */

/** onKeyDown for number fields: blocks the minus sign and exponent notation. */
export function blockNegativeKeys(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") e.preventDefault();
}

/** Clamps a parsed number to ≥ 0 (NaN becomes 0). */
export function nonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** For string-valued fields: keeps digits and a single decimal point. */
export function nonNegativeString(s: string, allowDecimal = true): string {
  if (!allowDecimal) return s.replace(/[^0-9]/g, "");
  return s.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
}
