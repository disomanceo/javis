import { describe, expect, it } from "vitest";
import { normalizeIntentDatesFromSource } from "@/lib/intent/normalizeIntent";
import type { AssistantIntent } from "@/lib/intent/types";

function baseIntent(overrides: Partial<AssistantIntent> = {}): AssistantIntent {
  return {
    schemaVersion: "1.0",
    requestId: "test-request",
    intent: "create_event",
    action: "create",
    shouldSave: true,
    shouldNotify: false,
    confidence: 0.95,
    requiresConfirmation: false,
    entities: {
      title: "แห่เทียน เรี่ยไรเงิน",
      eventDate: "2026-07-25",
      startTime: "09:00",
      endTime: null,
      timezone: "Asia/Bangkok",
      location: null,
      participants: [],
      description: null,
      priority: "normal",
      recurrence: null,
      dueDate: null,
      dueTime: null,
      memoryType: null,
      subject: null,
      fact: null,
      inferredTime: false,
      inferredTimeLabel: null,
    },
    reminders: [],
    missingFields: [],
    ambiguities: [],
    fieldConfidence: {},
    normalizedSummary: "บันทึกนัดแห่เทียน เรี่ยไรเงิน",
    ...overrides,
  };
}

describe("normalizeIntentDatesFromSource", () => {
  it("overrides a model date with the explicit Thai date in user text", () => {
    const normalized = normalizeIntentDatesFromSource({
      intent: baseIntent(),
      sourceText: "วันศุกร์ที่ 24 ก.ค. 69 แห่เทียน เรี่ยไรเงิน 9 โมง",
      now: new Date("2026-07-19T05:00:00.000Z"),
    });

    expect(normalized.entities.eventDate).toBe("2026-07-24");
    expect(normalized.fieldConfidence.eventDate).toBe(1);
    expect(normalized.ambiguities).toEqual([]);
  });

  it("sets query_schedule date from relative Thai date", () => {
    const normalized = normalizeIntentDatesFromSource({
      intent: baseIntent({
        intent: "query_schedule",
        action: "query",
        shouldSave: false,
        entities: { ...baseIntent().entities, eventDate: null, startTime: null },
      }),
      sourceText: "พรุ่งนี้มีอะไร",
      now: new Date("2026-07-19T05:00:00.000Z"),
    });

    expect(normalized.entities.eventDate).toBe("2026-07-20");
  });
});
