import type { AssistantIntent, IntentRequestContext } from "@/lib/intent/types";

export type PolicyDecision =
  | {
      status: "allow";
      reasonCode: "POLICY_ALLOWED";
      safeMessage?: string;
      warnings: string[];
    }
  | {
      status: "clarify" | "confirm" | "reject";
      reasonCode:
        | "GENERAL_CHAT"
        | "UNKNOWN_INTENT"
        | "HYPOTHETICAL_STATEMENT"
        | "MISSING_REQUIRED_FIELDS"
        | "LOW_CONFIDENCE"
        | "CONFIRMATION_REQUIRED"
        | "UNSUPPORTED_PHASE_C_INTENT"
        | "ACTION_NOT_ALLOWED";
      safeMessage: string;
      warnings: string[];
    };

const PHASE_C_CREATE_INTENTS = new Set(["create_event", "create_task", "create_reminder", "save_memory"]);
const CONFIRMATION_INTENTS = new Set([
  "update_event",
  "update_task",
  "cancel_event",
  "cancel_reminder",
  "complete_task",
  "complete_reminder",
  "snooze_reminder",
  "create_recurring_event",
]);

function hasHypotheticalSignal(sourceText: string) {
  return /ถ้า|สมมุติ|ตัวอย่าง|เช่นว่า|ลองนึกว่า|ระบบจะจำไหม/.test(sourceText);
}

function requiredFields(intent: AssistantIntent) {
  const entities = intent.entities;
  if (intent.intent === "create_event") {
    const missing = [];
    if (!entities.title) missing.push("title");
    if (!entities.eventDate) missing.push("eventDate");
    if (!entities.startTime) missing.push("startTime");
    return missing;
  }

  if (intent.intent === "create_task") {
    return entities.title ? [] : ["title"];
  }

  if (intent.intent === "create_reminder") {
    const missing = [];
    if (!entities.title) missing.push("title");
    if (!intent.reminders.length || (!intent.reminders[0].notifyAt && intent.reminders[0].offsetMinutes === null)) {
      missing.push("notifyAt");
    }
    return missing;
  }

  if (intent.intent === "save_memory") {
    const hasMemory = (entities.subject && entities.fact) || entities.title || entities.description;
    return hasMemory ? [] : ["subject", "fact"];
  }

  return [];
}

export function evaluateAssistantPolicy(input: {
  intent: AssistantIntent;
  requestContext: IntentRequestContext;
  sourceText: string;
}): PolicyDecision {
  const { intent, requestContext, sourceText } = input;

  if (intent.intent === "general_chat") {
    return {
      status: "reject",
      reasonCode: "GENERAL_CHAT",
      safeMessage: "นี่เป็นบทสนทนาทั่วไปครับ ผมจะไม่บันทึกเป็นข้อมูลถาวร",
      warnings: [],
    };
  }

  if (intent.intent === "unknown") {
    return {
      status: "clarify",
      reasonCode: "UNKNOWN_INTENT",
      safeMessage: "ผมยังไม่แน่ใจว่าต้องการให้ทำอะไรครับ ขอรายละเอียดเพิ่มอีกนิด",
      warnings: [],
    };
  }

  if (hasHypotheticalSignal(sourceText)) {
    return {
      status: "reject",
      reasonCode: "HYPOTHETICAL_STATEMENT",
      safeMessage: "ประโยคนี้ดูเป็นตัวอย่างหรือคำถามสมมุติครับ ผมจะไม่บันทึกเป็นรายการจริง",
      warnings: [],
    };
  }

  if (!requestContext.allowedActions.includes(intent.action)) {
    return {
      status: "reject",
      reasonCode: "ACTION_NOT_ALLOWED",
      safeMessage: "คำสั่งนี้ยังไม่ได้รับอนุญาตให้ดำเนินการครับ",
      warnings: [],
    };
  }

  const missing = [...requiredFields(intent), ...intent.missingFields];
  if (missing.length) {
    return {
      status: "clarify",
      reasonCode: "MISSING_REQUIRED_FIELDS",
      safeMessage: `ยังไม่บันทึกครับ ต้องการข้อมูลเพิ่ม: ${Array.from(new Set(missing)).join(", ")}`,
      warnings: [],
    };
  }

  if (intent.confidence < 0.5) {
    return {
      status: "reject",
      reasonCode: "LOW_CONFIDENCE",
      safeMessage: "ผมยังมั่นใจไม่พอที่จะบันทึกครับ ขอให้บอกใหม่อีกครั้ง",
      warnings: [],
    };
  }

  if (intent.confidence < 0.9 || intent.requiresConfirmation || intent.ambiguities.length) {
    return {
      status: "confirm",
      reasonCode: "CONFIRMATION_REQUIRED",
      safeMessage: `ผมเข้าใจว่า: ${intent.normalizedSummary}\nต้องการให้บันทึกตามนี้ไหมครับ`,
      warnings: intent.confidence < 0.9 ? ["LOW_CONFIDENCE_REVIEW_REQUIRED"] : [],
    };
  }

  if (CONFIRMATION_INTENTS.has(intent.intent)) {
    return {
      status: "confirm",
      reasonCode: "CONFIRMATION_REQUIRED",
      safeMessage: `คำสั่งนี้มีผลกับรายการเดิมครับ ผมเข้าใจว่า: ${intent.normalizedSummary}\nยืนยันให้ดำเนินการไหมครับ`,
      warnings: ["CONFIRM_BEFORE_MUTATION"],
    };
  }

  if (!PHASE_C_CREATE_INTENTS.has(intent.intent)) {
    return {
      status: "reject",
      reasonCode: "UNSUPPORTED_PHASE_C_INTENT",
      safeMessage: "คำสั่งประเภทนี้ยังไม่เปิดให้บันทึกใน Phase C รอบแรกครับ",
      warnings: [],
    };
  }

  return {
    status: "allow",
    reasonCode: "POLICY_ALLOWED",
    warnings: [],
  };
}
