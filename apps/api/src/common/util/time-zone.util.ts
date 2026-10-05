/**
 * The users' time zone — which calendar day a due date falls on. It must be
 * theirs, not the server's: Railway runs in UTC, so a «Thursday 01:00» due
 * date (UTC+3) is still Wednesday on the server clock.
 */
export const DEFAULT_APP_TIME_ZONE = "Asia/Damascus";

export const appTimeZone = () => process.env.APP_TIME_ZONE || DEFAULT_APP_TIME_ZONE;

/** Milliseconds to add to the UTC instant `at` to get the wall-clock time in `timeZone`. */
function zoneOffset(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return wall - (at.getTime() - at.getUTCMilliseconds());
}

/**
 * The instant's wall-clock time in `timeZone`, held in a Date's UTC fields so
 * calendar arithmetic can use the `getUTC*`/`setUTC*` methods.
 */
export function toWallClock(at: Date, timeZone = appTimeZone()): Date {
  return new Date(at.getTime() + zoneOffset(at, timeZone));
}

/** Inverse of `toWallClock`; the second pass settles an offset that differs across a DST change. */
export function fromWallClock(wall: Date, timeZone = appTimeZone()): Date {
  const guess = wall.getTime() - zoneOffset(wall, timeZone);
  return new Date(wall.getTime() - zoneOffset(new Date(guess), timeZone));
}

/** `YYYY-MM-DD` of the day `at` falls on in `timeZone`. */
export function calendarDate(at: Date, timeZone = appTimeZone()): string {
  return toWallClock(at, timeZone).toISOString().slice(0, 10);
}
