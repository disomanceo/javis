import { NextResponse } from "next/server";
import { addKnowledge, listKnowledge } from "@/lib/knowledge";

export const runtime = "nodejs";

export async function GET() {
  try {
    const items = await listKnowledge();
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Cannot load knowledge." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    const tags = Array.isArray(body.tags)
      ? body.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean)
      : [];

    if (!title || !content) {
      return NextResponse.json({ message: "Title and content are required." }, { status: 400 });
    }

    const item = await addKnowledge({ title, content, tags });
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Cannot save knowledge." },
      { status: 500 },
    );
  }
}
