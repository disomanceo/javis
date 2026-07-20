import { NextResponse } from "next/server";
import { claudeModel, getClaude } from "@/lib/claude";
import {
  closePendingAction,
  createPendingAction,
  findLatestPendingAction,
  resolvePendingAction,
  updatePendingAction,
} from "@/lib/conversation/pendingActions";
import { analyzeThaiIntent, buildLocalRequestContext } from "@/lib/intent/analyzer";
import { normalizeIntentDatesFromSource } from "@/lib/intent/normalizeIntent";
import { addKnowledge, searchKnowledge } from "@/lib/knowledge";
import { commitAssistantIntent } from "@/lib/services/assistantService";
import { querySchedule } from "@/lib/services/scheduleQueryService";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { formatThaiDateKey, resolveThaiDateFromText } from "@/lib/time/thaiDateTime";

export const runtime = "nodejs";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

type EventMemory = {
  title: string;
  content: string;
  dateText: string;
  eventDate: string | null;
};

const STRUCTURED_MUTATION_INTENTS = new Set([
  "create_event",
  "create_task",
  "create_reminder",
  "save_memory",
  "update_event",
  "update_task",
  "cancel_event",
  "cancel_reminder",
  "complete_task",
  "complete_reminder",
  "snooze_reminder",
  "create_recurring_event",
]);

const STRUCTURED_QUERY_INTENTS = new Set(["query_schedule"]);

function normalizeMessages(messages: unknown): IncomingMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message): message is IncomingMessage => {
      return (
        typeof message === "object" &&
        message !== null &&
        ("role" in message && (message.role === "user" || message.role === "assistant")) &&
        ("content" in message && typeof message.content === "string")
      );
    })
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 8000),
    }))
    .slice(-20);
}

function shouldUseDirectorGreeting(content: string) {
  const normalized = content.trim().toLowerCase();
  return normalized === "สวัสดี" || normalized.startsWith("สวัสดี ");
}

function memoryRequest(content: string) {
  const trimmed = content.trim();
  const patterns = [
    /^จำไว้ว่า\s*(.+)$/i,
    /^จำว่า\s*(.+)$/i,
    /^ช่วยจำว่า\s*(.+)$/i,
    /^บันทึกว่า\s*(.+)$/i,
    /^บันทึกข้อมูลว่า\s*(.+)$/i,
    /^ให้\s*(?:jarvis|javis)\s*จำว่า\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return null;
}

function youtubeRequest(content: string) {
  const trimmed = content.trim();
  const patterns = [
    /^(?:เปิด|เล่น)\s*(?:เพลง\s*)?(?:youtube|ยูทูบ)?\s*[:\-–—]?\s*(.+)$/i,
    /^(?:เปิด|เล่น)\s*(.+?)\s*(?:ใน\s*)?(?:youtube|ยูทูบ)$/i,
    /^(?:ค้นหา|search)\s*(?:เพลง\s*)?(.+)\s*(?:ใน\s*)?(?:youtube|ยูทูบ)?$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return null;
}

const THAI_MONTHS: Record<string, number> = {
  "ม.ค.": 1,
  "มกราคม": 1,
  "ก.พ.": 2,
  "กุมภาพันธ์": 2,
  "มี.ค.": 3,
  "มีนาคม": 3,
  "เม.ย.": 4,
  "เมษายน": 4,
  "พ.ค.": 5,
  "พฤษภาคม": 5,
  "มิ.ย.": 6,
  "มิถุนายน": 6,
  "ก.ค.": 7,
  "กรกฎาคม": 7,
  "ส.ค.": 8,
  "สิงหาคม": 8,
  "ก.ย.": 9,
  "กันยายน": 9,
  "ต.ค.": 10,
  "ตุลาคม": 10,
  "พ.ย.": 11,
  "พฤศจิกายน": 11,
  "ธ.ค.": 12,
  "ธันวาคม": 12,
};

function bangkokToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function thaiDate(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "full",
  }).format(date);
}

function normalizeThaiYear(yearText?: string) {
  if (!yearText) return undefined;
  const year = Number(yearText);
  if (!Number.isFinite(year)) return undefined;
  if (year < 100) return 2500 + year - 543;
  if (year > 2400) return year - 543;
  return year;
}

