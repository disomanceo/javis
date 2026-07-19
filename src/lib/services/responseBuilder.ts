import type { AssistantIntent } from "@/lib/intent/types";

export type ServiceSuccessCode = "EVENT_CREATED" | "TASK_CREATED" | "REMINDER_CREATED" | "MEMORY_SAVED";
export type ServiceFailureCode =
  | "VALIDATION_FAILED"
  | "DATABASE_WRITE_FAILED"
  | "POSSIBLE_DUPLICATE"
  | "POLICY_BLOCKED"
  | "UNSUPPORTED_OPERATION";

function formatThaiDateTime(dateText?: string | null, timeText?: string | null) {
  const parts = [];
  if (dateText) parts.push(`วันที่ ${dateText}`);
  if (timeText) parts.push(`เวลา ${timeText} น.`);
  return parts.join(" ");
}

export function buildSuccessMessage(input: {
  code: ServiceSuccessCode;
  record: Record<string, unknown>;
  intent: AssistantIntent;
}) {
  const title = String(input.record.title || input.intent.entities.title || input.intent.normalizedSummary);

  if (input.code === "EVENT_CREATED") {
    return [
      `บันทึกแล้วครับ ${title}`,
      formatThaiDateTime(String(input.record.eventDate || ""), String(input.record.startTime || "")),
      input.record.reminderSummary ? String(input.record.reminderSummary) : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (input.code === "TASK_CREATED") {
    const due = formatThaiDateTime(String(input.record.dueDate || ""), String(input.record.dueTime || ""));
    return [`บันทึกงานแล้วครับ ${title}`, due].filter(Boolean).join("\n");
  }

  if (input.code === "REMINDER_CREATED") {
    return [`ตั้งเตือนแล้วครับ ${title}`, String(input.record.notifyAtThai || input.record.notifyAt || "")].filter(Boolean).join("\n");
  }

  return `จำไว้แล้วครับ ${title}`;
}

export function buildFailureMessage(code: ServiceFailureCode, fallback?: string) {
  if (code === "DATABASE_WRITE_FAILED") return "ยังบันทึกไม่สำเร็จครับ ระบบฐานข้อมูลมีปัญหา";
  if (code === "POSSIBLE_DUPLICATE") return fallback || "พบรายการคล้ายกันอยู่แล้วครับ ต้องการแก้รายการเดิมหรือสร้างเพิ่มครับ";
  if (code === "VALIDATION_FAILED") return fallback || "ข้อมูลยังไม่ครบหรือไม่ถูกต้องครับ ยังไม่บันทึก";
  if (code === "POLICY_BLOCKED") return fallback || "ยังไม่สามารถดำเนินการคำสั่งนี้ได้ครับ";
  return fallback || "คำสั่งนี้ยังไม่รองรับครับ";
}
