export { BaseAuthStrategy } from './base-auth-strategy';
export { DatabaseAuthStrategy } from './database-auth-strategy';
export { FileAuthStrategy } from './file-auth-strategy';
export { AuthStrategyFactory } from './auth-strategy-factory';

// Re-export types for convenience
export type {
  AuthConfig,
  AuthStrategy,
  SessionData,
  WhatsAppAuthError
} from '../types';
