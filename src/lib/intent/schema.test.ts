import { describe, expect, it } from "vitest";
import { buildIntentAnalyzerUserPrompt, INTENT_ANALYZER_SYSTEM_PROMPT } from "@/lib/intent/prompt";
import { parseAssistantIntent } from "@/lib/intent/schema";
import { buildLocalRequestContext } from "@/lib/intent/analyzer";
import { getBangkokDateTimeContext, normalizeThaiYear } from "@/lib/time/thaiDateTime";

function validIntent(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0",
    requestId: "req_test",
    intent: "create_event",
    action: "create",
    shouldSave: true,
    shouldNotify: true,
    confidence: 0.96,
    requiresConfirmation: false,
    entities: {
      title: "ประชุมครู",
      eventDate: "2026-07-20",
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
    reminders: [
      {
        type: "relative",
        offsetMinutes: 60,
        notifyAt: null,
        channels: ["screen", "voice"],
      },
    ],
    missingFields: [],
    ambiguities: [],
    fieldConfidence: {
      intent: 0.98,
      title: 0.96,
      date: 0.91,
      time: 0.9,
    },
    normalizedSummary: "ประชุมครู วันที่ 20 กรกฎาคม 2569 เวลา 09:00 น.",
    ...overrides,
  };
}

describe("assistant intent schema", () => {
  it("accepts a structured create_event intent", () => {
    const result = parseAssistantIntent(validIntent());
    expect(result.success).toBe(true);
  });

  it("rejects invalid date formats before anything can be saved", () => {
    const result = parseAssistantIntent(
      validIntent({
        entities: {
          ...validIntent().entities,
          eventDate: "20/07/2026",
        },
      }),
    );

    expect(result.success).toBe(false);
  });

  it("supports general_chat without saving", () => {
    const result = parseAssistantIntent(
      validIntent({
        intent: "general_chat",
        action: "none",
        shouldSave: false,
        shouldNotify: false,
        confidence: 0.9,
        normalizedSummary: "ผู้ใช้ทักทายทั่วไป",
      }),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shouldSave).toBe(false);
    }
  });
});

describe("Thai date context", () => {
  it("normalizes Thai Buddhist and short years", () => {
    expect(normalizeThaiYear("2569")).toBe(2026);
    expect(normalizeThaiYear("69")).toBe(2026);
    expect(normalizeThaiYear("2026")).toBe(2026);
  });

  it("builds a Bangkok trusted time context", () => {
    const context = getBangkokDateTimeContext(new Date("2026-07-19T10:00:00.000Z"));
    expect(context.timezone).toBe("Asia/Bangkok");
    expect(context.locale).toBe("th-TH");
    expect(context.calendarSystem).toBe("buddhist-and-gregorian");
  });
});

describe("intent analyzer prompt", () => {
  it("forbids save claims and includes trusted context", () => {
    const prompt = buildIntentAnalyzerUserPrompt({
      utterance: "พรุ่งนี้เก้าโมงประชุมครู",
      dateTime: getBangkokDateTimeContext(new Date("2026-07-19T10:00:00.000Z")),
      requestContext: buildLocalRequestContext({ requestId: "req_test", utteranceId: "utt_test" }),
    });

    expect(INTENT_ANALYZER_SYSTEM_PROMPT).toContain("Never claim that data has been saved");
    expect(prompt).toContain("Asia/Bangkok");
    expect(prompt).toContain("req_test");
    expect(prompt).toContain("พรุ่งนี้เก้าโมงประชุมครู");
  });
});
