export { ConnectionStateManager } from './connection-state-manager';
export { ReconnectionManager, type ReconnectionEvent, type ReconnectionStrategy, RECONNECTION_STRATEGIES } from './reconnection-manager';

// Re-export types for convenience
export type {
  ConnectionConfig,
  WhatsAppStatus,
  WhatsAppConnectionEvent
} from '../types';
