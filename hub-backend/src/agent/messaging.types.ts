export type AgentMessageType =
  | 'broadcast'
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

export interface MessagingAck {
  success: boolean;
  status: 'accepted' | 'rejected';
  semantics: 'accepted-for-routing-only';
  code?:
    | 'UNAUTHORIZED'
    | 'INVALID_PAYLOAD'
    | 'PAYLOAD_TOO_LARGE'
    | 'RATE_LIMITED'
    | 'TARGET_OFFLINE';
  error?: string;
  messageId?: string;
}
