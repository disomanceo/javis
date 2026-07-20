import { Timestamp } from "firebase-admin/firestore";
import type { AssistantIntent, IntentRequestContext } from "@/lib/intent/types";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { formatThaiDateKey, getBangkokDateKey, resolveThaiDateFromText } from "@/lib/time/thaiDateTime";

export type ScheduleQueryResult = {
  success: true;
  operation: "query_schedule";
  entityType: "event";
  date: string;
  count: number;
  records: Record<string, unknown>[];
  safeMessage: string;
};

function serializeFirestoreData(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) return {};
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (value instanceof Timestamp) return [key, value.toDate().toISOString()];
      return [key, value];
    }),
  );
}

function eventTimeLabel(event: Record<string, unknown>) {
  const startTime = typeof event.startTime === "string" ? event.startTime : "";
  const endTime = typeof event.endTime === "string" ? event.endTime : "";
  if (startTime && endTime) return `${startTime}-${endTime} น.`;
  if (startTime) return `${startTime} น.`;
  return "ไม่ระบุเวลา";
}

function buildScheduleMessage(target: ScheduleQueryTarget, records: Record<string, unknown>[]) {
  const dateLabel = formatScheduleLabel(target);

  if (!records.length) {
    return `${dateLabel} ยังไม่มีนัดที่บันทึกไว้ครับ ผอ.`;
  }

  const lines = records.map((event, index) => {
    const title = String(event.title || "รายการไม่มีชื่อ");
    const location = event.location ? ` (${String(event.location)})` : "";
    return `${index + 1}. ${eventTimeLabel(event)} ${title}${location}`;
  });

  return [`${dateLabel} มีนัด ${records.length} รายการครับ ผอ.`, ...lines].join("\n");
}

type ScheduleQueryTarget = {
  dateKey: string;
  source: string;
  monthKey?: string;
  weekKey?: string;
  startDateKey?: string;
  endDateKey?: string;
};

function formatThaiMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatThaiWeekLabel(startDateKey: string, endDateKey: string) {
  const startLabel = formatThaiDateKey(startDateKey);
  const endLabel = formatThaiDateKey(endDateKey);
  return `สัปดาห์ระหว่าง ${startLabel} ถึง ${endLabel}`;
}

function formatScheduleLabel(target: ScheduleQueryTarget) {
  if (target.startDateKey && target.endDateKey && target.monthKey) {
    return formatThaiMonthKey(target.monthKey);
  }
  if (target.startDateKey && target.endDateKey && target.weekKey) {
    return formatThaiWeekLabel(target.startDateKey, target.endDateKey);
  }
  return formatThaiDateKey(target.dateKey);
}

function resolveScheduleQueryTarget(input: { intent: AssistantIntent; sourceText: string; now?: Date }): ScheduleQueryTarget {
  const resolution = input.intent.entities.eventDate
    ? { dateKey: input.intent.entities.eventDate, source: "explicit-date" }
    : resolveThaiDateFromText(input.sourceText, input.now);

  if (resolution) {
    return resolution;
  }

  return { dateKey: getBangkokDateKey(input.now), source: "today" };
}

export async function querySchedule(input: {
  intent: AssistantIntent;
  requestContext: IntentRequestContext;
  sourceText: string;
  now?: Date;
}): Promise<ScheduleQueryResult> {
  const target = resolveScheduleQueryTarget(input);
  const collection = getAdminDb()
    .collection("users")
    .doc(input.requestContext.user.id)
    .collection("events");

  const query = target.startDateKey && target.endDateKey
    ? collection.where("eventDate", ">=", target.startDateKey).where("eventDate", "<=", target.endDateKey).limit(50)
    : collection.where("eventDate", "==", target.dateKey).limit(50);

  const snapshot = await query.get();

  const records: Record<string, unknown>[] = snapshot.docs
    .map((doc) => ({ id: doc.id, ...serializeFirestoreData(doc.data()) }) as Record<string, unknown>)
    .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));

  return {
    success: true,
    operation: "query_schedule",
    entityType: "event",
    date: target.dateKey,
    count: records.length,
    records,
    safeMessage: buildScheduleMessage(target, records),
  };
}
