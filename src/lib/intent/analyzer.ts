import { claudeModel, getClaude } from "@/lib/claude";
import { INTENT_ANALYZER_SYSTEM_PROMPT, buildIntentAnalyzerUserPrompt } from "@/lib/intent/prompt";
import { parseAssistantIntent } from "@/lib/intent/schema";
import type { AssistantIntent, IntentRequestContext } from "@/lib/intent/types";
import { getBangkokDateTimeContext } from "@/lib/time/thaiDateTime";

export type AnalyzeIntentResult =
  | {
      ok: true;
      intent: AssistantIntent;
      rawText: string;
      model: string;
    }
  | {
      ok: false;
      errorCode: "CLAUDE_REQUEST_FAILED" | "INVALID_JSON" | "SCHEMA_VALIDATION_FAILED";
      safeMessage: string;
      rawText?: string;
      issues?: string[];
      retryable: boolean;
    };

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export async function analyzeThaiIntent(input: {
  utterance: string;
  requestContext: IntentRequestContext;
  now?: Date;
}): Promise<AnalyzeIntentResult> {
  const dateTime = getBangkokDateTimeContext(input.now);
  const model = claudeModel();

  try {
    const response = await getClaude().messages.create({
      model,
      max_tokens: 1200,
      system: INTENT_ANALYZER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildIntentAnalyzerUserPrompt({
            utterance: input.utterance,
            dateTime,
            requestContext: input.requestContext,
          }),
        },
      ],
    });

    const rawText = response.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonObject(rawText));
    } catch {
      return {
        ok: false,
        errorCode: "INVALID_JSON",
        safeMessage: "ผมยังวิเคราะห์คำสั่งไม่สำเร็จครับ ขอให้พิมพ์ใหม่อีกครั้ง",
        rawText,
        retryable: true,
      };
    }

    const result = parseAssistantIntent(parsed);
    if (!result.success) {
      return {
        ok: false,
        errorCode: "SCHEMA_VALIDATION_FAILED",
        safeMessage: "ผมยังตรวจรูปแบบคำสั่งไม่ผ่านครับ ยังไม่บันทึกข้อมูล",
        rawText,
        issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
        retryable: false,
      };
    }

    return {
      ok: true,
      intent: result.data,
      rawText,
      model,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/api key|authentication|auth/i.test(message)) {
      return {
        ok: false,
        errorCode: "CLAUDE_REQUEST_FAILED",
        safeMessage: "ยังไม่ได้ตั้งค่า Claude API key หรือค่า API key ว่างครับ ยังไม่บันทึกข้อมูล",
        retryable: false,
      };
    }

    if (/model/i.test(message)) {
      return {
        ok: false,
        errorCode: "CLAUDE_REQUEST_FAILED",
        safeMessage: "ชื่อ Claude model ยังไม่ถูกต้องครับ ยังไม่บันทึกข้อมูล",
        retryable: false,
      };
    }

    if (/quota|credit|billing|rate limit|429/i.test(message)) {
      return {
        ok: false,
        errorCode: "CLAUDE_REQUEST_FAILED",
        safeMessage: "Claude API ติดโควต้า เครดิต หรือ rate limit ครับ ยังไม่บันทึกข้อมูล",
        retryable: true,
      };
    }

    return {
      ok: false,
      errorCode: "CLAUDE_REQUEST_FAILED",
      safeMessage: "ตอนนี้ระบบวิเคราะห์ภาษายังไม่พร้อมครับ ยังไม่บันทึกข้อมูล",
      retryable: true,
    };
  }
}

export function buildLocalRequestContext(input?: Partial<IntentRequestContext>): IntentRequestContext {
  return {
    requestId: input?.requestId || crypto.randomUUID(),
    sessionId: input?.sessionId || "local-session",
    utteranceId: input?.utteranceId || crypto.randomUUID(),
    user: input?.user || {
      id: "local-director",
      displayName: "ผอ.",
      role: "director",
    },
    allowedActions: input?.allowedActions || ["create", "query", "update", "cancel", "complete", "snooze", "none"],
    recentContext: input?.recentContext || [],
  };
}
