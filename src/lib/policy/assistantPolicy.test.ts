import { describe, expect, it } from "vitest";
import { buildLocalRequestContext } from "@/lib/intent/analyzer";
import type { AssistantIntent } from "@/lib/intent/types";
import { evaluateAssistantPolicy } from "@/lib/policy/assistantPolicy";
import { buildIdempotencyKey } from "@/lib/services/assistantService";
import { buildFailureMessage, buildSuccessMessage } from "@/lib/services/responseBuilder";

function intent(overrides: Partial<AssistantIntent> = {}): AssistantIntent {
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
    fieldConfidence: { intent: 0.98 },
    normalizedSummary: "ประชุมครู วันที่ 20 กรกฎาคม 2569 เวลา 09:00 น.",
    ...overrides,
  };
}

describe("assistant policy", () => {
  it("allows complete high confidence create_event intents", () => {
    const decision = evaluateAssistantPolicy({
      intent: intent(),
      requestContext: buildLocalRequestContext(),
      sourceText: "พรุ่งนี้เก้าโมงประชุมครู",
    });

    expect(decision.status).toBe("allow");
  });

  it("allows create_event without a start time", () => {
    const decision = evaluateAssistantPolicy({
      intent: intent({
        entities: {
          ...intent().entities,
          startTime: null,
        },
      }),
      requestContext: buildLocalRequestContext(),
      sourceText: "พรุ่งนี้มีประชุมครู",
    });

    expect(decision.status).toBe("allow");
  });

  it("blocks hypothetical statements even if Claude extracts a save intent", () => {
    const decision = evaluateAssistantPolicy({
      intent: intent(),
      requestContext: buildLocalRequestContext(),
      sourceText: "ถ้าผมพูดว่าพรุ่งนี้มีประชุม ระบบจะจำไหม",
    });

    expect(decision.status).toBe("reject");
    expect(decision.reasonCode).toBe("HYPOTHETICAL_STATEMENT");
  });

  it("requires confirmation for lower confidence intents", () => {
    const decision = evaluateAssistantPolicy({
      intent: intent({ confidence: 0.82 }),
      requestContext: buildLocalRequestContext(),
      sourceText: "ต้นเดือนว่าจะนิเทศห้องเรียนหน่อย",
    });

    expect(decision.status).toBe("confirm");
  });
});

describe("assistant service helpers", () => {
  it("builds stable idempotency keys for repeated requests", () => {
    const first = buildIdempotencyKey({
      userId: "local-director",
      intent: intent(),
      sourceText: "พรุ่งนี้เก้าโมงประชุมครู",
    });
    const second = buildIdempotencyKey({
      userId: "local-director",
      intent: intent(),
      sourceText: "พรุ่งนี้เก้าโมงประชุมครู",
    });

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("builds success and failure messages from backend records", () => {
    expect(
      buildSuccessMessage({
        code: "EVENT_CREATED",
        record: { title: "ประชุมครู", eventDate: "2026-07-20", startTime: "09:00" },
        intent: intent(),
      }),
    ).toContain("บันทึกแล้วครับ");

    expect(buildFailureMessage("DATABASE_WRITE_FAILED")).not.toContain("บันทึกแล้ว");
  });
});
