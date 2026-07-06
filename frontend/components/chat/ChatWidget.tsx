"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  BarChart3,
  GitCompare,
  Minus,
  PieChart,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { API_BASE } from "@/lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  refused?: boolean;
  error?: boolean;
}

const STARTER_PROMPTS = [
  { icon: TrendingUp, text: "What's the Insider Score for NVDA?" },
  { icon: Sparkles, text: "Top 5 insider buys today" },
  { icon: Star, text: "Analyst rating for AAPL?" },
  { icon: GitCompare, text: "Compare TSLA vs F" },
  { icon: PieChart, text: "Which sectors are hot right now?" },
  { icon: BarChart3, text: "Today's biggest gainers" },
];

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I'm the **Insider Buying** assistant. I can help you with stocks, Insider Scores, insider trading, congressional trades, and anything about our site. Ask me anything below.",
};

function uid() {
  return `m-${Math.random().toString(36).slice(2, 10)}`;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore session messages so the conversation survives navigation.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("ib-chat-messages");
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "ib-chat-messages",
        JSON.stringify(messages.slice(-30)),
      );
    } catch {}
  }, [messages]);

  // Auto-scroll on new message
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, minimized]);

  // Focus input when the panel opens
  useEffect(() => {
    if (open && !minimized) inputRef.current?.focus();
  }, [open, minimized]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = { id: uid(), role: "user", content: trimmed };
    const placeholder: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      pending: true,
    };
    setMessages((prev) => [...prev, userMsg, placeholder]);
    setInput("");
    setSending(true);

    // Build payload from prior turns (excluding welcome + the pending placeholder)
    const history = [...messages, userMsg]
      .filter((m) => m.id !== "welcome" && !m.pending)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = (await res.json().catch(() => null)) as
        | { reply: string; refused?: boolean; message?: string }
        | null;
      if (!res.ok || !data || !data.reply) {
        const reason =
          (data && (data as any).message) ||
          (res.status === 503
            ? "Chat is not configured on the server yet (ANTHROPIC_API_KEY missing)."
            : `Request failed (${res.status})`);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholder.id
              ? { ...m, content: reason, pending: false, error: true }
              : m,
          ),
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholder.id
              ? {
                  ...m,
                  content: data.reply,
                  pending: false,
                  refused: !!data.refused,
                }
              : m,
          ),
        );
      }
    } catch (err) {
      const msg = (err as Error)?.message || "Network error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholder.id
            ? { ...m, content: msg, pending: false, error: true }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setMessages([WELCOME]);
    try {
      sessionStorage.removeItem("ib-chat-messages");
    } catch {}
  }

  return (
    <>
      {/* Floating launcher button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="launcher"
            initial={{ opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 20 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setOpen(true);
              setMinimized(false);
            }}
            aria-label="Open assistant"
            className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2.5 rounded-full overflow-hidden"
            style={{
              background:
                "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
              color: "#fff",
              padding: "14px 22px",
              boxShadow:
                "0 12px 32px rgba(0,88,130,0.35), 0 0 0 1px rgba(255,255,255,0.08) inset",
              cursor: "pointer",
              border: "none",
            }}
          >
            <motion.span
              animate={{ rotate: [0, -8, 8, 0] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                repeatDelay: 3,
                ease: "easeInOut",
              }}
              className="inline-flex"
            >
              <Sparkles className="h-5 w-5" />
            </motion.span>
            <span className="font-bold text-[14px] tracking-tight">
              Ask the Insider
            </span>
            <span
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(80% 100% at 50% 0%, rgba(255,255,255,0.25), transparent 60%)",
              }}
            />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              height: minimized ? 60 : 620,
            }}
            exit={{ opacity: 0, y: 30, scale: 0.96 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-5 right-5 z-50 flex flex-col rounded-2xl overflow-hidden"
            style={{
              width: "min(420px, calc(100vw - 32px))",
              background: "var(--bg-2)",
              border: "1px solid var(--border-strong)",
              boxShadow:
                "0 30px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.04)",
              maxHeight: "calc(100vh - 40px)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
                color: "#fff",
                height: 60,
                flexShrink: 0,
              }}
            >
              <div
                className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: "rgba(255,255,255,0.18)",
                  border: "1px solid rgba(255,255,255,0.28)",
                }}
              >
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold leading-tight">
                  Insider Buying Assistant
                </div>
                <div className="text-[11px] opacity-80 inline-flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full inline-block"
                    style={{ background: "#4ade80" }}
                  />
                  <span>Online</span>
                </div>
              </div>
              <button
                onClick={() => setMinimized((m) => !m)}
                aria-label={minimized ? "Expand" : "Minimize"}
                className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-white/15 transition"
                style={{ color: "#fff" }}
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-white/15 transition"
                style={{ color: "#fff" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            {!minimized && (
              <>
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
                  style={{ background: "var(--bg-1)" }}
                >
                  {messages.map((m, i) => (
                    <ChatBubble key={m.id} msg={m} index={i} />
                  ))}

                  {/* Starter chips — only show when only the welcome message is present */}
                  {messages.length === 1 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.35 }}
                      className="pt-2 space-y-2"
                    >
                      <div className="text-[10px] uppercase tracking-wider font-bold text-mute">
                        Try asking
                      </div>
                      {STARTER_PROMPTS.map((p) => {
                        const Icon = p.icon;
                        return (
                          <button
                            key={p.text}
                            onClick={() => send(p.text)}
                            className="w-full text-left inline-flex items-center gap-2 px-3 py-2 rounded-lg transition group"
                            style={{
                              background: "var(--bg-2)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <Icon className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                            <span className="text-[13px] text-soft group-hover:text-accent transition">
                              {p.text}
                            </span>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </div>

                {/* Composer */}
                <div
                  className="border-t px-3 py-3"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--bg-2)",
                  }}
                >
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      send(input);
                    }}
                    className="flex items-end gap-2"
                  >
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send(input);
                        }
                      }}
                      placeholder="Ask about a ticker, Insider Score, or insider activity…"
                      rows={1}
                      className="flex-1 resize-none rounded-lg px-3 py-2.5 text-[14px] outline-none transition"
                      style={{
                        background: "var(--bg-1)",
                        border: "1px solid var(--border-strong)",
                        color: "var(--text)",
                        maxHeight: 120,
                        minHeight: 42,
                      }}
                    />
                    <motion.button
                      type="submit"
                      disabled={!input.trim() || sending}
                      whileHover={{ scale: input.trim() && !sending ? 1.05 : 1 }}
                      whileTap={{ scale: 0.94 }}
                      className="h-10 w-10 rounded-lg flex items-center justify-center transition flex-shrink-0"
                      style={{
                        background:
                          input.trim() && !sending
                            ? "linear-gradient(135deg, var(--accent), var(--accent-2))"
                            : "var(--bg-3)",
                        color: input.trim() && !sending ? "#fff" : "var(--text-mute)",
                        cursor: input.trim() && !sending ? "pointer" : "not-allowed",
                        border: "none",
                      }}
                    >
                      <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                    </motion.button>
                  </form>
                  <div className="flex items-center justify-between mt-2 text-[10px] text-mute">
                    <span>Press Enter to send · Shift + Enter for newline</span>
                    {messages.length > 1 && (
                      <button
                        onClick={reset}
                        className="hover:text-accent transition font-semibold uppercase tracking-wider"
                      >
                        Clear chat
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ChatBubble({ msg, index }: { msg: ChatMessage; index: number }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.3,
        delay: Math.min(index * 0.02, 0.1),
        ease: [0.22, 1, 0.36, 1],
      }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className="rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed"
        style={{
          maxWidth: "85%",
          background: isUser
            ? "linear-gradient(135deg, var(--accent), var(--accent-2))"
            : msg.error
              ? "color-mix(in srgb, var(--bad) 12%, var(--bg-2))"
              : "var(--bg-2)",
          color: isUser ? "#fff" : msg.error ? "var(--bad)" : "var(--text)",
          border: isUser
            ? "1px solid rgba(255,255,255,0.18)"
            : `1px solid ${
                msg.error ? "color-mix(in srgb, var(--bad) 35%, var(--border))" : "var(--border)"
              }`,
          borderBottomRightRadius: isUser ? 4 : undefined,
          borderBottomLeftRadius: !isUser ? 4 : undefined,
          boxShadow: isUser
            ? "0 4px 12px rgba(0,88,130,0.18)"
            : "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        {msg.pending ? <TypingDots /> : <RichText text={msg.content} />}
      </div>
    </motion.div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1 px-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--text-mute)" }}
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/** Minimal markdown-ish renderer: **bold**, code-style $TICKER mentions, and
 * line breaks. Keeps the chat readable without pulling in a markdown library. */
function RichText({ text }: { text: string }) {
  const lines = text.split(/\n/);
  return (
    <>
      {lines.map((line, li) => (
        <span key={li} style={{ display: "block" }}>
          {renderInline(line)}
          {li < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function renderInline(line: string): React.ReactNode[] {
  // Split on **bold** markers, preserving the delimiters
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={i} style={{ fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
