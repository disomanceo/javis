import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { AssistantIntent, IntentRequestContext } from "@/lib/intent/types";
import { parseAssistantIntent } from "@/lib/intent/schema";
import { getAdminDb } from "@/lib/firebaseAdmin";

export type PendingAction = {
  id: string;
  userId: string;
  sessionId: string;
  intent: AssistantIntent;
  collectedFields: Record<string, unknown>;
  missingFields: string[];
  ambiguities: string[];
  awaitingField: string | null;
  sourceText: string;
  modelName?: string;
  modelRequestId?: string;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PendingMergeResult =
  | {
      status: "merged";
      intent: AssistantIntent;
      confirmed: boolean;
      sourceText: string;
    }
  | {
      status: "cancelled";
      safeMessage: string;
    }
  | {
      status: "no_match";
    };

function serializeTimestamp(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return value;
}

function mapPendingDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): PendingAction | null {
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data) return null;
  const parsed = parseAssistantIntent(data.intent);
  if (!parsed.success) return null;

  return {
    id: doc.id,
    userId: String(data.userId || ""),
    sessionId: String(data.sessionId || ""),
    intent: parsed.data,
    collectedFields: typeof data.collectedFields === "object" && data.collectedFields ? data.collectedFields : {},
    missingFields: Array.isArray(data.missingFields) ? data.missingFields.map(String) : [],
    ambiguities: Array.isArray(data.ambiguities) ? data.ambiguities.map(String) : [],
    awaitingField: data.awaitingField ? String(data.awaitingField) : null,
    sourceText: String(data.sourceText || ""),
    modelName: data.modelName ? String(data.modelName) : undefined,
    modelRequestId: data.modelRequestId ? String(data.modelRequestId) : undefined,
    expiresAt: serializeTimestamp(data.expiresAt) as string | undefined,
    createdAt: serializeTimestamp(data.createdAt) as string | undefined,
    updatedAt: serializeTimestamp(data.updatedAt) as string | undefined,
  };
}

function pendingCollection() {
  return getAdminDb().collection("pendingActions");
}

export async function createPendingAction(input: {
  requestContext: IntentRequestContext;
  intent: AssistantIntent;
  sourceText: string;
  modelName?: string;
  modelRequestId?: string;
}) {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const doc = pendingCollection().doc();
  const data = {
    id: doc.id,
    userId: input.requestContext.user.id,
    sessionId: input.requestContext.sessionId,
    intent: input.intent,
    collectedFields: input.intent.entities,
    missingFields: input.intent.missingFields,
    ambiguities: input.intent.ambiguities,
    awaitingField: input.intent.missingFields[0] || null,
    sourceText: input.sourceText,
    modelName: input.modelName || null,
    modelRequestId: input.modelRequestId || null,
    status: "pending",
    expiresAt: Timestamp.fromDate(expiresAt),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await doc.set(data);
  return doc.id;
}

export async function findLatestPendingAction(requestContext: IntentRequestContext) {
  const snapshot = await pendingCollection()
    .where("userId", "==", requestContext.user.id)
    .where("sessionId", "==", requestContext.sessionId)
    .where("status", "==", "pending")
    .limit(10)
    .get();

  const pending =
    snapshot.docs
      .map(mapPendingDoc)
      .filter((item): item is PendingAction => Boolean(item))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0] || null;
  if (!pending) return null;

  if (pending.expiresAt && new Date(pending.expiresAt).getTime() < Date.now()) {
    await closePendingAction(pending.id, "expired");
    return null;
  }

  return pending;
}

