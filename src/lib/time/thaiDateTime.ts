import { DEFAULT_LOCALE, DEFAULT_TIMEZONE, SCHOOL_TIME_CONFIG } from "@/lib/time/schoolTimeConfig";

export type DateTimeContext = {
  currentDateTime: string;
  currentBangkokDate: string;
  currentBangkokDayOfWeek: string;
  currentBangkokThaiDayOfWeek: string;
  tomorrowBangkokDate: string;
  tomorrowBangkokDayOfWeek: string;
  tomorrowBangkokThaiDayOfWeek: string;
  timezone: typeof DEFAULT_TIMEZONE;
  locale: typeof DEFAULT_LOCALE;
  calendarSystem: "buddhist-and-gregorian";
  schoolTimeConfig: typeof SCHOOL_TIME_CONFIG;
};

export function getBangkokDateTimeContext(now = new Date()): DateTimeContext {
  const today = getBangkokDateKey(now);
  const tomorrow = addDaysToDateKey(today, 1);

  return {
    currentDateTime: now.toISOString(),
    currentBangkokDate: today,
    currentBangkokDayOfWeek: getWeekdayForDateKey(today, "en-US"),
    currentBangkokThaiDayOfWeek: getWeekdayForDateKey(today, "th-TH"),
    tomorrowBangkokDate: tomorrow,
    tomorrowBangkokDayOfWeek: getWeekdayForDateKey(tomorrow, "en-US"),
    tomorrowBangkokThaiDayOfWeek: getWeekdayForDateKey(tomorrow, "th-TH"),
    timezone: DEFAULT_TIMEZONE,
    locale: DEFAULT_LOCALE,
    calendarSystem: "buddhist-and-gregorian",
    schoolTimeConfig: SCHOOL_TIME_CONFIG,
  };
}

export function getBangkokDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

export function normalizeThaiYear(yearText?: string | null) {
  if (!yearText) return undefined;
  const year = Number(yearText);
  if (!Number.isFinite(year)) return undefined;
  if (year < 100) return 2500 + year - 543;
  if (year > 2400) return year - 543;
  return year;
}

export function formatThaiDate(date: Date) {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: DEFAULT_TIMEZONE,
    dateStyle: "full",
  }).format(date);
}