function extractEventDate(content: string) {
  const today = bangkokToday();
  if (/พรุ่งนี้/.test(content)) return thaiDate(addDays(today, 1));
  if (/มะรืน/.test(content)) return thaiDate(addDays(today, 2));
  if (/วันนี้/.test(content)) return thaiDate(today);
  if (/ต้นเดือน/.test(content)) return "ต้นเดือน (ยังไม่ระบุวันที่แน่ชัด)";
  if (/กลางเดือน/.test(content)) return "กลางเดือน (ยังไม่ระบุวันที่แน่ชัด)";
  if (/ปลายเดือน/.test(content)) return "ปลายเดือน (ยังไม่ระบุวันที่แน่ชัด)";
  if (/เดือนหน้า/.test(content)) return "เดือนหน้า (ยังไม่ระบุวันที่แน่ชัด)";
  if (/สัปดาห์หน้า|อาทิตย์หน้า/.test(content)) return "สัปดาห์หน้า (ยังไม่ระบุวันที่แน่ชัด)";

  const monthNames = Object.keys(THAI_MONTHS)
    .sort((a, b) => b.length - a.length)
    .map((month) => month.replace(".", "\\."))
    .join("|");
  const dateMatch = content.match(new RegExp(`(?:วัน\\S+\\s*)?(?:ที่\\s*)?(\\d{1,2})\\s*(${monthNames})\\s*(\\d{2,4})?`, "i"));
  if (!dateMatch) return undefined;

  const day = Number(dateMatch[1]);
  const month = THAI_MONTHS[dateMatch[2]];
  const year = normalizeThaiYear(dateMatch[3]) || today.getUTCFullYear();
  if (!day || !month || !year) return undefined;

  return thaiDate(new Date(Date.UTC(year, month - 1, day)));
}

function eventMemory(content: string) {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 500) return null;
  if (/[?？]$/.test(trimmed) || /ไหม|หรือเปล่า|คืออะไร|ทำอย่างไร/.test(trimmed)) return null;

  const hasDateSignal = /วันนี้|พรุ่งนี้|มะรืน|ต้นเดือน|กลางเดือน|ปลายเดือน|เดือนหน้า|สัปดาห์หน้า|อาทิตย์หน้า|วันจันทร์|วันอังคาร|วันพุธ|วันพฤหัส|วันศุกร์|วันเสาร์|วันอาทิตย์|\d{1,2}\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)/i.test(trimmed);
  const hasEventSignal = /ต้อง|ว่าจะ|ไป|นัด|ประชุม|อบรม|สัมมนา|นิเทศ|ห้องเรียน|ฟังพระสวด|สอบ|ส่งงาน|เตือน|กำหนดการ|กิจกรรม|นักเรียน/.test(trimmed);
  if (!hasDateSignal || !hasEventSignal) return null;

  const resolution = resolveThaiDateFromText(trimmed);
  const dateText = resolution ? formatThaiDateKey(resolution.dateKey) : extractEventDate(trimmed) || "ยังไม่ระบุวันที่แน่ชัด";
  const title = trimmed.length > 70 ? `${trimmed.slice(0, 67)}...` : trimmed;
  return {
    title,
    content: [`ประเภท: เหตุการณ์/นัดหมาย`, `วันที่: ${dateText}`, `รายละเอียด: ${trimmed}`].join("\n"),
    dateText,
    eventDate: resolution?.dateKey ?? null,
  };
}

function saveConfirmation(content: string) {
  const normalized = content.trim().toLowerCase();
  return /^(ใช่\s*)?(ช่วย)?บันทึก(ด้วย|เลย|ไว้|ให้หน่อย)?(ครับ|ค่ะ|คะ)?$|^จำไว้(ด้วย|เลย)?(ครับ|ค่ะ|คะ)?$|^เอาเลย(ครับ|ค่ะ|คะ)?$/.test(normalized);
}

function normalizeKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^ -\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function saveChatEvent(event: EventMemory, sourceText: string, requestContext: ReturnType<typeof buildLocalRequestContext>) {
  const db = getAdminDb();
  const doc = db.collection("users").doc(requestContext.user.id).collection("events").doc();
  const data = {
    id: doc.id,
    userId: requestContext.user.id,
    title: event.title,
    titleKey: normalizeKey(event.title),
    sourceText,
    status: "active",
    eventDate: event.eventDate,
    startTime: null,
    endTime: null,
    startAt: null,
    endAt: null,
    location: null,
    participants: [],
    description: event.content,
    priority: "normal",
    timezone: "Asia/Bangkok",
    createdBy: requestContext.user.id,
    updatedBy: requestContext.user.id,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await doc.set(data);
  return data;
}

function previousUserMessage(messages: IncomingMessage[]) {
  const users = messages.filter((message) => message.role === "user");
  return users.length >= 2 ? users[users.length - 2] : null;
}

function shouldAnalyzeWithIntentEngine(content: string) {
  return (
    /จำ|บันทึก|เตือน|นัด|ประชุม|อบรม|นิเทศ|ส่งรายงาน|งาน|วันนี้|พรุ่งนี้|มะรืน|วันจันทร์|วันอังคาร|วันพุธ|วันพฤหัส|วันศุกร์|วันเสาร์|วันอาทิตย์|เลื่อน|ยกเลิก|เสร็จแล้ว/.test(
      content,
    ) && content.trim().length <= 1000
  );
}

function shouldKeepPending(errorCode: unknown) {
  return errorCode === "MISSING_REQUIRED_FIELDS" || errorCode === "CONFIRMATION_REQUIRED";
}

async function saveChatMemory(content: string) {
  const event = eventMemory(content);
  if (event) {
    const item = await addKnowledge({
      title: event.title,
      content: event.content,
      tags: ["chat-memory", "event", "schedule"],
    });

    return {
      item,
      text: `ผมวิเคราะห์ว่าเป็นเหตุการณ์/นัดหมาย และบันทึกให้แล้วครับ ผอ.\nวันที่: ${event.dateText}\nหัวข้อ: ${item.title}`,
    };
  }

  const title = content.length > 60 ? `${content.slice(0, 57)}...` : content;
  const item = await addKnowledge({
    title,
    content,
    tags: ["chat-memory"],
  });

  return {
    item,
    text: `บันทึกให้แล้วครับ ผอ.\nหัวข้อ: ${item.title}`,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages = normalizeMessages(body.messages);
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");

    if (!lastUserMessage) {
      return NextResponse.json({ message: "Missing user message." }, { status: 400 });
    }

    const youtubeQuery = youtubeRequest(lastUserMessage.content);
    if (youtubeQuery) {
      const youtubeUrl = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(youtubeQuery)}&autoplay=1`;
      return NextResponse.json({
        text: `เปิดเพลง YouTube "${youtubeQuery}" ให้ครับ ผอ.`,
        contextCount: 0,
        usage: null,
        youtubeUrl,
        youtubeQuery,
      });
    }

    if (shouldUseDirectorGreeting(lastUserMessage.content)) {
      return NextResponse.json({
        text: "มีอะไรให้ผมรับใช้ครับ ผอ.",
        contextCount: 0,
        usage: null,
      });
    }

    const requestContext = buildLocalRequestContext();
    const pending = await findLatestPendingAction(requestContext).catch(() => null);
    if (pending) {
      const resolved = resolvePendingAction(pending, lastUserMessage.content);

      if (resolved.status === "cancelled") {
        await closePendingAction(pending.id, "cancelled").catch(() => undefined);
        return NextResponse.json({
          text: resolved.safeMessage,
          contextCount: 0,
          usage: null,
        });
      }

      if (resolved.status === "merged") {
        const normalizedIntent = normalizeIntentDatesFromSource({
          intent: resolved.intent,
          sourceText: resolved.sourceText,
        });
        const serviceResult = await commitAssistantIntent({
          intent: normalizedIntent,
          requestContext,
          sourceText: resolved.sourceText,
          modelName: pending.modelName,
          modelRequestId: pending.modelRequestId || requestContext.requestId,
          confirmed: resolved.confirmed,
        });

        if (serviceResult.success) {
          await closePendingAction(pending.id, "committed").catch(() => undefined);
        } else if (shouldKeepPending(serviceResult.errorCode)) {
          await updatePendingAction({
            id: pending.id,
            intent: normalizedIntent,
            sourceText: resolved.sourceText,
          }).catch(() => undefined);
        } else {
          await closePendingAction(pending.id, "cancelled").catch(() => undefined);
        }

        return NextResponse.json({
          text: serviceResult.safeMessage,
          contextCount: 0,
          usage: null,
          intent: normalizedIntent,
          operationResult: serviceResult,
        });
      }
    }

    if (shouldAnalyzeWithIntentEngine(lastUserMessage.content)) {
      const intentAnalysis = await analyzeThaiIntent({
        utterance: lastUserMessage.content,
        requestContext,
      });

      if (!intentAnalysis.ok) {
        return NextResponse.json({
          text: intentAnalysis.safeMessage,
          contextCount: 0,
          usage: null,
          intentError: {
            code: intentAnalysis.errorCode,
            retryable: intentAnalysis.retryable,
          },
        });
      }

      const intent = normalizeIntentDatesFromSource({
        intent: intentAnalysis.intent,
        sourceText: lastUserMessage.content,
      });
      if (STRUCTURED_MUTATION_INTENTS.has(intent.intent)) {
        const serviceResult = await commitAssistantIntent({
          intent,
          requestContext,
          sourceText: lastUserMessage.content,
          modelName: intentAnalysis.model,
          modelRequestId: requestContext.requestId,
        });

        if (!serviceResult.success && shouldKeepPending(serviceResult.errorCode)) {
          await createPendingAction({
            requestContext,
            intent,
            sourceText: lastUserMessage.content,
            modelName: intentAnalysis.model,
            modelRequestId: requestContext.requestId,
          }).catch(() => undefined);
        }

        return NextResponse.json({
          text: serviceResult.safeMessage,
          contextCount: 0,
          usage: null,
          intent,
          operationResult: serviceResult,
        });
      }

      if (STRUCTURED_QUERY_INTENTS.has(intent.intent)) {
        const serviceResult = await querySchedule({
          intent,
          requestContext,
          sourceText: lastUserMessage.content,
        });

        return NextResponse.json({
          text: serviceResult.safeMessage,
          contextCount: serviceResult.count,
          usage: null,
          intent,
          operationResult: serviceResult,
        });
      }
    }

      const memoryContent = memoryRequest(lastUserMessage.content);
    if (memoryContent) {
      const saved = await saveChatMemory(memoryContent);

      return NextResponse.json({
        text: saved.text,
        contextCount: 0,
        usage: null,
        savedKnowledge: saved.item,
      });
    }

    if (saveConfirmation(lastUserMessage.content)) {
      const previous = previousUserMessage(messages);
      if (!previous) {
        return NextResponse.json({
          text: "ได้ครับ ผอ. แต่ผมยังไม่เห็นข้อความก่อนหน้าที่จะบันทึกครับ",
          contextCount: 0,
          usage: null,
        });
      }

      const previousEvent = eventMemory(previous.content.trim());
      if (previousEvent?.eventDate) {
        const savedEvent = await saveChatEvent(previousEvent, previous.content.trim(), requestContext);
        return NextResponse.json({
          text: `ผมวิเคราะห์ว่าเป็นเหตุการณ์/นัดหมาย และบันทึกให้แล้วครับ ผอ.\nวันที่: ${previousEvent.dateText}\nหัวข้อ: ${savedEvent.title}`,
          contextCount: 0,
          usage: null,
          operationResult: {
            success: true,
            operation: "create_event",
            recordId: savedEvent.id,
            entityType: "event",
            record: savedEvent,
            safeMessage: "บันทึกแล้วครับ",
            warnings: [],
          },
        });
      }

      const saved = await saveChatMemory(previous.content.trim());

      return NextResponse.json({
        text: saved.text,
        contextCount: 0,
        usage: null,
        savedKnowledge: saved.item,
      });
    }

    const event = eventMemory(lastUserMessage.content);
    if (event) {
      if (event.eventDate) {
        const savedEvent = await saveChatEvent(event, lastUserMessage.content.trim(), requestContext);
        return NextResponse.json({
          text: `ผมวิเคราะห์ว่าเป็นเหตุการณ์/นัดหมาย และบันทึกให้แล้วครับ ผอ.\nวันที่: ${event.dateText}\nหัวข้อ: ${savedEvent.title}`,
          contextCount: 0,
          usage: null,
          operationResult: {
            success: true,
            operation: "create_event",
            recordId: savedEvent.id,
            entityType: "event",
            record: savedEvent,
            safeMessage: "บันทึกแล้วครับ",
            warnings: [],
          },
        });
      }

      const saved = await saveChatMemory(lastUserMessage.content.trim());
      return NextResponse.json({
        text: saved.text,
        contextCount: 0,
        usage: null,
        savedKnowledge: saved.item,
      });
    }

    const context = await searchKnowledge(lastUserMessage.content);
    const contextText = context.length
      ? context
          .map((item, index) => `ข้อมูล ${index + 1}: ${item.title}\n${item.sentence || item.content}`)
          .join("\n\n")
      : "ยังไม่พบข้อมูลที่เกี่ยวข้องใน Firebase";

    const response = await getClaude().messages.create({
      model: claudeModel(),
      max_tokens: 900,
      system:
        "You are Jarvis, a Thai-speaking personal assistant. Use the Firebase knowledge context only when it is directly relevant to the user's question. If the context does not contain the answer, answer briefly from general knowledge. Do not guess or invent details from unrelated context. Keep replies conversational and concise.",
      messages: [
        ...messages.slice(0, -1),
        {
          role: "user",
          content: `บริบทจาก Firebase:\n${contextText}\n\nคำถามผู้ใช้:\n${lastUserMessage.content}`,
        },
      ],
    });

    const text = response.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();

    return NextResponse.json({
      text,
      contextCount: context.length,
      usage: response.usage,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Jarvis server error." },
      { status: 500 },
    );
  }
}
