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
});
