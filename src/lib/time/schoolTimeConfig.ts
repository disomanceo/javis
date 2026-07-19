export const DEFAULT_TIMEZONE = "Asia/Bangkok";
export const DEFAULT_LOCALE = "th-TH";

export const SCHOOL_TIME_CONFIG = {
  morning: "09:00",
  afternoon: "13:00",
  evening: "16:00",
  beforeAssembly: "07:50",
  afterAssembly: "08:30",
  lunchBreak: "12:00",
  afterSchool: "16:00",
  beforeWorkEnds: "16:20",
} as const;

export type SchoolTimeLabel = keyof typeof SCHOOL_TIME_CONFIG;
