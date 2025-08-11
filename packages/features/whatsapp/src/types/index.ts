export interface WhatsAppSession {
  id: string;
  user_id: string;
  phone_number: string | null;
  session_status: WhatsAppStatus;
  qr_code: string | null;
  connected_at: string | null;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export type WhatsAppStatus = 
  | 'disconnected' 
  | 'connecting' 
  | 'waiting_qr' 
  | 'connected' 
  | 'error';

export interface WhatsAppConnectionEvent {
  type: 'qr_generated' | 'authenticated' | 'disconnected' | 'error';
  qr?: string;
  phone_number?: string;
  error?: string;
  user_id: string;
}

export interface WhatsAppApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface WhatsAppStats {
  messages_sent: number;
  messages_received: number;
  last_activity: string | null;
  connected_since: string | null;
}