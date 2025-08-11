// Main exports
export { WhatsAppClient } from './whatsapp-client';

// Auth exports
export {
  BaseAuthStrategy,
  DatabaseAuthStrategy,
  FileAuthStrategy,
  AuthStrategyFactory
} from './auth';

// Connection exports
export {
  ConnectionStateManager,
  ReconnectionManager
} from './connection';

// Messaging exports
export {
  MessageManager,
  type MessageContent,
  type MessageOptions,
  type QueuedMessage,
  type MessageEventType,
  type MessageListener
} from './messaging';

// Type exports
export type {
  WhatsAppSession,
  WhatsAppStatus,
  AuthStrategy,
  AuthConfig,
  SessionData,
  ConnectionConfig,
  PairingCodeOptions,
  WhatsAppConnectionEvent,
  PresenceUpdate,
  PresenceManager,
  WhatsAppMessage,
  MessageType,
  WhatsAppLogger,
  EnvironmentConfig,
  HealthCheckResponse,
  WhatsAppApiResponse,
  WhatsAppStats,
  WebSocketManager,
  StateManager,
  WhatsAppError,
  LibraryConfig,
  WhatsAppConfig
} from './types';

// Import types for internal use
import type { AuthStrategy, WhatsAppConfig } from './types';
import { WhatsAppClient } from './whatsapp-client';

// Error exports
export {
  WhatsAppConnectionError,
  WhatsAppAuthError
} from './types';

// Utility functions for common operations
export const createWhatsAppConfig = (
  authStrategy: AuthStrategy = 'database',
  options: Partial<WhatsAppConfig> = {}
): WhatsAppConfig => {
  return {
    auth: {
      strategy: authStrategy,
      clientId: options.auth?.clientId || 'whatsapp-client',
      dataPath: options.auth?.dataPath || './whatsapp-session',
      restartOnAuthFail: options.auth?.restartOnAuthFail ?? true,
      backupSyncIntervalMs: options.auth?.backupSyncIntervalMs || 300000,
      rmMaxRetries: options.auth?.rmMaxRetries || 3,
      ...options.auth
    },
    connection: {
      takeoverOnConflict: options.connection?.takeoverOnConflict ?? false,
      takeoverTimeoutMs: options.connection?.takeoverTimeoutMs || 30000,
      qrMaxRetries: options.connection?.qrMaxRetries || 5,
      authTimeoutMs: options.connection?.authTimeoutMs || 60000,
      reconnectIntervalMs: options.connection?.reconnectIntervalMs || 5000,
      heartbeatIntervalMs: options.connection?.heartbeatIntervalMs || 30000,
      maxReconnectAttempts: options.connection?.maxReconnectAttempts || 10,
      userAgent: options.connection?.userAgent,
      bypassCSP: options.connection?.bypassCSP ?? true,
      ...options.connection
    },
    puppeteer: options.puppeteer || {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    },
    logger: options.logger || {
      level: 'info',
      enableConsole: true,
      enableFile: false
    },
    environment: options.environment || 'development',
    library: options.library || {
      library: 'whatsapp-web.js',
      options: {
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        syncFullHistory: false
      }
    }
  };
};

// Helper function to create a basic WhatsApp client
export const createWhatsAppClient = (
  config?: Partial<WhatsAppConfig>,
  userId?: string,
  supabaseClient?: any
): WhatsAppClient => {
  const fullConfig = createWhatsAppConfig('database', config);
  return new WhatsAppClient(fullConfig, userId, supabaseClient);
};

// Constants
export const WHATSAPP_EVENTS = {
  QR_GENERATED: 'qr_generated',
  PAIRING_CODE_GENERATED: 'pairing_code_generated',
  AUTHENTICATED: 'authenticated',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
  STATE_CHANGED: 'state_changed',
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_SENT: 'message_sent',
  PRESENCE_UPDATE: 'presence_update',
  CONNECTION_LOST: 'connection_lost',
  RECONNECTING: 'reconnecting',
  TAKEOVER_REQUIRED: 'takeover_required'
} as const;

export const WHATSAPP_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  WAITING_QR: 'waiting_qr',
  CONNECTED: 'connected',
  ERROR: 'error',
  CONFLICT: 'conflict',
  DEPRECATED_VERSION: 'deprecated_version',
  OPENING: 'opening',
  PAIRING: 'pairing',
  PROXYBLOCK: 'proxyblock',
  SMB_TOS_BLOCK: 'smb_tos_block',
  TIMEOUT: 'timeout',
  TOS_BLOCK: 'tos_block',
  UNLAUNCHED: 'unlaunched',
  UNPAIRED: 'unpaired',
  UNPAIRED_IDLE: 'unpaired_idle'
} as const;

export const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  STICKER: 'sticker',
  LOCATION: 'location',
  CONTACT: 'contact',
  POLL: 'poll',
  REACTION: 'reaction',
  SYSTEM: 'system'
} as const;
