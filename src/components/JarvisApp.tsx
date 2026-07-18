"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { BookOpen, Eraser, Mic2, Send, Square, Volume2 } from "lucide-react";
import "./jarvis-app.css";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type KnowledgeItem = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt?: string;
};

type GeminiVoiceOption = {
  name: string;
  style: string;
};

type TtsProvider = "gemini" | "thonburian";

const GEMINI_VOICES: GeminiVoiceOption[] = [
  { name: "Kore", style: "Firm" },
  { name: "Puck", style: "Upbeat" },
  { name: "Charon", style: "Informative" },
  { name: "Orus", style: "Firm" },
  { name: "Fenrir", style: "Excitable" },
  { name: "Aoede", style: "Breezy" },
  { name: "Leda", style: "Youthful" },
  { name: "Zephyr", style: "Bright" },
  { name: "Callirrhoe", style: "Easy-going" },
  { name: "Autonoe", style: "Bright" },
  { name: "Enceladus", style: "Breathy" },
  { name: "Iapetus", style: "Clear" },
  { name: "Umbriel", style: "Easy-going" },
  { name: "Algieba", style: "Smooth" },
  { name: "Despina", style: "Smooth" },
  { name: "Erinome", style: "Clear" },
  { name: "Algenib", style: "Gravelly" },
  { name: "Rasalgethi", style: "Informative" },
  { name: "Laomedeia", style: "Upbeat" },
  { name: "Achernar", style: "Soft" },
  { name: "Alnilam", style: "Firm" },
  { name: "Schedar", style: "Even" },
  { name: "Gacrux", style: "Mature" },
  { name: "Pulcherrima", style: "Forward" },
  { name: "Achird", style: "Friendly" },
  { name: "Zubenelgenubi", style: "Casual" },
  { name: "Vindemiatrix", style: "Gentle" },
  { name: "Sadachbia", style: "Lively" },
  { name: "Sadaltager", style: "Knowledgeable" },
  { name: "Sulafat", style: "Warm" },
];

