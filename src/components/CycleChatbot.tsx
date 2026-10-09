import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Sparkles, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cycle-chat`;

const SUGGESTIONS = [
  "What are the 4 phases of a menstrual cycle?",
  "How can I ease period cramps naturally?",
  "What does irregular period mean?",
  "Tips for PMS management",
];

function clampAssistantReply(text: string) {
  const trimmed = (text || "").trim();
  if (!trimmed) return trimmed;

  // Prefer bullet/list lines if present.
  const lines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const bulletLike = lines.filter((l) => /^([-*]|\d+\.)\s+/.test(l));
  if (bulletLike.length) return bulletLike.slice(0, 5).join("\n");

  // Fallback: cap to 5 sentences.
  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.slice(0, 5).join(" ");
}

const CycleChatbot = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: Msg = { role: "user", content: text.trim() };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput("");
      setIsLoading(true);

      let assistantSoFar = "";

      const upsertAssistant = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
            );
          }
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      };

      const finalizeAssistant = () => {
        setMessages((prev) => {
          if (!prev.length) return prev;
          const last = prev[prev.length - 1];
          if (last.role !== "assistant") return prev;
          const clamped = clampAssistantReply(last.content);
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: clamped } : m
          );
        });
      };

      try {
        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ messages: newMessages }),
        });

        if (!resp.ok || !resp.body) {
          const errorData = await resp.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to get response");
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let textBuffer = "";
        let streamDone = false;

        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;
          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);

            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") {
              streamDone = true;
              break;
            }

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content as
                | string
                | undefined;
              if (content) upsertAssistant(content);
            } catch {
              textBuffer = line + "\n" + textBuffer;
              break;
            }
          }
        }

        // flush remaining
        if (textBuffer.trim()) {
          for (let raw of textBuffer.split("\n")) {
            if (!raw) continue;
            if (raw.endsWith("\r")) raw = raw.slice(0, -1);
            if (raw.startsWith(":") || raw.trim() === "") continue;
            if (!raw.startsWith("data: ")) continue;
            const jsonStr = raw.slice(6).trim();
            if (jsonStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content as
                | string
                | undefined;
              if (content) upsertAssistant(content);
            } catch {}
          }
        }
        finalizeAssistant();
      } catch (e: any) {
        console.error("Chat error:", e);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              e?.message || "Sorry, I couldn't respond right now. Please try again.",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Button
              onClick={() => setOpen(true)}
              className="h-14 w-14 rounded-full gradient-primary shadow-elevated hover:shadow-xl transition-all duration-300 hover:scale-110"
              size="icon"
            >
              <MessageCircle className="h-6 w-6 text-primary-foreground" />
            </Button>
            {/* pulse ring */}
            <span className="absolute inset-0 rounded-full animate-ping gradient-primary opacity-20 pointer-events-none" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="fixed bottom-6 right-6 z-50 w-[440px] max-w-[calc(100vw-1.5rem)] h-[720px] max-h-[calc(100vh-1rem)] flex flex-col rounded-3xl overflow-hidden border border-primary/25 shadow-elevated bg-gradient-to-br from-card via-card to-primary/5"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-rose-500 via-coral to-primary px-5 py-4 flex items-center gap-3 shrink-0">
              <div className="h-9 w-9 rounded-full bg-primary-foreground/25 flex items-center justify-center backdrop-blur-sm ring-1 ring-primary-foreground/30">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-primary-foreground font-semibold text-sm font-sans">
                  Bloom Assistant
                </h3>
                <p className="text-primary-foreground/70 text-xs">
                  Your cycle wellness guide 🌸
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="h-8 w-8 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gradient-to-b from-transparent via-rose-500/5 to-lavender/10">
              {messages.length === 0 && (
                <div className="flex flex-col items-center gap-4 pt-6">
                  <div className="h-14 w-14 rounded-2xl gradient-accent flex items-center justify-center shadow-soft">
                    <Bot className="h-7 w-7 text-accent-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-foreground text-sm">
                      Hi! I'm Bloom 🌸
                    </p>
                    <p className="text-muted-foreground text-xs mt-1 max-w-[240px]">
                      Ask me anything about your menstrual cycle, symptoms, or wellness.
                    </p>
                  </div>
                  <div className="w-full grid grid-cols-1 gap-2 mt-2">
                    {SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(s)}
                        className="text-left text-xs px-3 py-2.5 rounded-xl border border-primary/20 bg-gradient-to-r from-background/90 to-primary/5 hover:from-rose-500/10 hover:to-primary/10 hover:border-primary/40 transition-all text-foreground/90 hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "assistant" && (
                    <div className="h-7 w-7 rounded-full gradient-primary flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-primary-foreground" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-gradient-to-r from-rose-500 via-coral to-primary text-primary-foreground rounded-br-md shadow-soft"
                        : "bg-gradient-to-r from-background to-primary/5 text-foreground rounded-bl-md border border-primary/20"
                    }`}
                  >
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:mb-1.5 [&_li]:mb-0.5">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      m.content
                    )}
                  </div>
                  {m.role === "user" && (
                    <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                      <User className="h-3.5 w-3.5 text-secondary-foreground" />
                    </div>
                  )}
                </motion.div>
              ))}

              {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2 items-start"
                >
                  <div className="h-7 w-7 rounded-full gradient-primary flex items-center justify-center shrink-0">
                    <Bot className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                  <div className="bg-gradient-to-r from-background to-primary/5 rounded-2xl rounded-bl-md px-4 py-3 border border-primary/20">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="shrink-0 border-t border-primary/20 px-4 py-3 flex gap-2 bg-gradient-to-r from-card via-card to-primary/5"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your cycle..."
                disabled={isLoading}
                className="flex-1 bg-background/80 border border-primary/20 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all disabled:opacity-50"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isLoading}
                className="h-10 w-10 rounded-xl gradient-primary shadow-soft hover:shadow-elevated transition-all"
              >
                <Send className="h-4 w-4 text-primary-foreground" />
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default CycleChatbot;
