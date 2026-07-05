/**
 * Fractional indexing ("LexoRank"-style) order keys.
 *
 * Keys are lexicographically sortable strings. Moving an item to a new
 * position between two neighbors only ever requires computing and writing
 * ONE new key — never renumbering siblings — which is what makes this safe
 * under concurrent drag-and-drop edits and cheap to broadcast over realtime.
 *
 * Based on the algorithm described by Figma's "Realtime Editing of Ordered
 * Sequences" (fractional-indexing, MIT licensed); reimplemented here so it
 * has no runtime dependency and can be unit-tested in isolation.
 */

const BASE_62_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Maximum key length before a caller should trigger a background rebalance. */
export const REBALANCE_LENGTH_THRESHOLD = 50;

export class OrderKeyError extends Error {}

function integerLength(head: string): number {
  if (head >= "a" && head <= "z") {
    return head.charCodeAt(0) - "a".charCodeAt(0) + 2;
  } else if (head >= "A" && head <= "Z") {
    return "Z".charCodeAt(0) - head.charCodeAt(0) + 2;
  }
  throw new OrderKeyError(`invalid order key head: ${head}`);
}

function getIntegerPart(key: string): string {
  const len = integerLength(key[0]);
  if (len > key.length) throw new OrderKeyError(`invalid order key: ${key}`);
  return key.slice(0, len);
}

function validateInteger(int: string): void {
  if (int.length !== integerLength(int[0])) {
    throw new OrderKeyError(`invalid integer part of order key: ${int}`);
  }
}

function validateOrderKey(key: string): void {
  if (key === "A" + "0".repeat(26)) {
    throw new OrderKeyError(`invalid order key: ${key}`);
  }
  const i = getIntegerPart(key);
  const f = key.slice(i.length);
  if (f.slice(-1) === "0") {
    throw new OrderKeyError(`invalid order key: ${key}`);
  }
}

function incrementInteger(x: string, digits: string): string | undefined {
  validateInteger(x);
  const head = x[0];
  const digs = x.slice(1).split("");
  let carry = true;
  for (let i = digs.length - 1; carry && i >= 0; i--) {
    const d = digits.indexOf(digs[i]) + 1;
    if (d === digits.length) {
      digs[i] = digits[0];
    } else {
      digs[i] = digits[d];
      carry = false;
    }
  }
  if (carry) {
    if (head === "Z") return "a0";
    if (head === "z") return undefined;
    const h = String.fromCharCode(head.charCodeAt(0) + 1);
    if (h > "a") digs.push("0");
    else digs.pop();
    return h + digs.join("");
  }
  return head + digs.join("");
}

function decrementInteger(x: string, digits: string): string | undefined {
  validateInteger(x);
  const head = x[0];
  const digs = x.slice(1).split("");
  let borrow = true;
  for (let i = digs.length - 1; borrow && i >= 0; i--) {
    const d = digits.indexOf(digs[i]) - 1;
    if (d === -1) {
      digs[i] = digits[digits.length - 1];
    } else {
      digs[i] = digits[d];
      borrow = false;
    }
  }
  if (borrow) {
    if (head === "a") return "Z" + digits[digits.length - 1];
    if (head === "0") return undefined;
    const h = String.fromCharCode(head.charCodeAt(0) - 1);
    if (h < "Z") digs.push(digits[digits.length - 1]);
    else digs.pop();
    return h + digs.join("");
  }
  return head + digs.join("");
}

function midpoint(a: string, b: string | undefined, digits: string): string {
  if (b !== undefined && a >= b) {
    throw new OrderKeyError(`${a} >= ${b}`);
  }
  if (a.slice(-1) === "0" || (b !== undefined && b.slice(-1) === "0")) {
    throw new OrderKeyError("trailing zero");
  }
  if (b !== undefined) {
    let n = 0;
    while ((a[n] ?? "0") === b[n]) n++;
    if (n > 0) {
      return b.slice(0, n) + midpoint(a.slice(n), b.slice(n), digits);
    }
  }
  const digitA = a.length > 0 ? digits.indexOf(a[0]) : 0;
  const digitB = b !== undefined ? digits.indexOf(b[0]) : digits.length;
  if (digitB - digitA > 1) {
    const midDigit = Math.round(0.5 * (digitA + digitB));
    return digits[midDigit];
  }
  if (b !== undefined && b.length > 1) {
    return b.slice(0, 1);
  }
  return digits[digitA] + midpoint(a.slice(1), undefined, digits);
}

/**
 * Generate a key that sorts strictly between `a` and `b`.
 * Pass `null` for `a` to generate a key before everything (or the first key
 * overall), and `null` for `b` to generate a key after everything.
 */
export function generateKeyBetween(
  a: string | null,
  b: string | null,
  digits: string = BASE_62_DIGITS,
): string {
  if (a !== null) validateOrderKey(a);
  if (b !== null) validateOrderKey(b);
  if (a !== null && b !== null && a >= b) {
    throw new OrderKeyError(`${a} >= ${b}`);
  }

  if (a === null) {
    if (b === null) return "a0";

    const ib = getIntegerPart(b);
    const fb = b.slice(ib.length);
    if (fb.length > 0) {
      return ib + midpoint("", fb, digits);
    }
    const res = decrementInteger(ib, digits);
    if (res === undefined) {
      throw new OrderKeyError("cannot generate a key before the first key");
    }
    return res;
  }

  if (b === null) {
    const ia = getIntegerPart(a);
    const fa = a.slice(ia.length);
    const i = incrementInteger(ia, digits);
    return i === undefined ? ia + midpoint(fa, undefined, digits) : i;
  }

  const ia = getIntegerPart(a);
  const fa = a.slice(ia.length);
  const ib = getIntegerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) {
    return ia + midpoint(fa, fb, digits);
  }
  const i = incrementInteger(ia, digits);
  if (i === undefined) {
    throw new OrderKeyError("cannot increment integer part any further");
  }
  if (i < b) {
    return i;
  }
  return ia + midpoint(fa, undefined, digits);
}

/** Evenly-spaced keys for seeding N items from scratch, or for a rebalance job. */
export function generateNKeysBetween(
  a: string | null,
  b: string | null,
  n: number,
  digits: string = BASE_62_DIGITS,
): string[] {
  if (n === 0) return [];
  if (n === 1) return [generateKeyBetween(a, b, digits)];

  const mid = Math.floor(n / 2);
  const midKey = generateKeyBetween(a, b, digits);
  return [
    ...generateNKeysBetween(a, midKey, mid, digits),
    midKey,
    ...generateNKeysBetween(midKey, b, n - mid - 1, digits),
  ];
}

/** Whether a key has grown long enough that a background rebalance should run. */
export function needsRebalance(key: string, threshold = REBALANCE_LENGTH_THRESHOLD): boolean {
  return key.length > threshold;
}
