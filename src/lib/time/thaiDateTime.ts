import { DEFAULT_LOCALE, DEFAULT_TIMEZONE, SCHOOL_TIME_CONFIG } from "@/lib/time/schoolTimeConfig";

export type DateTimeContext = {
  currentDateTime: string;
  timezone: typeof DEFAULT_TIMEZONE;
  locale: typeof DEFAULT_LOCALE;
  calendarSystem: "buddhist-and-gregorian";
  schoolTimeConfig: typeof SCHOOL_TIME_CONFIG;
};

export function getBangkokDateTimeContext(now = new Date()): DateTimeContext {
  return {
    currentDateTime: now.toISOString(),
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
