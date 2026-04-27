"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import wsManager from "@/lib/websocket";
import { useAuth } from "@/context/AuthContext";
import { Message, TypingIndicator } from "@/types";

export function useWebSocket(roomId: string) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const typingTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!token || !roomId) return;

    wsManager.connect(roomId, token);

    wsManager.onMessage((message: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    });

    wsManager.onMessageEdited((updated: Message) => {
      setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, content: updated.content, is_edited: true } : m));
    });

    wsManager.onMessageDeleted((data: { message_id: string }) => {
      setMessages((prev) => prev.map((m) => m.id === data.message_id ? { ...m, content: "[Message deleted]", is_deleted: true, file_url: null, file_name: null } : m));
    });

    wsManager.onReactionAdded((data) => {
      setMessages((prev) => prev.map((m) => {
        if (m.id !== data.message_id) return m;
        const newReaction = { id: data.id || "", message_id: data.message_id, user_id: data.user_id, username: data.username || null, emoji: data.emoji, created_at: data.created_at || new Date().toISOString() };
        return { ...m, reactions: [...(m.reactions || []), newReaction] };
      }));
    });

    wsManager.onReactionRemoved((data) => {
      setMessages((prev) => prev.map((m) => {
        if (m.id !== data.message_id) return m;
        return { ...m, reactions: (m.reactions || []).filter((r) => !(r.user_id === data.user_id && r.emoji === data.emoji)) };
      }));
    });

    wsManager.onTyping((indicator: TypingIndicator) => {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (indicator.is_typing) {
          next.set(indicator.user_id, indicator.username);
          const existing = typingTimeouts.current.get(indicator.user_id);
          if (existing) clearTimeout(existing);
          const timeout = setTimeout(() => {
            setTypingUsers((p) => { const n = new Map(p); n.delete(indicator.user_id); return n; });
            typingTimeouts.current.delete(indicator.user_id);
          }, 3000);
          typingTimeouts.current.set(indicator.user_id, timeout);
        } else {
          next.delete(indicator.user_id);
          const existing = typingTimeouts.current.get(indicator.user_id);
          if (existing) { clearTimeout(existing); typingTimeouts.current.delete(indicator.user_id); }
        }
        return next;
      });
    });

    wsManager.onReadReceipt(() => {});
    wsManager.onUserJoined(() => {});
    wsManager.onUserLeft(() => {});

    return () => {
      wsManager.disconnect();
      typingTimeouts.current.forEach((t) => clearTimeout(t));
      typingTimeouts.current.clear();
    };
  }, [roomId, token]);

  const sendMessage = useCallback((content: string) => { wsManager.sendMessage(content); }, []);
  const sendTyping = useCallback((isTyping: boolean) => { wsManager.sendTyping(isTyping); }, []);
  const sendReadReceipt = useCallback((messageId: string) => { wsManager.sendReadReceipt(messageId); }, []);
  const sendEdit = useCallback((messageId: string, content: string) => { wsManager.sendEdit(messageId, content); }, []);
  const sendDelete = useCallback((messageId: string) => { wsManager.sendDelete(messageId); }, []);
  const sendReaction = useCallback((messageId: string, emoji: string) => { wsManager.sendReaction(messageId, emoji); }, []);

  const addFetchedMessages = useCallback((fetched: Message[]) => {
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const newMsgs = fetched.filter((m) => !ids.has(m.id));
      return [...newMsgs, ...prev];
    });
  }, []);

  return { messages, typingUsers, sendMessage, sendTyping, sendReadReceipt, sendEdit, sendDelete, sendReaction, addFetchedMessages };
}