export function JarvisApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "สวัสดีครับ ผม Jarvis เฟสแรก พิมพ์มาคุยได้เลย ผมจะค้นข้อมูลจาก Firebase ก่อนตอบเมื่อมีข้อมูลเกี่ยวข้อง",
    },
  ]);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("พร้อมสนทนา");
  const [busy, setBusy] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>("gemini");
  const [geminiVoice, setGeminiVoice] = useState("Kore");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceIndex, setVoiceIndex] = useState("0");
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [knowledgeForm, setKnowledgeForm] = useState({ title: "", content: "", tags: "" });
  const messagesRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const available = window.speechSynthesis?.getVoices?.() ?? [];
      setVoices(available);
      const thaiVoice = available.findIndex((voice) => voice.lang.toLowerCase().startsWith("th"));
      if (thaiVoice >= 0) setVoiceIndex(String(thaiVoice));
    };

    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    const savedProvider = window.localStorage.getItem("jarvis-tts-provider");
    if (savedProvider === "gemini" || savedProvider === "thonburian") {
      setTtsProvider(savedProvider);
    }

    const savedVoice = window.localStorage.getItem("jarvis-gemini-voice");
    if (savedVoice && GEMINI_VOICES.some((voice) => voice.name === savedVoice)) {
      setGeminiVoice(savedVoice);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("jarvis-tts-provider", ttsProvider);
    window.localStorage.setItem("jarvis-gemini-voice", geminiVoice);
  }, [ttsProvider, geminiVoice]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    loadKnowledge().catch(() => setKnowledge([]));
  }, []);

  function speakWithBrowser(text: string) {
    if (!speechEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = voices[Number(voiceIndex)];
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = "th-TH";
    }
    utterance.rate = 1;
    utterance.pitch = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  async function speak(text: string) {
    if (!speechEnabled) return;
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();

    try {
      setStatus(ttsProvider === "thonburian" ? "กำลังสร้างเสียง ThonburianTTS..." : "กำลังสร้างเสียง Gemini...");
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, provider: ttsProvider, voice: geminiVoice }),
      });
      const data = await response.json();
      if (!response.ok || !data.audio) throw new Error(data.message || "Gemini TTS unavailable");

      const audio = new Audio(data.audio);
      audioRef.current = audio;
      await audio.play();
    } catch {
      speakWithBrowser(text);
    }
  }

  async function loadKnowledge() {
    const response = await fetch("/api/knowledge");
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Cannot load knowledge");
    setKnowledge(data.items ?? []);
  }

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setPrompt("");
    setBusy(true);
    setStatus("กำลังค้น Firebase และถาม Claude...");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Jarvis ตอบไม่ได้");

      const answer = data.text || "ผมไม่ได้รับคำตอบกลับมาครับ";
      setMessages((current) => [...current, { role: "assistant", content: answer }]);
      void speak(answer);
      setStatus(data.contextCount ? `ตอบโดยใช้ข้อมูลอ้างอิง ${data.contextCount} รายการ` : "ตอบโดยไม่พบข้อมูลอ้างอิง");
    } catch (error) {
      const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
      setMessages((current) => [...current, { role: "assistant", content: `ขออภัยครับ ${message}` }]);
      setStatus("มีปัญหา");
    } finally {
      setBusy(false);
    }
  }

  async function saveKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!knowledgeForm.title.trim() || !knowledgeForm.content.trim()) return;
    setStatus("กำลังบันทึกข้อมูลเข้า Firebase...");

    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: knowledgeForm.title,
        content: knowledgeForm.content,
        tags: knowledgeForm.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      }),
    });
    const data = await response.json();

    if (response.ok) {
      setKnowledgeForm({ title: "", content: "", tags: "" });
      setKnowledge((current) => [data.item, ...current].slice(0, 12));
      setStatus("บันทึกข้อมูลแล้ว");
    } else {
      setStatus(data.message || "บันทึกข้อมูลไม่ได้");
    }
  }

  return (
    <main className="jarvis-shell">
      <section className="chat-panel" aria-label="Jarvis chat">
        <header className="app-header">
          <div>
            <p>Jarvis React + Firebase</p>
            <h1>Jarvis</h1>
          </div>
          <div className={`status ${busy ? "busy" : ""}`}>
            <span />
            {status}
          </div>
        </header>

        <div ref={messagesRef} className="messages">
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
              <strong>{message.role === "user" ? "คุณ" : "Jarvis"}</strong>
              <p>{message.content}</p>
            </article>
          ))}
        </div>

        <form className="composer" onSubmit={submitChat}>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="พิมพ์ข้อความถึง Jarvis..."
            rows={2}
          />
          <button type="submit" disabled={busy || !prompt.trim()} aria-label="ส่งข้อความ">
            <Send size={20} />
          </button>
        </form>
      </section>

      <aside className="side-panel" aria-label="Jarvis controls and knowledge">
        <section className="tool-panel">
          <h2>
            <Volume2 size={18} />
            เสียงตอบกลับ
          </h2>
          <label className="toggle-row">
            <input checked={speechEnabled} onChange={(event) => setSpeechEnabled(event.target.checked)} type="checkbox" />
            <span>เปิดเสียง</span>
          </label>
          <label>
            โมเดลเสียง
            <select value={ttsProvider} onChange={(event) => setTtsProvider(event.target.value as TtsProvider)}>
              <option value="gemini">Gemini TTS</option>
              <option value="thonburian">ThonburianTTS</option>
            </select>
          </label>
          <label>
            เลือกเสียง
            <select
              value={ttsProvider === "thonburian" ? "ThonburianTTS" : geminiVoice}
              onChange={(event) => setGeminiVoice(event.target.value)}
            >
              {ttsProvider === "thonburian" ? (
                <option value="ThonburianTTS">ThonburianTTS - Thai</option>
              ) : (
                GEMINI_VOICES.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} - {voice.style}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="button-row">
            <button
              type="button"
              onClick={() => {
                window.speechSynthesis?.cancel();
                audioRef.current?.pause();
              }}
            >
              <Square size={16} />
              หยุดเสียง
            </button>
            <button type="button" onClick={() => setMessages([])}>
              <Eraser size={16} />
              ล้างแชต
            </button>
          </div>
        </section>

        <section className="tool-panel">
          <h2>
            <BookOpen size={18} />
            ฐานข้อมูลความรู้
          </h2>
          <form className="knowledge-form" onSubmit={saveKnowledge}>
            <input
              value={knowledgeForm.title}
              onChange={(event) => setKnowledgeForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="หัวข้อ เช่น ข้อมูลบริษัท"
            />
            <textarea
              value={knowledgeForm.content}
              onChange={(event) => setKnowledgeForm((current) => ({ ...current, content: event.target.value }))}
              placeholder="เนื้อหาที่ Jarvis ใช้ค้นหาและตอบ"
              rows={5}
            />
            <input
              value={knowledgeForm.tags}
              onChange={(event) => setKnowledgeForm((current) => ({ ...current, tags: event.target.value }))}
              placeholder="แท็ก คั่นด้วย comma"
            />
            <button type="submit">
              <Mic2 size={16} />
              เพิ่มให้ Jarvis จำ
            </button>
          </form>
          <div className="knowledge-list">
            {knowledge.map((item) => (
              <article key={item.id}>
                <strong>{item.title}</strong>
                <p>{item.content}</p>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}
