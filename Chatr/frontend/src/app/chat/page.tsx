"use client";

export default function ChatPage() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center px-4">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ color: "var(--accent)" }}
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h2
          className="text-xl font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Welcome to Chatr
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Select a conversation to start chatting
        </p>
      </div>
    </div>
  );
}
