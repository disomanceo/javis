import type { AssistantIntent } from "@/lib/intent/types";
import { formatThaiDateKey, resolveThaiDateFromText } from "@/lib/time/thaiDateTime";

const EVENT_DATE_INTENTS = new Set([
  "create_event",
  "query_schedule",
  "update_event",
  "cancel_event",
  "create_recurring_event",
]);

const DUE_DATE_INTENTS = new Set(["create_task", "query_tasks", "update_task", "complete_task"]);

function appendUnique(values: string[], value: string) {
  return values.includes(value) ? values : [...values, value];
}

export function normalizeIntentDatesFromSource(input: {
  intent: AssistantIntent;
  sourceText: string;
  now?: Date;
}): AssistantIntent {
  const resolution = resolveThaiDateFromText(input.sourceText, input.now);
  if (!resolution) return input.intent;

  const intent: AssistantIntent = {
    ...input.intent,
    entities: { ...input.intent.entities },
    ambiguities: [...input.intent.ambiguities],
    fieldConfidence: { ...input.intent.fieldConfidence },
  };

  if (EVENT_DATE_INTENTS.has(intent.intent)) {
    intent.entities.eventDate = resolution.dateKey;
    intent.fieldConfidence.eventDate = 1;
  }

  if (DUE_DATE_INTENTS.has(intent.intent)) {
    intent.entities.dueDate = resolution.dateKey;
    intent.fieldConfidence.dueDate = 1;
  }

  if (resolution.weekdayMismatch) {
    intent.ambiguities = appendUnique(
      intent.ambiguities,
      `ผู้ใช้ระบุวัน${resolution.weekdayMismatch.mentioned} แต่วันที่ ${resolution.dateKey} ตรงกับ${resolution.weekdayMismatch.actual}`,
    );
  }

  if (resolution.source !== "explicit-date" || EVENT_DATE_INTENTS.has(intent.intent) || DUE_DATE_INTENTS.has(intent.intent)) {
    intent.normalizedSummary = `${intent.normalizedSummary} (${formatThaiDateKey(resolution.dateKey)})`;
  }

  return intent;
}
