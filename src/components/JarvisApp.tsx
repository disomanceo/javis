"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Eraser, Mic2, Send, Square, Volume2 } from "lucide-react";
import { JarvisHologram, type HologramMode } from "@/components/JarvisHologram";
import "./jarvis-app.css";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type KnowledgeItem = {
  id: string;
  title: string;
  content: string;
  sentence?: string;
  tags: string[];
  createdAt?: string;
};

type SaveRecord = {
  id: string;
  title: string;
  detail: string;
  savedAt: string;
};

type GeminiVoiceOption = {
  name: string;
  style: string;
};

type TtsProvider = "browser" | "gemini" | "thonburian" | "mms";

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

function ttsProviderLabel(provider: TtsProvider, geminiVoice: string) {
  if (provider === "browser") return "Browser / Microsoft";
  if (provider === "thonburian") return "ThonburianTTS";
  if (provider === "mms") return "MMS-TTS Thai";
  return `Gemini ${geminiVoice}`;
}

export function JarvisApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "สวัสดีครับ ผม Jarvis เฟสแรก พิมพ์มาคุยได้เลย ผมจะค้นข้อมูลจาก Firebase ก่อนตอบเมื่อมีข้อมูลเกี่ยวข้อง",
    },
  ]);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("พร้อมสนทนา");
  const [hologramMode, setHologramMode] = useState<HologramMode>("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>("browser");
  const [geminiVoice, setGeminiVoice] = useState("Kore");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceIndex, setVoiceIndex] = useState("0");
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [knowledgeForm, setKnowledgeForm] = useState({ title: "", content: "", tags: "" });
  const [saveRecords, setSaveRecords] = useState<SaveRecord[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState<string | null>(null);
  const [youtubeQuery, setYoutubeQuery] = useState<string | null>(null);
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);
  const [mobileMenuSection, setMobileMenuSection] = useState<"voice" | "memory">("voice");
  const messagesRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const available = window.speechSynthesis?.getVoices?.() ?? [];
      setVoices(available);
      const thaiVoice = available.findIndex((voice) => voice.lang.toLowerCase().startsWith("th"));
      const savedBrowserVoice = window.localStorage.getItem("jarvis-browser-voice-index");
      if (!savedBrowserVoice && thaiVoice >= 0) setVoiceIndex(String(thaiVoice));
    };

    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    const savedProvider = window.localStorage.getItem("jarvis-tts-provider");
    if (savedProvider === "browser" || savedProvider === "gemini" || savedProvider === "thonburian" || savedProvider === "mms") {
      setTtsProvider(savedProvider);
    }

    const savedVoice = window.localStorage.getItem("jarvis-gemini-voice");
    if (savedVoice && GEMINI_VOICES.some((voice) => voice.name === savedVoice)) {
      setGeminiVoice(savedVoice);
    }

    const savedBrowserVoice = window.localStorage.getItem("jarvis-browser-voice-index");
    if (savedBrowserVoice) {
      setVoiceIndex(savedBrowserVoice);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("jarvis-tts-provider", ttsProvider);
    window.localStorage.setItem("jarvis-gemini-voice", geminiVoice);
    window.localStorage.setItem("jarvis-browser-voice-index", voiceIndex);
  }, [ttsProvider, geminiVoice, voiceIndex]);

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
    utterance.onstart = () => setHologramMode("speaking");
    utterance.onend = () => setHologramMode("idle");
    utterance.onerror = () => setHologramMode("alert");
    window.speechSynthesis.speak(utterance);
    setStatus(`กำลังเล่นเสียง ${selectedVoice?.name || "Browser / Microsoft"}`);
  }

  function stopAudioLevelMeter() {
    if (analyserFrameRef.current !== null) {
      cancelAnimationFrame(analyserFrameRef.current);
      analyserFrameRef.current = null;
    }
    setAudioLevel(0);
  }

  function startAudioLevelMeter(audio: HTMLAudioElement) {
    stopAudioLevelMeter();
    const context = audioContextRef.current || new AudioContext();
    audioContextRef.current = context;
    if (context.state === "suspended") void context.resume();

    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(context.destination);

    const samples = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      setAudioLevel(Math.min(1, Math.sqrt(sum / samples.length) * 3.2));
      analyserFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  async function speak(text: string, options: { force?: boolean } = {}) {
    if (!options.force && !speechEnabled) return;
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();

    try {
      if (ttsProvider === "browser") {
        speakWithBrowser(text);
        return;
      }

      setStatus(`กำลังสร้างเสียง ${ttsProviderLabel(ttsProvider, geminiVoice)}...`);
      setHologramMode("thinking");
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, provider: ttsProvider, voice: geminiVoice }),
      });
      const data = await response.json();
      if (!response.ok || !data.audio) throw new Error(data.message || "TTS unavailable");

      const audio = new Audio(data.audio);
      audioRef.current = audio;
      audio.onplay = () => {
        startAudioLevelMeter(audio);
        setHologramMode("speaking");
      };
      audio.onended = () => {
        stopAudioLevelMeter();
        setHologramMode("idle");
      };
      audio.onerror = () => setHologramMode("alert");
      await audio.play();
      setStatus(`กำลังเล่นเสียง ${data.voice || ttsProviderLabel(ttsProvider, geminiVoice)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "สร้างเสียงไม่ได้";
      setStatus(`เสียงที่เลือกใช้ไม่ได้: ${message}`);
    }
  }

  function testSelectedVoice() {
    const selected = ttsProviderLabel(ttsProvider, geminiVoice);
    void speak(`ทดสอบเสียง ${selected} ครับ ผอ.`, { force: true });
  }

  function rememberSavedRecord(input: { title?: string | null; detail?: string | null; id?: string | null }) {
    const savedAt = new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());

    setSaveRecords((current) =>
      [
        {
          id: input.id || `${Date.now()}`,
          title: input.title?.trim() || "บันทึกข้อมูลแล้ว",
          detail: input.detail?.trim() || "บันทึกลง Firebase สำเร็จ",
          savedAt,
        },
        ...current,
      ].slice(0, 5),
    );
  }

  function toggleMobileMenu(section: "voice" | "memory") {
    if (mobileMenuSection === section && showFloatingMenu) {
      setShowFloatingMenu(false);
      return;
    }

    setMobileMenuSection(section);
    setShowFloatingMenu(true);
  }

  function renderVoiceControlsPanel() {
    return (
      <section className="tool-panel voice-controls-panel">
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
            <option value="browser">Browser / Microsoft</option>
            <option value="gemini">Gemini TTS</option>
            <option value="thonburian">ThonburianTTS</option>
            <option value="mms">MMS-TTS Thai</option>
          </select>
        </label>
        <label>
          เลือกเสียง
          <select
            value={
              ttsProvider === "browser"
                ? voiceIndex
                : ttsProvider === "thonburian"
                ? "ThonburianTTS"
                : ttsProvider === "mms"
                ? "MMS-TTS Thai"
                : geminiVoice
            }
            onChange={(event) => {
              if (ttsProvider === "browser") {
                setVoiceIndex(event.target.value);
              } else {
                setGeminiVoice(event.target.value);
              }
            }}
          >
            {ttsProvider === "browser" ? (
              voices.length ? (
                voices.map((voice, index) => (
                  <option key={`${voice.name}-${voice.lang}-${index}`} value={String(index)}>
                    {voice.name} - {voice.lang}
                  </option>
                ))
              ) : (
                <option value="0">Browser default voice</option>
              )
            ) : ttsProvider === "thonburian" ? (
              <option value="ThonburianTTS">ThonburianTTS - Thai</option>
            ) : ttsProvider === "mms" ? (
              <option value="MMS-TTS Thai">MMS-TTS Thai - facebook/mms-tts-tha</option>
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
              stopAudioLevelMeter();
              setHologramMode("idle");
            }}
          >
            <Square size={16} />
            หยุดเสียง
          </button>
          <button type="button" onClick={() => setMessages([])}>
            <Eraser size={16} />
            ล้างแชต
          </button>
          <button type="button" onClick={testSelectedVoice}>
            <Volume2 size={16} />
            ทดสอบเสียง
          </button>
        </div>
      </section>
    );
  }

  function renderMemoryPanel() {
    return (
      <section className="tool-panel memory-panel">
        {youtubeUrl ? (
          <section className="youtube-panel">
            <div className="youtube-header">
              <div>
                <strong>กำลังเล่นบน YouTube</strong>
                <p>{youtubeQuery}</p>
              </div>
              <button type="button" onClick={() => setYoutubeUrl(null)}>
                ปิด
              </button>
            </div>
            <div className="youtube-frame">
              <iframe
                title="YouTube Player"
                src={youtubeUrl}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          </section>
        ) : null}
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
        <div className="save-log" aria-live="polite">
          <strong>บันทึกล่าสุด</strong>
          {saveRecords.length ? (
            saveRecords.map((record) => (
              <article key={`${record.id}-${record.savedAt}`}>
                <span>{record.savedAt}</span>
                <p>{record.title}</p>
                <small>{record.detail}</small>
              </article>
            ))
          ) : (
            <p className="empty-save-log">ยังไม่มีรายการบันทึกในรอบนี้</p>
          )}
        </div>
        <div className="knowledge-list">
          {knowledge.slice(0, 7).map((item) => (
            <article key={item.id}>
              <strong>{item.sentence || item.title}</strong>
              {item.sentence && item.content && item.sentence !== item.content ? (
                <p>{item.content}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    );
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
    setHologramMode("thinking");
    setStatus("กำลังค้น Firebase และถาม Claude...");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Jarvis ตอบไม่ได้");

      if (data.youtubeUrl) {
        setYoutubeUrl(data.youtubeUrl);
        setYoutubeQuery(data.youtubeQuery || null);
      }

      const answer = data.text || "ผมไม่ได้รับคำตอบกลับมาครับ";
      setMessages((current) => [...current, { role: "assistant", content: answer }]);
      if (data.savedKnowledge) {
        setKnowledge((current) => [data.savedKnowledge, ...current].slice(0, 12));
        rememberSavedRecord({
          id: data.savedKnowledge.id,
          title: data.savedKnowledge.title,
          detail: "บันทึกเข้าฐานข้อมูลความจำ",
        });
      }
      if (data.operationResult?.success) {
        rememberSavedRecord({
          id: data.operationResult.recordId,
          title: data.operationResult.record?.title || data.operationResult.operation,
          detail: `บันทึกเป็น ${data.operationResult.entityType}`,
        });
      }
      if (!speechEnabled) setHologramMode(data.operationResult?.success || data.savedKnowledge ? "alert" : "idle");
      void speak(answer);
      setStatus(
        data.savedKnowledge
          ? "บันทึกข้อมูลเข้า Firebase แล้ว"
          : data.contextCount
            ? `ตอบโดยใช้ข้อมูลอ้างอิง ${data.contextCount} รายการ`
            : "ตอบโดยไม่พบข้อมูลอ้างอิง",
      );
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

    const sentence = `บันทึกว่า ${knowledgeForm.title.trim()} : ${knowledgeForm.content.trim()}`;
    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: knowledgeForm.title,
        content: knowledgeForm.content,
        sentence,
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
      rememberSavedRecord({
        id: data.item?.id,
        title: data.item?.title || knowledgeForm.title,
        detail: "เพิ่มข้อมูลให้ Jarvis จำแล้ว",
      });
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
            <p>Javis ผู้ช่วย ผอ.สุธน</p>
            <h1>Javis</h1>
          </div>
          <div className={`status ${busy ? "busy" : ""}`}>
            <span />
            {status}
          </div>
        </header>

        <div ref={messagesRef} className="messages">
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
              <strong>{message.role === "user" ? "ผอ." : "จาวิส"}</strong>
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
        <JarvisHologram mode={hologramMode} audioLevel={audioLevel} />

        <div className="desktop-panels">
          {renderVoiceControlsPanel()}
          {renderMemoryPanel()}
        </div>

        <button
          type="button"
          className="mobile-sheet-handle"
          onClick={() => setShowFloatingMenu((current) => !current)}
          aria-label={showFloatingMenu ? "ปิดเมนู" : "เปิดเมนู"}
        >
          <span className="sheet-handle-bar" />
        </button>

        <div className={`mobile-floating-menu ${showFloatingMenu ? "visible" : "hidden"}`}>
          <div className="mobile-toolbar">
            <button
              type="button"
              className={mobileMenuSection === "voice" ? "active" : ""}
              onClick={() => toggleMobileMenu("voice")}
            >
              เสียง
            </button>
            <button
              type="button"
              className={mobileMenuSection === "memory" ? "active" : ""}
              onClick={() => toggleMobileMenu("memory")}
            >
              ความจำ
            </button>
          </div>
          {mobileMenuSection === "voice" ? renderVoiceControlsPanel() : renderMemoryPanel()}
        </div>
      </aside>
    </main>
  );
}
