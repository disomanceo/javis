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

function buildScheduleMessage(dateKey: string, records: Record<string, unknown>[]) {
  const dateLabel = formatThaiDateKey(dateKey);

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

export function resolveScheduleQueryDate(input: { intent: AssistantIntent; sourceText: string; now?: Date }) {
  return input.intent.entities.eventDate || resolveThaiDateFromText(input.sourceText, input.now)?.dateKey || getBangkokDateKey(input.now);
}

export async function querySchedule(input: {
  intent: AssistantIntent;
  requestContext: IntentRequestContext;
  sourceText: string;
  now?: Date;
}): Promise<ScheduleQueryResult> {
  const dateKey = resolveScheduleQueryDate(input);
  const snapshot = await getAdminDb()
    .collection("users")
    .doc(input.requestContext.user.id)
    .collection("events")
    .where("eventDate", "==", dateKey)
    .limit(50)
    .get();

  const records: Record<string, unknown>[] = snapshot.docs
    .map((doc) => ({ id: doc.id, ...serializeFirestoreData(doc.data()) }) as Record<string, unknown>)
    .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));

  return {
    success: true,
    operation: "query_schedule",
    entityType: "event",
    date: dateKey,
    count: records.length,
    records,
    safeMessage: buildScheduleMessage(dateKey, records),
  };
}
