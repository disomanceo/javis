import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GEMINI_VOICES = new Set([
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
]);

const MMS_TTS_FALLBACK_URL = "https://trademarks-side-denver-hammer.trycloudflare.com/synthesize";

function audioDataUrl(buffer: Buffer, contentType = "audio/wav") {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

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

async function synthesizeWithGemini(text: string, requestedVoice: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API key is not configured.");
  }

  const model = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
  const envVoice = process.env.GEMINI_TTS_VOICE || "Kore";
  const voice = GEMINI_VOICES.has(requestedVoice)
    ? requestedVoice
    : GEMINI_VOICES.has(envVoice)
      ? envVoice
      : "Kore";

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: audioPrompt(text) }],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice,
            },
          },
        },
      },
      model,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Gemini TTS request failed.");
  }

  const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioData || typeof audioData !== "string") {
    throw new Error("Gemini did not return audio.");
  }

  const pcm = Buffer.from(audioData, "base64");
  const wav = wavFromPcm(pcm);

  return {
    audio: audioDataUrl(wav),
    model,
    voice,
    provider: "gemini",
  };
}

async function synthesizeWithThonburian(text: string) {
  const endpoint = process.env.THONBURIAN_TTS_URL;
  if (!endpoint) {
    throw new Error("ThonburianTTS endpoint is not configured.");
  }

  const model = process.env.THONBURIAN_TTS_MODEL || "ThonburianTTS";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.THONBURIAN_TTS_API_KEY) {
    headers.Authorization = `Bearer ${process.env.THONBURIAN_TTS_API_KEY}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      input: text,
      text,
      voice: "ThonburianTTS",
      language: "th",
      response_format: "wav",
    }),
  });

  const contentType = response.headers.get("content-type") || "audio/wav";
  if (!response.ok) {
    const errorData = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
    throw new Error(errorData.message || errorData.error?.message || "ThonburianTTS request failed.");
  }

  if (contentType.startsWith("audio/")) {
    const audio = Buffer.from(await response.arrayBuffer());
    return {
      audio: audioDataUrl(audio, contentType.split(";")[0]),
      model,
      voice: "ThonburianTTS",
      provider: "thonburian",
    };
  }

  const data = await response.json().catch(() => ({}));
  const base64Audio = data.audio || data.audioContent || data.audio_base64 || data.data?.audio;
  if (!base64Audio || typeof base64Audio !== "string") {
    throw new Error("ThonburianTTS did not return audio.");
  }

  const normalizedAudio = base64Audio.startsWith("data:")
    ? base64Audio
    : `data:${data.contentType || data.content_type || "audio/wav"};base64,${base64Audio}`;

  return {
    audio: normalizedAudio,
    model,
    voice: "ThonburianTTS",
    provider: "thonburian",
  };
}

async function synthesizeWithMms(text: string) {
  const endpoint = process.env.MMS_TTS_URL || MMS_TTS_FALLBACK_URL;
  if (!endpoint) {
    throw new Error("MMS-TTS Thai endpoint is not configured. Deploy the MMS server and set MMS_TTS_URL to its /synthesize URL.");
  }

  const model = process.env.MMS_TTS_MODEL || "facebook/mms-tts-tha";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.MMS_TTS_API_KEY) {
    headers.Authorization = `Bearer ${process.env.MMS_TTS_API_KEY}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      input: text,
      text,
      voice: "MMS-TTS Thai",
      language: "th",
      response_format: "wav",
    }),
  });

  const contentType = response.headers.get("content-type") || "audio/wav";
  if (!response.ok) {
    const errorData = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
    throw new Error(errorData.message || errorData.error?.message || "MMS-TTS Thai request failed.");
  }

  if (contentType.startsWith("audio/")) {
    const audio = Buffer.from(await response.arrayBuffer());
    return {
      audio: audioDataUrl(audio, contentType.split(";")[0]),
      model,
      voice: "MMS-TTS Thai",
      provider: "mms",
    };
  }

  const data = await response.json().catch(() => ({}));
  const base64Audio = data.audio || data.audioContent || data.audio_base64 || data.data?.audio;
  if (!base64Audio || typeof base64Audio !== "string") {
    throw new Error("MMS-TTS Thai did not return audio.");
  }

  const normalizedAudio = base64Audio.startsWith("data:")
    ? base64Audio
    : `data:${data.contentType || data.content_type || "audio/wav"};base64,${base64Audio}`;

  return {
    audio: normalizedAudio,
    model,
    voice: "MMS-TTS Thai",
    provider: "mms",
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = String(body.text || "").trim().slice(0, 4000);
    if (!text) {
      return NextResponse.json({ message: "Missing text." }, { status: 400 });
    }

    const provider = body.provider === "thonburian" ? "thonburian" : body.provider === "mms" ? "mms" : "gemini";
    const requestedVoice = String(body.voice || "").trim();
    if (provider === "thonburian") {
      return NextResponse.json(await synthesizeWithThonburian(text));
    }
    if (provider === "mms") {
      return NextResponse.json(await synthesizeWithMms(text));
    }

    return NextResponse.json(await synthesizeWithGemini(text, requestedVoice));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "TTS server error." },
      { status: 500 },
    );
  }
}
