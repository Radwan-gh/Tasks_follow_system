import { describe, expect, it } from "vitest";
import { nextRecurrenceDate } from "./recurrence.util";

const DAMASCUS = "Asia/Damascus"; // UTC+3, no DST

describe("nextRecurrenceDate", () => {
  it("reads weekdays on the local calendar, not the server's UTC one", () => {
    // Thursday 2026-10-08 01:00 in Damascus is still Wednesday 22:00 UTC.
    const thursdayOneAm = new Date("2026-10-07T22:00:00.000Z");
    const next = nextRecurrenceDate({ freq: "WEEKLY", weekdays: [4] }, thursdayOneAm, DAMASCUS);
    // The following Thursday, same local hour — not Friday 01:00.
    expect(next.toISOString()).toBe("2026-10-14T22:00:00.000Z");
  });

  it("picks the nearest listed weekday after the current due date", () => {
    // Monday 2026-10-05 20:00 Damascus; next of {Wed, Sun} is Wednesday.
    const next = nextRecurrenceDate({ freq: "WEEKLY", weekdays: [0, 3] }, new Date("2026-10-05T17:00:00.000Z"), DAMASCUS);
    expect(next.toISOString()).toBe("2026-10-07T17:00:00.000Z");
  });

  it("adds one local day for DAILY", () => {
    const next = nextRecurrenceDate({ freq: "DAILY" }, new Date("2026-10-07T22:30:00.000Z"), DAMASCUS);
    expect(next.toISOString()).toBe("2026-10-08T22:30:00.000Z");
  });

  it("clamps MONTHLY to the last day of a shorter month, on the local calendar", () => {
    // 31 Jan 2027 00:30 Damascus = 30 Jan 21:30 UTC.
    const next = nextRecurrenceDate({ freq: "MONTHLY", dayOfMonth: 31 }, new Date("2027-01-30T21:30:00.000Z"), DAMASCUS);
    expect(next.toISOString()).toBe("2027-02-27T21:30:00.000Z"); // 28 Feb 00:30 local
  });

  it("keeps the local time of day across a DST change", () => {
    // Saturday 2026-10-24 20:00 in Berlin (CEST, UTC+2); clocks fall back on the 25th.
    const next = nextRecurrenceDate({ freq: "WEEKLY", weekdays: [6] }, new Date("2026-10-24T18:00:00.000Z"), "Europe/Berlin");
    expect(next.toISOString()).toBe("2026-10-31T19:00:00.000Z"); // 20:00 CET, UTC+1
  });

  it("keeps date-only due dates (stored as UTC midnight) on the same day", () => {
    const next = nextRecurrenceDate({ freq: "WEEKLY", weekdays: [4] }, new Date("2026-10-08T00:00:00.000Z"), DAMASCUS);
    expect(next.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });
});
