import { z } from "zod";
import { ASSISTANT_ACTIONS, ASSISTANT_INTENTS } from "@/lib/intent/types";

const nullableString = z.string().trim().min(1).nullable();

export const reminderIntentSchema = z.object({
  type: z.enum(["absolute", "relative"]),
  offsetMinutes: z.number().int().min(0).max(525600).nullable(),
  notifyAt: nullableString,
  channels: z.array(z.enum(["screen", "voice", "telegram"])).default(["screen", "voice"]),
});

export const intentEntitiesSchema = z.object({
  title: nullableString,
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  timezone: z.literal("Asia/Bangkok").nullable(),
  location: nullableString,
  participants: z.array(z.string().trim().min(1)).default([]),
  description: nullableString,
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  recurrence: nullableString,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  memoryType: z.enum(["fact", "preference", "responsibility", "note"]).nullable(),
  subject: nullableString,
  fact: nullableString,
  inferredTime: z.boolean().default(false),
  inferredTimeLabel: nullableString,
});

export const assistantIntentSchema = z.object({
  schemaVersion: z.literal("1.0"),
  requestId: z.string().trim().min(1),
  intent: z.enum(ASSISTANT_INTENTS),
  action: z.enum(ASSISTANT_ACTIONS),
  shouldSave: z.boolean(),
  shouldNotify: z.boolean(),
  confidence: z.number().min(0).max(1),
  requiresConfirmation: z.boolean(),
  entities: intentEntitiesSchema,
  reminders: z.array(reminderIntentSchema).default([]),
  missingFields: z.array(z.string().trim().min(1)).default([]),
  ambiguities: z.array(z.string().trim().min(1)).default([]),
  fieldConfidence: z.record(z.string(), z.number().min(0).max(1)).default({}),
  normalizedSummary: z.string().trim().min(1),
});

export function parseAssistantIntent(value: unknown) {
  return assistantIntentSchema.safeParse(value);
}
