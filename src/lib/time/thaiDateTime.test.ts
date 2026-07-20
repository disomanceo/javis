import { describe, expect, it } from "vitest";
import {
  getBangkokDateTimeContext,
  getWeekdayForDateKey,
  resolveThaiDateFromText,
} from "@/lib/time/thaiDateTime";

const sundayInBangkok = new Date("2026-07-19T05:00:00.000Z");

describe("thai date time helpers", () => {
  it("exposes Bangkok today and tomorrow context", () => {
    const context = getBangkokDateTimeContext(sundayInBangkok);

    expect(context.currentBangkokDate).toBe("2026-07-19");
    expect(context.currentBangkokDayOfWeek).toBe("Sunday");
    expect(context.tomorrowBangkokDate).toBe("2026-07-20");
    expect(context.tomorrowBangkokDayOfWeek).toBe("Monday");
  });

  it("resolves tomorrow from Bangkok date instead of UTC date", () => {
    const resolved = resolveThaiDateFromText("พรุ่งนี้มีอะไร", sundayInBangkok);

    expect(resolved?.dateKey).toBe("2026-07-20");
    expect(getWeekdayForDateKey(resolved?.dateKey || "", "en-US")).toBe("Monday");
  });

  it("resolves Thai explicit Buddhist short year dates", () => {
    const resolved = resolveThaiDateFromText("วันศุกร์ที่ 24 ก.ค. 69 แห่เทียน เรี่ยไรเงิน", sundayInBangkok);

    expect(resolved?.dateKey).toBe("2026-07-24");
    expect(resolved?.weekdayMismatch).toBeUndefined();
  });

  it("resolves plain day references like วันที่ 24 to the nearest valid upcoming date", () => {
    const resolved = resolveThaiDateFromText("วันที่ 24 มีอะไรไหม", sundayInBangkok);

    expect(resolved?.dateKey).toBe("2026-07-24");
  });

  it("resolves month references like เดือนนี้", () => {
    const resolved = resolveThaiDateFromText("เดือนนี้ มีประชุมไหม", sundayInBangkok);

    expect(resolved?.source).toBe("month");
    expect(resolved?.monthKey).toBe("2026-07");
    expect(resolved?.startDateKey).toBe("2026-07-01");
    expect(resolved?.endDateKey).toBe("2026-07-31");
  });

  it("resolves week references like สัปดาห์นี้", () => {
    const resolved = resolveThaiDateFromText("สัปดาห์นี้ มีประชุมไหม", sundayInBangkok);

    expect(resolved?.source).toBe("week");
    expect(resolved?.weekKey).toBe("2026-07-13_2026-07-19");
    expect(resolved?.startDateKey).toBe("2026-07-13");
    expect(resolved?.endDateKey).toBe("2026-07-19");
  });

  it("resolves week references like สัปดาห์หน้า", () => {
    const resolved = resolveThaiDateFromText("สัปดาห์หน้า มีประชุมไหม", sundayInBangkok);

    expect(resolved?.source).toBe("week");
    expect(resolved?.weekKey).toBe("2026-07-20_2026-07-26");
    expect(resolved?.startDateKey).toBe("2026-07-20");
    expect(resolved?.endDateKey).toBe("2026-07-26");
  });
});
