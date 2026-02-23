export type AgentMessageType =
  | 'broadcast'
  | 'broadcast-all'
  | 'direct-message'
  | 'request-help'
  | 'accept-task';

export interface BaseAgentMessageEnvelope {
  messageId: string;
  type: AgentMessageType;
  senderId: string;
  payload: unknown;
  timestamp: string;
}

export interface BroadcastMessageEnvelope extends BaseAgentMessageEnvelope {
  topic: string;
}

export interface DirectMessageEnvelope extends BaseAgentMessageEnvelope {
  targetId: string;
}

export interface BroadcastAllMessageEnvelope extends BaseAgentMessageEnvelope {
  includeSender?: boolean;
}

export interface MessagingAck {
  success: boolean;
  status: 'accepted' | 'rejected';
  semantics: 'accepted-for-routing-only';
  code?:
    | 'UNAUTHORIZED'
    | 'INVALID_PAYLOAD'
    | 'PAYLOAD_TOO_LARGE'
    | 'RATE_LIMITED'
    | 'TARGET_OFFLINE'
    | 'FRIENDSHIP_REQUIRED';
  error?: string;
  messageId?: string;
}
