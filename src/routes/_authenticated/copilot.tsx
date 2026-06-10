import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, User as UserIcon, Sparkles } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/_authenticated/copilot")({
  head: () => ({ meta: [{ title: "AI Copilot — Agir" }] }),
  component: CopilotPage,
});

const SUGGESTIONS = [
  "Why did projected profit decline?",
  "Which assumptions changed this month?",
  "What is my largest cost risk?",
  "Show me projects with IRR below 12%.",
  "Which project has the highest margin?",
];

function CopilotPage() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);

  if (!token) return <div className="p-6 text-muted-foreground text-sm">Loading…</div>;
  return <ChatUI token={token} />;
}

function ChatUI({ token }: { token: string }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const transport = new DefaultChatTransport({
    api: "/api/chat",
    headers: { Authorization: `Bearer ${token}` },
  });
  const { messages, sendMessage, status } = useChat({ transport });
  const loading = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function send(text: string) {
    if (!text.trim() || loading) return;
    sendMessage({ text: text.trim() });
    setInput("");
  }

  return (
    <>
      <PageHeader title="AI Copilot" subtitle="Conversational analyst connected to your project data" />
      <div className="p-6 flex flex-col h-[calc(100vh-73px)]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2">
          {messages.length === 0 && (
            <Card className="p-8 text-center">
              <Bot className="size-10 mx-auto text-primary" />
              <h3 className="mt-3 font-semibold">How can I help you analyze your portfolio?</h3>
              <p className="text-sm text-muted-foreground mt-1">I can reference your live project data.</p>
              <div className="grid sm:grid-cols-2 gap-2 mt-5 max-w-xl mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="text-left text-xs border border-border rounded-md p-3 hover:border-primary hover:bg-accent/30 transition-colors">
                    <Sparkles className="size-3 inline mr-1 text-primary" />{s}
                  </button>
                ))}
              </div>
            </Card>
          )}
          {messages.map((m) => {
            const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                <div className={`size-8 rounded-md flex items-center justify-center shrink-0 ${isUser ? "bg-accent" : "bg-primary"}`}>
                  {isUser ? <UserIcon className="size-4" /> : <Bot className="size-4 text-primary-foreground" />}
                </div>
                <Card className={`p-4 max-w-3xl ${isUser ? "bg-accent border-accent" : ""}`}>
                  <div className="prose prose-sm prose-invert max-w-none text-sm">
                    <ReactMarkdown>{text}</ReactMarkdown>
                  </div>
                </Card>
              </div>
            );
          })}
          {loading && (
            <div className="flex gap-3">
              <div className="size-8 rounded-md bg-primary flex items-center justify-center"><Bot className="size-4 text-primary-foreground animate-pulse" /></div>
              <Card className="p-4 text-sm text-muted-foreground">Thinking…</Card>
            </div>
          )}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-4 flex gap-2">
          <Input placeholder="Ask anything about your projects…" value={input} onChange={(e) => setInput(e.target.value)} disabled={loading} className="flex-1" />
          <Button type="submit" disabled={loading || !input.trim()}><Send className="size-4" /></Button>
        </form>
      </div>
    </>
  );
}
