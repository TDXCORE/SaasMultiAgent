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
  // New fields for enhanced auth
  auth_strategy: AuthStrategy;
  session_data: SessionData | null;
  browser_id: string | null;
  client_token: string | null;
  server_token: string | null;
  enc_key: string | null;
  mac_key: string | null;
  pairing_code: string | null;
  pairing_code_expires_at: string | null;
}

// Enhanced WhatsApp states based on whatsapp-web.js
export type WhatsAppStatus = 
  | 'disconnected' 
  | 'connecting' 
  | 'waiting_qr' 
  | 'connected' 
  | 'error'
  | 'conflict'
  | 'deprecated_version'
  | 'opening'
  | 'pairing'
  | 'proxyblock'
  | 'smb_tos_block'
  | 'timeout'
  | 'tos_block'
  | 'unlaunched'
  | 'unpaired'
  | 'unpaired_idle';

// Authentication strategies
export type AuthStrategy = 'local' | 'remote' | 'database' | 'no_auth';

export interface AuthConfig {
  strategy: AuthStrategy;
  clientId?: string;
  dataPath?: string;
  restartOnAuthFail?: boolean;
  backupSyncIntervalMs?: number;
  rmMaxRetries?: number;
}

export interface SessionData {
  WABrowserId?: string;
  WASecretBundle?: string;
  WAToken1?: string;
  WAToken2?: string;
  // For multi-device sessions
  creds?: any;
  keys?: any;
}

// Connection configuration
export interface ConnectionConfig {
  takeoverOnConflict: boolean;
  takeoverTimeoutMs: number;
  qrMaxRetries: number;
  authTimeoutMs: number;
  reconnectIntervalMs: number;
  heartbeatIntervalMs: number;
  maxReconnectAttempts: number;
  userAgent?: string;
  bypassCSP?: boolean;
}

// Pairing code options
export interface PairingCodeOptions {
  phoneNumber: string;
  showNotification?: boolean;
  expirationMinutes?: number;
}

// Enhanced connection events
export interface WhatsAppConnectionEvent {
  type: 'qr_generated' 
      | 'pairing_code_generated'
      | 'authenticated' 
      | 'disconnected' 
      | 'error'
      | 'state_changed'
      | 'message_received'
      | 'message_sent'
      | 'presence_update'
      | 'connection_lost'
      | 'reconnecting'
      | 'takeover_required';
  qr?: string;
  pairing_code?: string;
  phone_number?: string;
  error?: string;
  user_id: string;
  state?: WhatsAppStatus;
  timestamp: number;
  data?: any;
}

// Presence management
export interface PresenceUpdate {
  jid: string;
  presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused';
  lastSeen?: number;
}

export interface PresenceManager {
  sendPresenceAvailable(): Promise<void>;
  sendPresenceUnavailable(): Promise<void>;
  subscribeToPresence(jid: string): Promise<void>;
  unsubscribeFromPresence(jid: string): Promise<void>;
}

// Message types
export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  body?: string;
  type: MessageType;
  timestamp: number;
  fromMe: boolean;
  hasMedia: boolean;
  mediaUrl?: string;
  caption?: string;
  quotedMessage?: WhatsAppMessage;
  mentions?: string[];
  isForwarded: boolean;
  isStatus: boolean;
}

export type MessageType = 
  | 'text' 
  | 'image' 
  | 'video' 
  | 'audio' 
  | 'document' 
  | 'sticker'
  | 'location'
  | 'contact'
  | 'poll'
  | 'reaction'
  | 'system';

// Logging configuration
export interface WhatsAppLogger {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  maxFileSize?: number;
  maxFiles?: number;
}

// Environment-specific configuration
export interface EnvironmentConfig {
  development: {
    qrInTerminal: boolean;
    logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    autoReconnect: boolean;
    enableDebugLogs: boolean;
  };
  production: {
    qrInTerminal: boolean;
    logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    autoReconnect: boolean;
    healthCheckInterval: number;
    enableMetrics: boolean;
  };
}

// Health check response
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  uptime: number;
  lastSeen: number;
  connectionState: WhatsAppStatus;
  messagesProcessed: number;
  errors: number;
  memoryUsage?: {
    used: number;
    total: number;
  };
}

// Enhanced API response
export interface WhatsAppApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: number;
  requestId?: string;
}

// Enhanced stats
export interface WhatsAppStats {
  messages_sent: number;
  messages_received: number;
  last_activity: string | null;
  connected_since: string | null;
  reconnection_count: number;
  qr_scans: number;
  errors_count: number;
  uptime_seconds: number;
}

// WebSocket manager interface
export interface WebSocketManager {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  send(data: any): Promise<void>;
  on(event: string, callback: Function): void;
  off(event: string, callback: Function): void;
  getConnectionState(): WhatsAppStatus;
}

// State manager interface
export interface StateManager {
  getCurrentState(): WhatsAppStatus;
  setState(state: WhatsAppStatus): void;
  onStateChange(callback: (state: WhatsAppStatus) => void): void;
  canTransitionTo(newState: WhatsAppStatus): boolean;
}

// Error types
export interface WhatsAppError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
  recoverable: boolean;
}

export class WhatsAppConnectionError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = true,
    public details?: any
  ) {
    super(message);
    this.name = 'WhatsAppConnectionError';
  }
}

export class WhatsAppAuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'WhatsAppAuthError';
  }
}

// Configuration for different WhatsApp libraries
export interface LibraryConfig {
  library: 'whatsapp-web.js' | 'baileys';
  options: {
    puppeteer?: any;
    browser?: any;
    printQRInTerminal?: boolean;
    markOnlineOnConnect?: boolean;
    syncFullHistory?: boolean;
    getMessage?: Function;
    cachedGroupMetadata?: Function;
  };
}

// Main WhatsApp configuration
export interface WhatsAppConfig {
  auth: AuthConfig;
  connection: ConnectionConfig;
  puppeteer?: any;
  logger?: WhatsAppLogger;
  environment?: keyof EnvironmentConfig;
  library?: LibraryConfig;
}
