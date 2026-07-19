import { describe, expect, it } from "vitest";
import type { AssistantIntent } from "@/lib/intent/types";
import type { PendingAction } from "@/lib/conversation/pendingActions";
import { isCancelText, isConfirmationText, resolvePendingAction } from "@/lib/conversation/pendingActions";

function baseIntent(overrides: Partial<AssistantIntent> = {}): AssistantIntent {
  return {
    schemaVersion: "1.0",
    requestId: "req_pending",
    intent: "create_event",
    action: "create",
    shouldSave: true,
    shouldNotify: false,
    confidence: 0.92,
    requiresConfirmation: false,
    entities: {
      title: "ประชุมครู",
      eventDate: "2026-07-20",
      startTime: null,
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
    missingFields: ["startTime"],
    ambiguities: [],
    fieldConfidence: {},
    normalizedSummary: "ประชุมครู วันที่ 20 กรกฎาคม 2569",
    ...overrides,
  };
}

function pending(intent = baseIntent()): PendingAction {
  return {
    id: "pending_1",
    userId: "local-director",
    sessionId: "local-session",
    intent,
    collectedFields: intent.entities,
    missingFields: intent.missingFields,
    ambiguities: intent.ambiguities,
    awaitingField: intent.missingFields[0] || null,
    sourceText: "พรุ่งนี้มีประชุมครู",
  };
}

describe("pending action text helpers", () => {
  it("detects confirmations", () => {
    expect(isConfirmationText("บันทึกด้วย")).toBe(true);
    expect(isConfirmationText("ยืนยันครับ")).toBe(true);
  });

  it("detects cancellation", () => {
    expect(isCancelText("ไม่ต้องบันทึก")).toBe(true);
    expect(isCancelText("เมื่อกี้พูดผิด")).toBe(true);
  });
});

describe("resolvePendingAction", () => {
  it("fills a missing Thai time from a follow-up answer", () => {
    const result = resolvePendingAction(pending(), "เก้าโมง");
    expect(result.status).toBe("merged");

    if (result.status === "merged") {
      expect(result.intent.entities.startTime).toBe("09:00");
      expect(result.intent.missingFields).not.toContain("startTime");
      expect(result.confirmed).toBe(false);
    }
  });

  it("turns confirmation into a confirmed intent", () => {
    const result = resolvePendingAction(
      pending(
        baseIntent({
          confidence: 0.82,
          requiresConfirmation: true,
          missingFields: [],
        }),
      ),
      "บันทึกด้วย",
    );

    expect(result.status).toBe("merged");
    if (result.status === "merged") {
      expect(result.confirmed).toBe(true);
      expect(result.intent.requiresConfirmation).toBe(false);
      expect(result.intent.confidence).toBeGreaterThanOrEqual(0.95);
    }
  });

  it("cancels pending work when the user says not to save", () => {
    const result = resolvePendingAction(pending(), "ไม่ต้องบันทึก");
    expect(result.status).toBe("cancelled");
  });
});
