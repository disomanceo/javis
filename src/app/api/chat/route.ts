import { NextResponse } from "next/server";
import { claudeModel, getClaude } from "@/lib/claude";
import { searchKnowledge } from "@/lib/knowledge";

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

function directorGreeting(content: string) {
  const normalized = content.trim().toLowerCase();
  return normalized === "สวัสดี" || normalized.startsWith("สวัสดี ");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages = normalizeMessages(body.messages);
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");

    if (!lastUserMessage) {
      return NextResponse.json({ message: "Missing user message." }, { status: 400 });
    }

    if (directorGreeting(lastUserMessage.content)) {
      return NextResponse.json({
        text: "มีอะไรให้ผมรับใช้ครับ ผอ.",
        contextCount: 0,
        usage: null,
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