export function getBangkokDateKey(now = new Date()) {
  const parts = getBangkokDateParts(now);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function getWeekdayForDateKey(dateKey: string, locale: "en-US" | "th-TH" = "th-TH") {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatThaiDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: "UTC",
    dateStyle: "full",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

const THAI_MONTHS: Record<string, number> = {
  "ม.ค.": 1,
  มกราคม: 1,
  "ก.พ.": 2,
  กุมภาพันธ์: 2,
  "มี.ค.": 3,
  มีนาคม: 3,
  "เม.ย.": 4,
  เมษายน: 4,
  "พ.ค.": 5,
  พฤษภาคม: 5,
  "มิ.ย.": 6,
  มิถุนายน: 6,
  "ก.ค.": 7,
  กรกฎาคม: 7,
  "ส.ค.": 8,
  สิงหาคม: 8,
  "ก.ย.": 9,
  กันยายน: 9,
  "ต.ค.": 10,
  ตุลาคม: 10,
  "พ.ย.": 11,
  พฤศจิกายน: 11,
  "ธ.ค.": 12,
  ธันวาคม: 12,
};

const THAI_WEEKDAYS: Record<string, number> = {
  อาทิตย์: 0,
  จันทร์: 1,
  อังคาร: 2,
  พุธ: 3,
  พฤหัส: 4,
  พฤหัสบดี: 4,
  ศุกร์: 5,
  เสาร์: 6,
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function weekdayIndexForDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function extractMentionedWeekday(text: string) {
  for (const [weekday, index] of Object.entries(THAI_WEEKDAYS)) {
    if (new RegExp(`วัน\\s*${escapeRegExp(weekday)}`).test(text)) return { weekday, index };
  }

  return null;
}

export type ThaiDateResolution = {
  dateKey: string;
  source: "today" | "tomorrow" | "day-after-tomorrow" | "explicit-date" | "week" | "month";
  mentionedWeekday?: string;
  weekdayMismatch?: {
    mentioned: string;
    actual: string;
  };
  monthKey?: string;
  weekKey?: string;
  startDateKey?: string;
  endDateKey?: string;
};

function buildMonthRange(year: number, month: number) {
  const startDateKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDateKey = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return {
    monthKey: `${year}-${String(month).padStart(2, "0")}`,
    startDateKey,
    endDateKey,
  };
}

function buildWeekRange(dateKey: string) {
  const weekday = weekdayIndexForDateKey(dateKey);
  const offsetToMonday = (weekday + 6) % 7;
  const startDateKey = addDaysToDateKey(dateKey, -offsetToMonday);
  const endDateKey = addDaysToDateKey(startDateKey, 6);
  return {
    weekKey: `${startDateKey}_${endDateKey}`,
    startDateKey,
    endDateKey,
  };
}

export function resolveThaiDateFromText(text: string, now = new Date()): ThaiDateResolution | null {
  const today = getBangkokDateKey(now);
  let resolved: ThaiDateResolution | null = null;

  if (/(?:สัปดาห์|อาทิตย์)นี้/.test(text)) {
    Object.assign(resolved = { dateKey: today, source: "week" }, buildWeekRange(today));
  } else if (/(?:สัปดาห์|อาทิตย์)หน้า/.test(text)) {
    const thisWeek = buildWeekRange(today);
    const startOfNextWeek = addDaysToDateKey(thisWeek.startDateKey, 7);
    Object.assign(resolved = { dateKey: startOfNextWeek, source: "week" }, buildWeekRange(startOfNextWeek));
  } else if (/เดือนนี้/.test(text)) {
    const currentParts = getBangkokDateParts(now);
    Object.assign(resolved = { dateKey: today, source: "month" }, buildMonthRange(currentParts.year, currentParts.month));
  } else if (/เดือนหน้า/.test(text)) {
    const currentParts = getBangkokDateParts(now);
    const month = currentParts.month === 12 ? 1 : currentParts.month + 1;
    const year = currentParts.month === 12 ? currentParts.year + 1 : currentParts.year;
    Object.assign(resolved = { dateKey: `${year}-${String(month).padStart(2, "0")}-01`, source: "month" }, buildMonthRange(year, month));
  } else if (/มะรืน/.test(text)) {
    resolved = { dateKey: addDaysToDateKey(today, 2), source: "day-after-tomorrow" };
  } else if (/พรุ่งนี้/.test(text)) {
    resolved = { dateKey: addDaysToDateKey(today, 1), source: "tomorrow" };
  } else if (/วันนี้/.test(text)) {
    resolved = { dateKey: today, source: "today" };
  }

  const monthPattern = Object.keys(THAI_MONTHS)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const explicitDate = text.match(new RegExp(`(?:วัน\\s*\\S+\\s*)?(?:ที่\\s*)?(\\d{1,2})\\s*(${monthPattern})\\s*(\\d{2,4})?`, "i"));

  if (explicitDate) {
    const currentParts = getBangkokDateParts(now);
    const day = Number(explicitDate[1]);
    const month = THAI_MONTHS[explicitDate[2]];
    const year = normalizeThaiYear(explicitDate[3]) || currentParts.year;

    if (day && month && year) {
      resolved = {
        dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        source: "explicit-date",
      };
    }
  }
  if (!resolved) {
    const plainDayMatch = text.match(/(?:วันที่|วัน\s*ที่)\s*(\d{1,2})\b/i);
    if (plainDayMatch) {
      const day = Number(plainDayMatch[1]);
      const currentParts = getBangkokDateParts(now);
      const currentMonth = currentParts.month;
      const currentYear = currentParts.year;

      const buildDateKey = (year: number, month: number, dayValue: number) =>
        `${year}-${String(month).padStart(2, "0")}-${String(dayValue).padStart(2, "0")}`;

      const isValidDateKey = (year: number, month: number, dayValue: number) => {
        const date = new Date(Date.UTC(year, month - 1, dayValue));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === dayValue;
      };

      const trySameMonth = isValidDateKey(currentYear, currentMonth, day);
      const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
      const tryNextMonth = isValidDateKey(nextYear, nextMonth, day);

      if (day >= currentParts.day && trySameMonth) {
        resolved = {
          dateKey: buildDateKey(currentYear, currentMonth, day),
          source: "explicit-date",
        };
      } else if (tryNextMonth) {
        resolved = {
          dateKey: buildDateKey(nextYear, nextMonth, day),
          source: "explicit-date",
        };
      }
    }
  }
  if (!resolved) return null;

  const mentioned = extractMentionedWeekday(text);
  if (mentioned) {
    resolved.mentionedWeekday = mentioned.weekday;
    const actualIndex = weekdayIndexForDateKey(resolved.dateKey);
    if (actualIndex !== mentioned.index) {
      resolved.weekdayMismatch = {
        mentioned: mentioned.weekday,
        actual: getWeekdayForDateKey(resolved.dateKey, "th-TH").replace(/^วัน/, ""),
      };
    }
  }

  return resolved;
}
