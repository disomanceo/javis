import crypto from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { AssistantIntent, IntentRequestContext } from "@/lib/intent/types";
import { evaluateAssistantPolicy, type PolicyDecision } from "@/lib/policy/assistantPolicy";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { buildFailureMessage, buildSuccessMessage, type ServiceFailureCode, type ServiceSuccessCode } from "@/lib/services/responseBuilder";

export type AssistantServiceResult =
  | {
      success: true;
      operation: AssistantIntent["intent"];
      recordId: string;
      entityType: "event" | "task" | "reminder" | "memory";
      record: Record<string, unknown>;
      safeMessage: string;
      warnings: string[];
    }
  | {
      success: false;
      operation: AssistantIntent["intent"];
      errorCode: ServiceFailureCode | PolicyDecision["reasonCode"];
      safeMessage: string;
      retryable: boolean;
      duplicate?: Record<string, unknown>;
      warnings: string[];
    };

function normalizeKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export function buildIdempotencyKey(input: { userId: string; intent: AssistantIntent; sourceText: string }) {
  return crypto
    .createHash("sha256")
    .update([input.userId, input.intent.intent, input.intent.normalizedSummary, input.sourceText].join("|"))
    .digest("hex");
}

function bangkokDateTimeToUtcIso(dateText: string | null, timeText: string | null) {
  if (!dateText || !timeText) return null;
  const [year, month, day] = dateText.split("-").map(Number);
  const [hour, minute] = timeText.split(":").map(Number);
  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute)).toISOString();
}

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

function formatBangkokDateTime(iso?: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(iso));
}

function collectionNameForIntent(intent: AssistantIntent["intent"]) {
  if (intent === "create_event") return "events";
  if (intent === "create_task") return "tasks";
  if (intent === "create_reminder") return "reminders";
  if (intent === "save_memory") return "memories";
  return null;
}

function entityTypeForIntent(intent: AssistantIntent["intent"]) {
  if (intent === "create_event") return "event";
  if (intent === "create_task") return "task";
  if (intent === "create_reminder") return "reminder";
  if (intent === "save_memory") return "memory";
  return null;
}

function successCodeForIntent(intent: AssistantIntent["intent"]): ServiceSuccessCode {
  if (intent === "create_event") return "EVENT_CREATED";
  if (intent === "create_task") return "TASK_CREATED";
  if (intent === "create_reminder") return "REMINDER_CREATED";
  return "MEMORY_SAVED";
}

