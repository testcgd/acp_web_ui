// ACP WebSocket message types

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string };

export interface ToolCall {
  title: string;
  description?: string;
  input?: unknown;
  name?: string;
}

export interface PermissionRequest {
  requestId: string;
  sessionId: string;
  options: { title: string; description?: string }[];
  toolCall: ToolCall;
}

// Server → Client message payloads
export interface StatusPayload {
  connected: boolean;
  agentInfo?: { name: string; version: string };
  capabilities?: unknown;
}

export interface SessionCreatedPayload {
  sessionId: string;
  promptCapabilities?: { image?: boolean };
  models?: ModelState;
}

export interface SessionUpdatePayload {
  sessionId: string;
  updates: SessionUpdate[];
}

export interface SessionUpdate {
  type: string;
  [key: string]: unknown;
}

export interface ModelState {
  selected?: string;
  available?: string[];
}

export interface DirItem {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
}

// Chat message stored locally
export type MessageRole = 'user' | 'assistant' | 'tool' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  toolCall?: {
    title: string;
    input?: unknown;
  };
  toolResult?: {
    status: 'pending' | 'allowed' | 'denied' | 'cancelled';
    output?: string;
  };
  isThinking?: boolean;
  stopReason?: string;
}

// Session stored in UI
export type SessionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Session {
  id: string;           // local UUID
  name: string;
  wsUrl: string;
  token: string;
  messages: ChatMessage[];
  status: SessionStatus;
  agentInfo?: { name: string; version: string };
  sessionId?: string;   // ACP session ID from server
  createdAt: number;
  models?: ModelState;
  cwd?: string;
}

export interface ConnectionConfig {
  wsUrl: string;
  token: string;
}
