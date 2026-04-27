"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Message, Reaction } from "@/types";
import { useAuth } from "@/context/AuthContext";
import ReadReceipt from "./ReadReceipt";
import TypingIndicator from "./TypingIndicator";

interface MessageListProps {
  messages: Message[];
  typingUsers: Map<string, string>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReaction: (messageId: string, emoji: string) => void;
}

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👏"];

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
}

function getInitial(username: string): string {
  return username.charAt(0).toUpperCase();
}

function groupReactions(reactions: Reaction[]): { emoji: string; count: number; userIds: string[] }[] {
  const map = new Map<string, { count: number; userIds: string[] }>();
  for (const r of reactions) {
    const existing = map.get(r.emoji);
    if (existing) {
      existing.count++;
      existing.userIds.push(r.user_id);
    } else {
      map.set(r.emoji, { count: 1, userIds: [r.user_id] });
    }
  }
  return Array.from(map.entries()).map(([emoji, data]) => ({ emoji, ...data }));
}

function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-1 flex gap-1 p-1.5 rounded-lg shadow-lg z-10"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        border: "1px solid var(--border)",
      }}
    >
      {EMOJI_OPTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => { onSelect(emoji); onClose(); }}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 cursor-pointer transition-colors text-base"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export default function MessageList({
  messages,
  typingUsers,
  hasMore,
  loadingMore,
  onLoadMore,
  onEdit,
  onDelete,
  onReaction,
}: MessageListProps) {
  const { user } = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [emojiPickerMessageId, setEmojiPickerMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      scrollToBottom();
    }
    prevLengthRef.current = messages.length;
  }, [messages.length, scrollToBottom]);

  function shouldShowSender(index: number): boolean {
    if (index === 0) return true;
    const curr = messages[index];
    const prev = messages[index - 1];
    return curr.sender_id !== prev.sender_id;
  }

  function startEdit(msg: Message) {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
    setEmojiPickerMessageId(null);
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setEditContent("");
  }

  function saveEdit(messageId: string) {
    if (editContent.trim()) {
      onEdit(messageId, editContent.trim());
    }
    cancelEdit();
  }

  function handleDelete(messageId: string) {
    if (confirmDeleteId === messageId) {
      onDelete(messageId);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(messageId);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {hasMore && (
        <div className="flex justify-center mb-4">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-4 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}

      {messages.length === 0 && (
        <div
          className="flex items-center justify-center h-full text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          No messages yet. Say hello!
        </div>
      )}

      <div className="flex flex-col gap-1">
        {messages.map((msg, i) => {
          const isOwn = msg.sender_id === user?.id;
          const showSender = shouldShowSender(i);
          const isDeleted = msg.is_deleted;
          const isEditing = editingMessageId === msg.id;
          const isHovered = hoveredMessageId === msg.id;
          const reactions = msg.reactions || [];
          const grouped = groupReactions(reactions);

          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"} ${
                showSender ? "mt-3" : "mt-0.5"
              }`}
              onMouseEnter={() => setHoveredMessageId(msg.id)}
              onMouseLeave={() => { setHoveredMessageId(null); if (confirmDeleteId === msg.id) setConfirmDeleteId(null); }}
            >
              <div
                className={`flex gap-2 max-w-[70%] ${
                  isOwn ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {/* Avatar */}
                {!isOwn && (
                  <div className="flex-shrink-0 w-8">
                    {showSender ? (
                      msg.sender?.avatar_url ? (
                        <img
                          src={msg.sender.avatar_url}
                          alt={msg.sender.username}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ backgroundColor: "var(--accent)" }}
                        >
                          {getInitial(msg.sender?.username || "?")}
                        </div>
                      )
                    ) : (
                      <div className="w-8" />
                    )}
                  </div>
                )}

                <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                  {/* Sender name */}
                  {!isOwn && showSender && (
                    <span
                      className="text-xs font-medium mb-1 px-1"
                      style={{ color: "var(--accent-light)" }}
                    >
                      {msg.sender?.username || msg.sender_username || "Unknown"}
                    </span>
                  )}

                  {/* Message bubble with action buttons */}
                  <div className="relative group">
                    {/* Action buttons on hover */}
                    {isHovered && !isDeleted && !isEditing && (
                      <div
                        className={`absolute -top-8 flex gap-0.5 p-0.5 rounded-lg shadow-lg z-10 ${isOwn ? "right-0" : "left-0"}`}
                        style={{
                          backgroundColor: "var(--bg-tertiary)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {/* React button */}
                        <button
                          onClick={() => setEmojiPickerMessageId(emojiPickerMessageId === msg.id ? null : msg.id)}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 cursor-pointer transition-colors text-xs"
                          title="React"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-secondary)" }}>
                            <circle cx="12" cy="12" r="10" />
                            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                            <line x1="9" y1="9" x2="9.01" y2="9" />
                            <line x1="15" y1="9" x2="15.01" y2="9" />
                          </svg>
                        </button>
                        {/* Edit button (own messages only) */}
                        {isOwn && (
                          <button
                            onClick={() => startEdit(msg)}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 cursor-pointer transition-colors text-xs"
                            title="Edit"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-secondary)" }}>
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        )}
                        {/* Delete button (own messages only) */}
                        {isOwn && (
                          <button
                            onClick={() => handleDelete(msg.id)}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 cursor-pointer transition-colors text-xs"
                            title={confirmDeleteId === msg.id ? "Click again to confirm" : "Delete"}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: confirmDeleteId === msg.id ? "var(--error, #ef4444)" : "var(--text-secondary)" }}>
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Emoji picker */}
                    {emojiPickerMessageId === msg.id && (
                      <EmojiPicker
                        onSelect={(emoji) => onReaction(msg.id, emoji)}
                        onClose={() => setEmojiPickerMessageId(null)}
                      />
                    )}

                    {/* Message bubble */}
                    {isEditing ? (
                      <div
                        className="px-4 py-2.5 rounded-2xl text-sm"
                        style={{
                          backgroundColor: isOwn ? "var(--message-own)" : "var(--message-other)",
                          borderBottomRightRadius: isOwn ? "6px" : undefined,
                          borderBottomLeftRadius: !isOwn ? "6px" : undefined,
                        }}
                      >
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full bg-transparent resize-none outline-none text-sm leading-relaxed"
                          style={{ color: "var(--text-primary)", minHeight: "40px" }}
                          rows={2}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(msg.id); }
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => saveEdit(msg.id)}
                            className="text-xs px-2 py-1 rounded cursor-pointer transition-colors"
                            style={{ backgroundColor: "var(--accent)", color: "white" }}
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-xs px-2 py-1 rounded cursor-pointer transition-colors"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words"
                        style={{
                          backgroundColor: isOwn
                            ? "var(--message-own)"
                            : "var(--message-other)",
                          color: isDeleted ? "var(--text-secondary)" : "var(--text-primary)",
                          borderBottomRightRadius: isOwn ? "6px" : undefined,
                          borderBottomLeftRadius: !isOwn ? "6px" : undefined,
                          opacity: isDeleted ? 0.6 : 1,
                        }}
                      >
                        {isDeleted ? (
                          <p className="whitespace-pre-wrap italic">[Message deleted]</p>
                        ) : (
                          <>
                            {msg.content && (
                              <p className="whitespace-pre-wrap">
                                {msg.content}
                                {msg.is_edited && (
                                  <span
                                    className="text-[10px] ml-1.5 italic"
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    (edited)
                                  </span>
                                )}
                              </p>
                            )}

                            {/* File attachment */}
                            {msg.file_url && (
                              <div className="mt-2">
                                {isImageUrl(msg.file_url) ? (
                                  <img
                                    src={msg.file_url}
                                    alt={msg.file_name || "Image"}
                                    className="max-w-full rounded-lg max-h-64 object-contain"
                                  />
                                ) : (
                                  <a
                                    href={msg.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors"
                                    style={{
                                      backgroundColor: "rgba(0,0,0,0.2)",
                                      color: "var(--accent-light)",
                                    }}
                                  >
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
                                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                      <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                    {msg.file_name || "Download file"}
                                  </a>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Reactions display */}
                  {grouped.length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1 px-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                      {grouped.map((g) => {
                        const hasReacted = user ? g.userIds.includes(user.id) : false;
                        return (
                          <button
                            key={g.emoji}
                            onClick={() => onReaction(msg.id, g.emoji)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-colors"
                            style={{
                              backgroundColor: hasReacted ? "var(--accent)" : "var(--bg-tertiary)",
                              color: hasReacted ? "white" : "var(--text-secondary)",
                              border: `1px solid ${hasReacted ? "var(--accent)" : "var(--border)"}`,
                            }}
                          >
                            <span>{g.emoji}</span>
                            <span>{g.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Timestamp + read receipt */}
                  <div className="flex items-center gap-1 mt-0.5 px-1">
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {formatRelativeTime(msg.created_at)}
                    </span>
                    {isOwn && <ReadReceipt sent={true} read={false} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <TypingIndicator typingUsers={typingUsers} />
      <div ref={bottomRef} />
    </div>
  );
}
