import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Sparkles } from "lucide-react";
import { ChatMessage } from "../types";

interface RoomChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
  pending?: boolean;
}

export const RoomChat: React.FC<RoomChatProps> = ({ messages, onSendMessage, pending = false }) => {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    try {
      await onSendMessage(message);
      setText("");
    } catch {
      // Keep the draft so the user can retry.
    }
  };

  return (
    <section className="w-full max-w-5xl mx-auto glass-panel p-4 sm:p-5 text-[#F8F6F4] z-10">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-xl bg-[#D69A97]/15"><MessageCircle className="w-4 h-4 text-[#D69A97]" /></span>
          <div><h3 className="text-sm font-display font-medium">Room Chat</h3><p className="text-[10px] text-[#E2D9D6]/55">A quiet corner for the musicians in this room</p></div>
        </div>
        <span className="text-[9px] font-mono text-[#E2D9D6]/45">{messages.length} MESSAGE{messages.length === 1 ? "" : "S"}</span>
      </div>

      <div className="h-40 overflow-y-auto rounded-2xl bg-black/10 border border-white/5 px-3 py-2 space-y-2" aria-live="polite">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-[#E2D9D6]/45">
            <Sparkles className="w-5 h-5 text-[#E8A15A]/70 mb-2" />
            <p className="text-xs">No messages yet. Say hello before the first note.</p>
          </div>
        ) : messages.map((message) => (
          <div key={message.id} className="flex items-start gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: message.color, boxShadow: `0 0 8px ${message.color}` }} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2"><span className="text-[11px] font-semibold" style={{ color: message.color }}>{message.username}</span><time className="text-[9px] font-mono text-[#E2D9D6]/35">{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>
              <p className="text-xs text-[#F8F6F4]/90 leading-relaxed break-words select-text">{message.text}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2 mt-3">
        <input value={text} onChange={(event) => setText(event.target.value)} maxLength={280} placeholder="Write something kind…" className="flex-1 min-w-0 bg-black/15 border border-white/10 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-[#F4B07A]/60 placeholder-white/30" />
        <button type="submit" disabled={!text.trim() || pending} className="btn-sunset rounded-xl px-4 py-2.5 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"><Send className="w-3.5 h-3.5" /></button>
      </form>
    </section>
  );
};
