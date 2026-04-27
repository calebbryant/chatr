export interface User {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  is_online: boolean;
  auth_provider: string;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  description: string | null;
  is_direct: boolean;
  created_by: string;
  created_at: string;
  members: User[];
}

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  username: string | null;
  emoji: string;
  created_at: string;
}

export interface Message {
  id: string;
  content: string;
  room_id: string;
  sender_id: string;
  sender: User;
  sender_username?: string;
  file_url: string | null;
  file_name: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  reactions: Reaction[];
  created_at: string;
}

export interface ReadReceipt {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string;
}

export interface TypingIndicator {
  room_id: string;
  user_id: string;
  username: string;
  is_typing: boolean;
}

export interface WebSocketMessage {
  type: "message" | "typing" | "read_receipt" | "user_joined" | "user_left" | "message_edited" | "message_deleted" | "reaction_added" | "reaction_removed";
  data: any;
}
