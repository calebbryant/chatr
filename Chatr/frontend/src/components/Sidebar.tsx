"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Room, User } from "@/types";
import { getRooms, searchUsers, getOrCreateDM } from "@/lib/api";
import CreateRoomModal from "./CreateRoomModal";

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const fetchRooms = useCallback(async () => {
    try {
      const data = await getRooms();
      setRooms(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchUsers(searchQuery.trim());
        setSearchResults(results.filter((u) => u.id !== user?.id));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, user?.id]);

  async function handleStartDM(otherUser: User) {
    try {
      const room = await getOrCreateDM(otherUser.id);
      setSearchQuery("");
      setSearchResults([]);
      setRooms((prev) => {
        if (prev.some((r) => r.id === room.id)) return prev;
        return [...prev, room];
      });
      setMobileOpen(false);
      window.location.href = `/chat/${room.id}`;
    } catch {
      // silent
    }
  }

  const groupRooms = rooms.filter((r) => !r.is_direct);
  const dmRooms = rooms.filter((r) => r.is_direct);

  function getDMName(room: Room): string {
    if (!user) return room.name;
    const other = room.members?.find((m) => m.id !== user.id);
    return other?.username || room.name;
  }

  function isActive(roomId: string) {
    return pathname === `/chat/${roomId}`;
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* User info */}
      <div
        className="p-4 border-b flex items-center gap-3"
        style={{ borderColor: "var(--border)" }}
      >
        {user?.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.username}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {user ? getInitial(user.username) : "?"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {user?.username}
          </p>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--success)" }}
            />
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Online
            </span>
          </div>
        </div>
        <button
          onClick={logout}
          className="p-2 rounded-lg transition-colors cursor-pointer"
          style={{ color: "var(--text-secondary)" }}
          title="Logout"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>

      {/* Search users */}
      <div className="p-3">
        <div className="relative">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-secondary)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm"
            style={{
              backgroundColor: "var(--bg-input)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
        </div>

        {/* Search results */}
        {(searchResults.length > 0 || searching) && (
          <div
            className="mt-2 rounded-lg overflow-hidden"
            style={{
              backgroundColor: "var(--bg-input)",
              border: "1px solid var(--border)",
            }}
          >
            {searching && (
              <p
                className="px-3 py-2 text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                Searching...
              </p>
            )}
            {searchResults.map((u) => (
              <button
                key={u.id}
                onClick={() => handleStartDM(u)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer transition-colors"
                style={{ color: "var(--text-primary)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--bg-tertiary)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {getInitial(u.username)}
                </div>
                <span className="text-sm truncate">{u.username}</span>
                {u.is_online && (
                  <span
                    className="w-2 h-2 rounded-full ml-auto flex-shrink-0"
                    style={{ backgroundColor: "var(--success)" }}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable room lists */}
      <div className="flex-1 overflow-y-auto">
        {/* Rooms section */}
        <div className="px-3 pt-2 pb-1">
          <div className="flex items-center justify-between mb-2">
            <h3
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-secondary)" }}
            >
              Rooms
            </h3>
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-1 rounded transition-colors cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
              title="Create room"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          {groupRooms.length === 0 && (
            <p className="text-xs px-2 py-1" style={{ color: "var(--text-secondary)" }}>
              No rooms yet
            </p>
          )}

          {groupRooms.map((room) => (
            <Link
              key={room.id}
              href={`/chat/${room.id}`}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg mb-0.5 transition-colors no-underline"
              style={{
                backgroundColor: isActive(room.id)
                  ? "var(--bg-tertiary)"
                  : "transparent",
                color: isActive(room.id)
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              }}
              onMouseEnter={(e) => {
                if (!isActive(room.id))
                  e.currentTarget.style.backgroundColor = "var(--bg-input)";
              }}
              onMouseLeave={(e) => {
                if (!isActive(room.id))
                  e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                #
              </span>
              <span className="text-sm truncate">{room.name}</span>
            </Link>
          ))}
        </div>

        {/* DMs section */}
        <div className="px-3 pt-4 pb-1">
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Direct Messages
          </h3>

          {dmRooms.length === 0 && (
            <p className="text-xs px-2 py-1" style={{ color: "var(--text-secondary)" }}>
              No conversations yet
            </p>
          )}

          {dmRooms.map((room) => {
            const name = getDMName(room);
            return (
              <Link
                key={room.id}
                href={`/chat/${room.id}`}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg mb-0.5 transition-colors no-underline"
                style={{
                  backgroundColor: isActive(room.id)
                    ? "var(--bg-tertiary)"
                    : "transparent",
                  color: isActive(room.id)
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive(room.id))
                    e.currentTarget.style.backgroundColor = "var(--bg-input)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive(room.id))
                    e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {getInitial(name)}
                </div>
                <span className="text-sm truncate">{name}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(room) => {
            setRooms((prev) => [...prev, room]);
          }}
        />
      )}
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-3 left-3 z-50 p-2 rounded-lg md:hidden cursor-pointer"
        style={{
          backgroundColor: "var(--bg-secondary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {mobileOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:relative z-40 h-full w-[300px] flex-shrink-0 transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
