import { NextResponse } from "next/server";

export const runtime = "nodejs";

function wavFromPcm(pcm: Buffer, sampleRate = 24000, channels = 1, bitDepth = 16) {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function audioPrompt(text: string) {
  return [
    "Read this in Thai as Jarvis: calm, confident, polished, lightly futuristic, respectful to the director.",
    "Keep pacing natural and clear. Do not add extra words.",
    "",
    text,
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ message: "Gemini API key is not configured." }, { status: 500 });
    }

    const body = await request.json();
    const text = String(body.text || "").trim().slice(0, 4000);
    if (!text) {
      return NextResponse.json({ message: "Missing text." }, { status: 400 });
    }

    const model = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
    const voice = process.env.GEMINI_TTS_VOICE || "Kore";
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        model,
        input: audioPrompt(text),
        response_format: { type: "audio" },
        generation_config: {
          speech_config: [{ voice }],
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { message: data.error?.message || "Gemini TTS request failed." },
        { status: response.status },
      );
    }

    const audioData = data.output_audio?.data;
    if (!audioData || typeof audioData !== "string") {
      return NextResponse.json({ message: "Gemini did not return audio." }, { status: 502 });
    }

    const pcm = Buffer.from(audioData, "base64");
    const wav = wavFromPcm(pcm);

    return NextResponse.json({
      audio: `data:audio/wav;base64,${wav.toString("base64")}`,
      model,
      voice,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "TTS server error." },
      { status: 500 },
    );
  }
}