export async function closePendingAction(id: string, status: "committed" | "cancelled" | "expired") {
  await pendingCollection().doc(id).set(
    {
      status,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function updatePendingAction(input: { id: string; intent: AssistantIntent; sourceText: string }) {
  await pendingCollection().doc(input.id).set(
    {
      intent: input.intent,
      collectedFields: input.intent.entities,
      missingFields: input.intent.missingFields,
      ambiguities: input.intent.ambiguities,
      awaitingField: input.intent.missingFields[0] || null,
      sourceText: input.sourceText,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export function isConfirmationText(text: string) {
  return /^(ใช่|ครับ|ค่ะ|คะ|โอเค|ตกลง|ยืนยัน|บันทึก|บันทึกด้วย|เอาเลย|จัดเลย|จำไว้)(ครับ|ค่ะ|คะ)?$/i.test(text.trim());
}

export function isCancelText(text: string) {
  return /^(ยกเลิก|ไม่ต้อง|ไม่ต้องบันทึก|เมื่อกี้พูดผิด|พูดเล่น)(ครับ|ค่ะ|คะ)?$/i.test(text.trim());
}

function parseThaiTime(text: string) {
  const normalized = text.trim().toLowerCase();
  const clockMatch = normalized.match(/(\d{1,2})[:.](\d{2})/);
  if (clockMatch) {
    const hour = Number(clockMatch[1]);
    const minute = Number(clockMatch[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const digitHour = normalized.match(/(\d{1,2})\s*(โมง|นาฬิกา)/);
  if (digitHour) {
    const hour = Number(digitHour[1]);
    if (hour >= 0 && hour <= 23) return `${String(hour).padStart(2, "0")}:00`;
  }

  const thaiHours: Record<string, number> = {
    หนึ่ง: 1,
    ตีหนึ่ง: 1,
    สอง: 2,
    ตีสอง: 2,
    สาม: 3,
    ตีสาม: 3,
    สี่: 4,
    ตีสี่: 4,
    ห้า: 5,
    ตีห้า: 5,
    หก: 6,
    เจ็ด: 7,
    แปด: 8,
    เก้า: 9,
    สิบ: 10,
    สิบเอ็ด: 11,
    เที่ยง: 12,
    บ่ายโมง: 13,
    บ่ายสอง: 14,
    บ่ายสาม: 15,
    บ่ายสี่: 16,
    บ่ายห้า: 17,
  };

  for (const [word, hour] of Object.entries(thaiHours)) {
    if (normalized.includes(word)) return `${String(hour).padStart(2, "0")}:00`;
  }

  return null;
}

function mergeMissingFields(intent: AssistantIntent, userText: string) {
  const next: AssistantIntent = structuredClone(intent);
  const time = parseThaiTime(userText);

  if (time && next.missingFields.includes("startTime")) {
    next.entities.startTime = time;
    next.entities.timezone = next.entities.timezone || "Asia/Bangkok";
    next.missingFields = next.missingFields.filter((field) => field !== "startTime" && field !== "time");
    next.normalizedSummary = `${next.normalizedSummary} เวลา ${time} น.`;
  }

  if (time && next.missingFields.includes("dueTime")) {
    next.entities.dueTime = time;
    next.entities.timezone = next.entities.timezone || "Asia/Bangkok";
    next.missingFields = next.missingFields.filter((field) => field !== "dueTime" && field !== "time");
    next.normalizedSummary = `${next.normalizedSummary} เวลา ${time} น.`;
  }

  if (time && next.intent === "create_reminder") {
    next.reminders = [
      {
        type: "absolute",
        offsetMinutes: null,
        notifyAt: null,
        channels: ["screen", "voice"],
      },
    ];
    next.missingFields = next.missingFields.filter((field) => field !== "notifyAt" && field !== "time");
  }

  return next;
}

export function resolvePendingAction(pending: PendingAction, userText: string): PendingMergeResult {
  if (isCancelText(userText)) {
    return {
      status: "cancelled",
      safeMessage: "ยกเลิกคำสั่งที่รออยู่แล้วครับ",
    };
  }

  if (isConfirmationText(userText)) {
    return {
      status: "merged",
      intent: {
        ...pending.intent,
        confidence: Math.max(pending.intent.confidence, 0.95),
        requiresConfirmation: false,
        ambiguities: [],
      },
      confirmed: true,
      sourceText: `${pending.sourceText}\nยืนยัน: ${userText}`,
    };
  }

  const merged = mergeMissingFields(pending.intent, userText);
  if (JSON.stringify(merged) !== JSON.stringify(pending.intent)) {
    return {
      status: "merged",
      intent: merged,
      confirmed: false,
      sourceText: `${pending.sourceText}\nเพิ่มเติม: ${userText}`,
    };
  }

  return { status: "no_match" };
}