function operationRecord(input: {
  intent: AssistantIntent;
  requestContext: IntentRequestContext;
  sourceText: string;
  idempotencyKey: string;
}) {
  const { intent, requestContext, sourceText, idempotencyKey } = input;
  const e = intent.entities;
  const base = {
    userId: requestContext.user.id,
    title: e.title || intent.normalizedSummary,
    titleKey: normalizeKey(e.title || intent.normalizedSummary),
    sourceText,
    idempotencyKey,
    status: "active",
    timezone: e.timezone || "Asia/Bangkok",
    createdBy: requestContext.user.id,
    updatedBy: requestContext.user.id,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (intent.intent === "create_event") {
    const startAt = bangkokDateTimeToUtcIso(e.eventDate, e.startTime);
    const endAt = bangkokDateTimeToUtcIso(e.eventDate, e.endTime);
    return {
      ...base,
      eventDate: e.eventDate,
      startTime: e.startTime,
      endTime: e.endTime,
      startAt,
      endAt,
      location: e.location,
      participants: e.participants,
      description: e.description,
      priority: e.priority,
      recurrence: e.recurrence,
    };
  }

  if (intent.intent === "create_task") {
    return {
      ...base,
      dueDate: e.dueDate,
      dueTime: e.dueTime,
      dueAt: bangkokDateTimeToUtcIso(e.dueDate, e.dueTime),
      description: e.description,
      priority: e.priority,
      assigneeIds: [],
    };
  }

  if (intent.intent === "create_reminder") {
    const reminder = intent.reminders[0];
    const notifyAt =
      reminder?.notifyAt || (reminder?.offsetMinutes !== null && reminder?.offsetMinutes !== undefined ? addMinutes(new Date().toISOString(), reminder.offsetMinutes) : null);
    return {
      ...base,
      notifyAt,
      notifyAtThai: formatBangkokDateTime(notifyAt),
      channels: reminder?.channels || ["screen", "voice"],
      retryCount: 0,
      maxRetries: 3,
      nextRetryAt: null,
      sentAt: null,
      acknowledgedAt: null,
      snoozedUntil: null,
    };
  }

  return {
    ...base,
    memoryType: e.memoryType || "note",
    subject: e.subject || e.title || intent.normalizedSummary,
    subjectKey: normalizeKey(e.subject || e.title || intent.normalizedSummary),
    fact: e.fact || e.description || intent.normalizedSummary,
    importance: e.priority === "urgent" || e.priority === "high" ? "high" : "normal",
    confidence: intent.confidence,
    sourceType: "explicit_user_statement",
    supersededBy: null,
    expiresAt: null,
  };
}

async function writeAuditLog(input: {
  requestContext: IntentRequestContext;
  intent: AssistantIntent;
  entityType?: string;
  entityId?: string;
  sourceText: string;
  modelName?: string;
  modelRequestId?: string;
  result: "success" | "failed" | "blocked" | "duplicate";
  beforeData?: unknown;
  afterData?: unknown;
}) {
  await getAdminDb().collection("auditLogs").add({
    actorUserId: input.requestContext.user.id,
    action: input.intent.intent,
    entityType: input.entityType || null,
    entityId: input.entityId || null,
    beforeData: input.beforeData || null,
    afterData: input.afterData || null,
    sourceText: input.sourceText,
    modelName: input.modelName || null,
    modelRequestId: input.modelRequestId || null,
    requestId: input.requestContext.requestId,
    result: input.result,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function findDuplicate(input: {
  requestContext: IntentRequestContext;
  intent: AssistantIntent;
  record: Record<string, unknown>;
}): Promise<(Record<string, unknown> & { id: string; exact: boolean }) | null> {
  const collectionName = collectionNameForIntent(input.intent.intent);
  if (!collectionName) return null;
  const db = getAdminDb();
  const snapshot = await db
    .collection("users")
    .doc(input.requestContext.user.id)
    .collection(collectionName)
    .where("titleKey", "==", input.record.titleKey)
    .limit(5)
    .get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.idempotencyKey === input.record.idempotencyKey) {
      return { id: doc.id, ...data, exact: true };
    }

    if (input.intent.intent === "create_event" && data.eventDate === input.record.eventDate && data.startTime === input.record.startTime) {
      return { id: doc.id, ...data, exact: false };
    }

    if (input.intent.intent === "create_task" && data.dueDate === input.record.dueDate) {
      return { id: doc.id, ...data, exact: false };
    }

    if (input.intent.intent === "create_reminder" && data.notifyAt === input.record.notifyAt) {
      return { id: doc.id, ...data, exact: false };
    }

    if (input.intent.intent === "save_memory" && data.subjectKey && data.subjectKey === input.record.subjectKey) {
      return { id: doc.id, ...data, exact: false };
    }
  }

  return null;
}

function serializeFirestoreData(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) return {};
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (value instanceof Timestamp) return [key, value.toDate().toISOString()];
      return [key, value];
    }),
  );
}

