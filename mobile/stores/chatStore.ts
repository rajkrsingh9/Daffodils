import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  type: 'TEXT' | 'IMAGE' | 'LOCATION' | 'SYSTEM';
  body: string | null;
  mediaUrl: string | null;
  lat: number | null;
  lng: number | null;
  readAt: string | null;
  createdAt: string;
  sender?: { id: string; name: string; username: string; avatarUrl: string | null };
  /** Set on optimistic sends until the server echoes the real row back. */
  pending?: boolean;
  failed?: boolean;
}

interface ChatState {
  messagesByRoom: Record<string, ChatMessage[]>;
  typingByRoom: Record<string, boolean>;
  unreadTotal: number;

  setMessages: (roomId: string, messages: ChatMessage[]) => void;
  prependMessages: (roomId: string, messages: ChatMessage[]) => void;
  addMessage: (roomId: string, message: ChatMessage) => void;
  replaceMessage: (roomId: string, tempId: string, message: ChatMessage) => void;
  markFailed: (roomId: string, tempId: string) => void;
  setTyping: (roomId: string, typing: boolean) => void;
  setUnreadTotal: (n: number) => void;
  clearRoom: (roomId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messagesByRoom: {},
  typingByRoom: {},
  unreadTotal: 0,

  setMessages: (roomId, messages) =>
    set((s) => ({ messagesByRoom: { ...s.messagesByRoom, [roomId]: messages } })),

  prependMessages: (roomId, messages) =>
    set((s) => ({
      messagesByRoom: {
        ...s.messagesByRoom,
        [roomId]: [...messages, ...(s.messagesByRoom[roomId] ?? [])],
      },
    })),

  addMessage: (roomId, message) =>
    set((s) => {
      const existing = s.messagesByRoom[roomId] ?? [];
      // The sender receives their own message back over the socket; without
      // this guard it would render twice.
      if (existing.some((m) => m.id === message.id)) return s;
      return { messagesByRoom: { ...s.messagesByRoom, [roomId]: [...existing, message] } };
    }),

  replaceMessage: (roomId, tempId, message) =>
    set((s) => ({
      messagesByRoom: {
        ...s.messagesByRoom,
        [roomId]: (s.messagesByRoom[roomId] ?? []).map((m) =>
          m.id === tempId ? message : m
        ),
      },
    })),

  markFailed: (roomId, tempId) =>
    set((s) => ({
      messagesByRoom: {
        ...s.messagesByRoom,
        [roomId]: (s.messagesByRoom[roomId] ?? []).map((m) =>
          m.id === tempId ? { ...m, pending: false, failed: true } : m
        ),
      },
    })),

  setTyping: (roomId, typing) =>
    set((s) => ({ typingByRoom: { ...s.typingByRoom, [roomId]: typing } })),

  setUnreadTotal: (n) => set({ unreadTotal: n }),

  clearRoom: (roomId) =>
    set((s) => {
      const next = { ...s.messagesByRoom };
      delete next[roomId];
      return { messagesByRoom: next };
    }),
}));
