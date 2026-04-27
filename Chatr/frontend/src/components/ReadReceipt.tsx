"use client";

interface ReadReceiptProps {
  sent: boolean;
  read: boolean;
}

export default function ReadReceipt({ sent, read }: ReadReceiptProps) {
  return (
    <span
      className="inline-flex items-center ml-1"
      style={{ color: read ? "var(--accent-light)" : "var(--text-secondary)" }}
      title={read ? "Read" : "Sent"}
    >
      {read ? (
        <svg width="16" height="12" viewBox="0 0 24 16" fill="none">
          <path
            d="M1 8L6 13L14 3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 8L13 13L21 3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : sent ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 8L6 12L14 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}
