import type { z } from "zod";
import type { assistantIntentSchema } from "@/lib/intent/schema";

export const ASSISTANT_INTENTS = [
  "create_event",
  "create_task",
  "create_reminder",
  "save_memory",
  "query_schedule",
  "query_tasks",
  "query_memory",
  "update_event",
  "update_task",
  "cancel_event",
  "cancel_reminder",
  "complete_task",
  "complete_reminder",
  "snooze_reminder",
  "create_recurring_event",
  "general_chat",
  "unknown",
] as const;

export const ASSISTANT_ACTIONS = ["create", "query", "update", "cancel", "complete", "snooze", "none"] as const;

export type AssistantIntentName = (typeof ASSISTANT_INTENTS)[number];
export type AssistantAction = (typeof ASSISTANT_ACTIONS)[number];
export type AssistantIntent = z.infer<typeof assistantIntentSchema>;

export type TrustedUserContext = {
  id: string;
  displayName: string;
  role: "director" | "admin" | "teacher" | "personal_user";
};

export type IntentRequestContext = {
  requestId: string;
  sessionId: string;
  utteranceId: string;
  user: TrustedUserContext;
  allowedActions: AssistantAction[];
  recentContext: Array<{
    entityType: "event" | "task" | "reminder" | "memory";
    id: string;
    title: string;
    summary?: string;
  }>;
};