export async function commitAssistantIntent(input: {
  intent: AssistantIntent;
  requestContext: IntentRequestContext;
  sourceText: string;
  modelName?: string;
  modelRequestId?: string;
  confirmed?: boolean;
}): Promise<AssistantServiceResult> {
  const policy = evaluateAssistantPolicy(input);
  if (policy.status !== "allow" && !(input.confirmed && policy.reasonCode === "CONFIRMATION_REQUIRED")) {
    await writeAuditLog({
      requestContext: input.requestContext,
      intent: input.intent,
      sourceText: input.sourceText,
      modelName: input.modelName,
      modelRequestId: input.modelRequestId,
      result: "blocked",
      afterData: { policy },
    }).catch(() => undefined);

    return {
      success: false,
      operation: input.intent.intent,
      errorCode: policy.reasonCode,
      safeMessage: policy.safeMessage,
      retryable: false,
      warnings: policy.warnings,
    };
  }

  const collectionName = collectionNameForIntent(input.intent.intent);
  const entityType = entityTypeForIntent(input.intent.intent);
  if (!collectionName || !entityType) {
    return {
      success: false,
      operation: input.intent.intent,
      errorCode: "UNSUPPORTED_OPERATION",
      safeMessage: buildFailureMessage("UNSUPPORTED_OPERATION"),
      retryable: false,
      warnings: [],
    };
  }

  const idempotencyKey = buildIdempotencyKey({
    userId: input.requestContext.user.id,
    intent: input.intent,
    sourceText: input.sourceText,
  });
  const record = operationRecord({ ...input, idempotencyKey });

  try {
    const duplicate = await findDuplicate({ requestContext: input.requestContext, intent: input.intent, record });
    if (duplicate) {
      await writeAuditLog({
        requestContext: input.requestContext,
        intent: input.intent,
        entityType,
        entityId: String(duplicate.id),
        sourceText: input.sourceText,
        modelName: input.modelName,
        modelRequestId: input.modelRequestId,
        result: "duplicate",
        afterData: duplicate,
      });

      if (duplicate.exact) {
        return {
          success: true,
          operation: input.intent.intent,
          recordId: String(duplicate.id),
          entityType,
          record: duplicate,
          safeMessage: buildSuccessMessage({
            code: successCodeForIntent(input.intent.intent),
            record: duplicate,
            intent: input.intent,
          }),
          warnings: ["IDEMPOTENT_REPLAY"],
        };
      }

      return {
        success: false,
        operation: input.intent.intent,
        errorCode: "POSSIBLE_DUPLICATE",
        safeMessage: buildFailureMessage("POSSIBLE_DUPLICATE", `พบรายการคล้ายกันอยู่แล้วครับ: ${String(duplicate.title || "")}\nต้องการแก้รายการเดิมหรือสร้างเพิ่มครับ`),
        retryable: false,
        duplicate,
        warnings: ["POSSIBLE_DUPLICATE"],
      };
    }

    const db = getAdminDb();
    const collection = db.collection("users").doc(input.requestContext.user.id).collection(collectionName);
    const doc = collection.doc();
    const data = { id: doc.id, ...record };

    await doc.set(data);
    const saved = await doc.get();
    if (!saved.exists) {
      throw new Error("Read-after-write failed.");
    }

    const savedRecord: Record<string, unknown> = { id: saved.id, ...serializeFirestoreData(saved.data()) };

    if (input.intent.intent === "create_event" && input.intent.reminders.length && savedRecord.startAt) {
      const reminderCollection = db.collection("users").doc(input.requestContext.user.id).collection("reminders");
      const reminderDocs = [];
      for (const reminder of input.intent.reminders) {
        const reminderDoc = reminderCollection.doc();
        const notifyAt = reminder.notifyAt || (reminder.offsetMinutes !== null ? addMinutes(String(savedRecord.startAt), -reminder.offsetMinutes) : null);
        await reminderDoc.set({
          id: reminderDoc.id,
          userId: input.requestContext.user.id,
          eventId: saved.id,
          taskId: null,
          title: String(savedRecord.title),
          titleKey: normalizeKey(String(savedRecord.title)),
          notifyAt,
          notifyAtThai: formatBangkokDateTime(notifyAt),
          timezone: savedRecord.timezone || "Asia/Bangkok",
          channels: reminder.channels,
          status: "pending",
          retryCount: 0,
          maxRetries: 3,
          nextRetryAt: null,
          sentAt: null,
          acknowledgedAt: null,
          snoozedUntil: null,
          sourceText: input.sourceText,
          idempotencyKey: `${idempotencyKey}:reminder:${reminderDoc.id}`,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        reminderDocs.push(reminderDoc.id);
      }
      savedRecord.reminderIds = reminderDocs;
      savedRecord.reminderSummary = `ตั้งเตือน ${reminderDocs.length} รายการแล้ว`;
    }

    await writeAuditLog({
      requestContext: input.requestContext,
      intent: input.intent,
      entityType,
      entityId: saved.id,
      sourceText: input.sourceText,
      modelName: input.modelName,
      modelRequestId: input.modelRequestId,
      result: "success",
      afterData: savedRecord,
    });

    return {
      success: true,
      operation: input.intent.intent,
      recordId: saved.id,
      entityType,
      record: savedRecord,
      safeMessage: buildSuccessMessage({
        code: successCodeForIntent(input.intent.intent),
        record: savedRecord,
        intent: input.intent,
      }),
      warnings: policy.warnings,
    };
  } catch {
    await writeAuditLog({
      requestContext: input.requestContext,
      intent: input.intent,
      entityType,
      sourceText: input.sourceText,
      modelName: input.modelName,
      modelRequestId: input.modelRequestId,
      result: "failed",
      afterData: { idempotencyKey },
    }).catch(() => undefined);

    return {
      success: false,
      operation: input.intent.intent,
      errorCode: "DATABASE_WRITE_FAILED",
      safeMessage: buildFailureMessage("DATABASE_WRITE_FAILED"),
      retryable: true,
      warnings: [],
    };
  }
}
