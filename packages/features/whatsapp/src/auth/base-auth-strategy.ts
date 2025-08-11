import { AuthConfig, SessionData, WhatsAppAuthError } from '../types';

/**
 * Base authentication strategy interface
 * All auth strategies must implement this interface
 */
export abstract class BaseAuthStrategy {
  protected config: AuthConfig;
  protected clientId: string;

  constructor(config: AuthConfig) {
    this.config = config;
    this.clientId = config.clientId || this.generateClientId();
  }

  /**
   * Initialize the authentication strategy
   */
  abstract initialize(): Promise<void>;

  /**
   * Save session data
   */
  abstract saveSession(sessionData: SessionData): Promise<void>;

  /**
   * Load session data
   */
  abstract loadSession(): Promise<SessionData | null>;

  /**
   * Clear session data
   */
  abstract clearSession(): Promise<void>;

  /**
   * Check if session exists
   */
  abstract hasSession(): Promise<boolean>;

  /**
   * Handle authentication failure
   */
  abstract onAuthFailure(error: Error): Promise<{
    shouldRestart: boolean;
    shouldClearSession: boolean;
  }>;

  /**
   * Cleanup resources
   */
  abstract cleanup(): Promise<void>;

  /**
   * Validate session data
   */
  protected validateSessionData(sessionData: SessionData): boolean {
    if (!sessionData) return false;

    // For legacy sessions
    if (sessionData.WABrowserId && sessionData.WASecretBundle && 
        sessionData.WAToken1 && sessionData.WAToken2) {
      return true;
    }

    // For multi-device sessions
    if (sessionData.creds && sessionData.keys) {
      return true;
    }

    return false;
  }

  /**
   * Generate unique client ID
   */
  protected generateClientId(): string {
    return `whatsapp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle session corruption
   */
  protected async handleCorruptedSession(error: Error): Promise<void> {
    console.warn('Session corrupted, clearing:', error.message);
    await this.clearSession();
    
    if (this.config.restartOnAuthFail) {
      throw new WhatsAppAuthError(
        'Session corrupted and cleared',
        'SESSION_CORRUPTED',
        { originalError: error.message }
      );
    }
  }

  /**
   * Backup session data (for strategies that support it)
   */
  protected async backupSession(sessionData: SessionData): Promise<void> {
    // Override in strategies that support backup
  }

  /**
   * Restore session from backup
   */
  protected async restoreFromBackup(): Promise<SessionData | null> {
    // Override in strategies that support backup
    return null;
  }
}
