import { NextResponse } from "next/server";
import { claudeModel, getClaude } from "@/lib/claude";
import { addKnowledge, searchKnowledge } from "@/lib/knowledge";

export const runtime = "nodejs";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

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

  const hasDateSignal = /วันนี้|พรุ่งนี้|มะรืน|วันจันทร์|วันอังคาร|วันพุธ|วันพฤหัส|วันศุกร์|วันเสาร์|วันอาทิตย์|\d{1,2}\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)/i.test(trimmed);
  const hasEventSignal = /ต้อง|ไป|นัด|ประชุม|อบรม|สัมมนา|ฟังพระสวด|สอบ|ส่งงาน|เตือน|กำหนดการ|กิจกรรม|นักเรียน/.test(trimmed);
  if (!hasDateSignal || !hasEventSignal) return null;

  const dateText = extractEventDate(trimmed) || "ยังไม่ระบุวันที่แน่ชัด";
  const title = trimmed.length > 70 ? `${trimmed.slice(0, 67)}...` : trimmed;
  return {
    title,
    content: [`ประเภท: เหตุการณ์/นัดหมาย`, `วันที่: ${dateText}`, `รายละเอียด: ${trimmed}`].join("\n"),
    dateText,
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

    if (shouldUseDirectorGreeting(lastUserMessage.content)) {
      return NextResponse.json({
        text: "มีอะไรให้ผมรับใช้ครับ ผอ.",
        contextCount: 0,
        usage: null,
      });
    }

    const memoryContent = memoryRequest(lastUserMessage.content);
    if (memoryContent) {
      const title = memoryContent.length > 60 ? `${memoryContent.slice(0, 57)}...` : memoryContent;
      const item = await addKnowledge({
        title,
        content: memoryContent,
        tags: ["chat-memory"],
      });

      return NextResponse.json({
        text: `บันทึกให้แล้วครับ ผอ.\nหัวข้อ: ${item.title}`,
        contextCount: 0,
        usage: null,
        savedKnowledge: item,
      });
    }

    const event = eventMemory(lastUserMessage.content);
    if (event) {
      const item = await addKnowledge({
        title: event.title,
        content: event.content,
        tags: ["chat-memory", "event", "schedule"],
      });

      return NextResponse.json({
        text: `ผมวิเคราะห์ว่าเป็นเหตุการณ์/นัดหมาย และบันทึกให้แล้วครับ ผอ.\nวันที่: ${event.dateText}\nหัวข้อ: ${item.title}`,
        contextCount: 0,
        usage: null,
        savedKnowledge: item,
      });
    }

    const context = await searchKnowledge(lastUserMessage.content);
    const contextText = context.length
      ? context.map((item, index) => `ข้อมูล ${index + 1}: ${item.title}\n${item.content}`).join("\n\n")
      : "ยังไม่พบข้อมูลที่เกี่ยวข้องใน Firebase";

    const response = await getClaude().messages.create({
      model: claudeModel(),
      max_tokens: 900,
      system:
        "You are Jarvis, a Thai-speaking personal assistant. Use the Firebase knowledge context when relevant. If the context does not contain the answer, say so briefly and answer from general knowledge. Keep replies conversational and concise.",
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
