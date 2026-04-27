"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Room } from "@/types";
import { getRoom, getMessages, sendMessage as apiSendMessage } from "@/lib/api";
import MessageList from "@/components/MessageList";
import MessageInput from "@/components/MessageInput";

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const { user } = useAuth();
  const {
    messages,
    typingUsers,
    sendMessage: wsSendMessage,
    sendTyping,
    addFetchedMessages,
  } = useWebSocket(roomId);

  const [room, setRoom] = useState<Room | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Fetch room details
  useEffect(() => {
    async function fetchRoom() {
      try {
        const data = await getRoom(roomId);
        setRoom(data);
      } catch {
        // silent
      }
    }
    fetchRoom();
  }, [roomId]);

  // Fetch initial messages
  useEffect(() => {
    async function fetchMessages() {
      try {
        const data = await getMessages(roomId);
        addFetchedMessages(data.messages);
        setCursor(data.next_cursor);
        setHasMore(!!data.next_cursor);
      } catch {
        // silent
      } finally {
        setInitialLoad(false);
      }
    }
    setInitialLoad(true);
    fetchMessages();
  }, [roomId, addFetchedMessages]);

  const handleLoadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await getMessages(roomId, cursor);
      addFetchedMessages(data.messages);
      setCursor(data.next_cursor);
      setHasMore(!!data.next_cursor);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, roomId, addFetchedMessages]);

  const handleSend = useCallback(
    async (content: string, fileUrl?: string, fileName?: string) => {
      if (fileUrl) {
        // If there's a file, send via REST API
        try {
          await apiSendMessage(roomId, content || `[File: ${fileName}]`);
        } catch {
          // silent
        }
      } else {
        wsSendMessage(content);
      }
    },
    [roomId, wsSendMessage]
  );

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      sendTyping(isTyping);
    },
    [sendTyping]
  );

  const handleEdit = useCallback(
    (messageId: string, content: string) => {
      // Send edit via WebSocket or API
      wsSendMessage(content);
    },
    [wsSendMessage]
  );

  const handleDelete = useCallback(
    (messageId: string) => {
      // Send delete via WebSocket or API
      wsSendMessage(`[Deleted message: ${messageId}]`);
    },
    [wsSendMessage]
  );

  const handleReaction = useCallback(
    (messageId: string, emoji: string) => {
      // Send reaction via WebSocket or API
      wsSendMessage(`${emoji} on message ${messageId}`);
    },
    [wsSendMessage]
  );

  // Filter typing users to exclude self
  const filteredTypingUsers = new Map(
    Array.from(typingUsers.entries()).filter(([id]) => id !== user?.id)
  );

  function getRoomDisplayName(): string {
    if (!room) return "";
    if (room.is_direct && user) {
      const other = room.members?.find((m) => m.id !== user.id);
      return other?.username || room.name;
    }
    return room.name;
  }

  if (initialLoad) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Room header */}
      <div
        className="flex items-center gap-3 px-6 py-4 border-b flex-shrink-0"
        style={{
          borderColor: "var(--border)",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        <div className="flex-1 min-w-0 ml-8 md:ml-0">
          <h2 className="text-base font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {room?.is_direct ? "" : "# "}
            {getRoomDisplayName()}
          </h2>
          {room?.description && (
            <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
              {room.description}
            </p>
          )}
        </div>
        {room && !room.is_direct && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: "var(--text-secondary)" }}
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {room.members?.length || 0}
            </span>
          </div>
        )}
      </div>

      {/* Messages */}
      <MessageList
        messages={messages}
        typingUsers={filteredTypingUsers}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={handleLoadMore}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onReaction={handleReaction}
      />

      {/* Input */}
      <MessageInput onSend={handleSend} onTyping={handleTyping} />
    </div>
  );
}
