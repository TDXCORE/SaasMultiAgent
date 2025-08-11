import { BaseAuthStrategy } from './base-auth-strategy';
import { AuthConfig, SessionData, WhatsAppAuthError } from '../types';

/**
 * Database authentication strategy using Supabase
 * Stores session data in the database for persistence across deployments
 */
export class DatabaseAuthStrategy extends BaseAuthStrategy {
  private userId: string;
  private supabaseClient: any; // Will be injected

  constructor(config: AuthConfig, userId: string, supabaseClient: any) {
    super(config);
    this.userId = userId;
    this.supabaseClient = supabaseClient;
  }

  async initialize(): Promise<void> {
    if (!this.supabaseClient) {
      throw new WhatsAppAuthError(
        'Supabase client not provided',
        'MISSING_SUPABASE_CLIENT'
      );
    }

    if (!this.userId) {
      throw new WhatsAppAuthError(
        'User ID not provided',
        'MISSING_USER_ID'
      );
    }

    // Ensure the session record exists
    await this.ensureSessionRecord();
  }

  async saveSession(sessionData: SessionData): Promise<void> {
    try {
      if (!this.validateSessionData(sessionData)) {
        throw new WhatsAppAuthError(
          'Invalid session data provided',
          'INVALID_SESSION_DATA'
        );
      }

      const { error } = await this.supabaseClient
        .from('whatsapp_sessions')
        .update({
          session_data: sessionData,
          auth_strategy: 'database',
          browser_id: sessionData.WABrowserId || null,
          client_token: sessionData.WAToken1 || null,
          server_token: sessionData.WAToken2 || null,
          enc_key: sessionData.WASecretBundle || null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', this.userId);

      if (error) {
        throw new WhatsAppAuthError(
          `Failed to save session: ${error.message}`,
          'DATABASE_SAVE_ERROR',
          error
        );
      }

      // Create backup if configured
      if (this.config.backupSyncIntervalMs) {
        await this.backupSession(sessionData);
      }

    } catch (error) {
      if (error instanceof WhatsAppAuthError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new WhatsAppAuthError(
        `Database save failed: ${errorMessage}`,
        'DATABASE_ERROR',
        error
      );
    }
  }

  async loadSession(): Promise<SessionData | null> {
    try {
      const { data, error } = await this.supabaseClient
        .from('whatsapp_sessions')
        .select('session_data, browser_id, client_token, server_token, enc_key, mac_key')
        .eq('user_id', this.userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No session found
          return null;
        }
        throw new WhatsAppAuthError(
          `Failed to load session: ${error.message}`,
          'DATABASE_LOAD_ERROR',
          error
        );
      }

      if (!data) {
        return null;
      }

      // Try to load from session_data field first (new format)
      if (data.session_data && this.validateSessionData(data.session_data)) {
        return data.session_data;
      }

      // Fallback to legacy fields
      if (data.browser_id && data.client_token && data.server_token && data.enc_key) {
        return {
          WABrowserId: data.browser_id,
          WAToken1: data.client_token,
          WAToken2: data.server_token,
          WASecretBundle: data.enc_key
        };
      }

      return null;

    } catch (error) {
      if (error instanceof WhatsAppAuthError) {
        throw error;
      }

      // Try to restore from backup
      const backupSession = await this.restoreFromBackup();
      if (backupSession) {
        console.warn('Restored session from backup after database error');
        return backupSession;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new WhatsAppAuthError(
        `Database load failed: ${errorMessage}`,
        'DATABASE_ERROR',
        error
      );
    }
  }

  async clearSession(): Promise<void> {
    try {
      const { error } = await this.supabaseClient
        .from('whatsapp_sessions')
        .update({
          session_data: null,
          browser_id: null,
          client_token: null,
          server_token: null,
          enc_key: null,
          mac_key: null,
          session_status: 'disconnected',
          qr_code: null,
          pairing_code: null,
          pairing_code_expires_at: null,
          connected_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', this.userId);

      if (error) {
        throw new WhatsAppAuthError(
          `Failed to clear session: ${error.message}`,
          'DATABASE_CLEAR_ERROR',
          error
        );
      }

    } catch (error) {
      if (error instanceof WhatsAppAuthError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new WhatsAppAuthError(
        `Database clear failed: ${errorMessage}`,
        'DATABASE_ERROR',
        error
      );
    }
  }

  async hasSession(): Promise<boolean> {
    try {
      const sessionData = await this.loadSession();
      return sessionData !== null && this.validateSessionData(sessionData);
    } catch (error) {
      console.warn('Error checking session existence:', error);
      return false;
    }
  }

  async onAuthFailure(error: Error): Promise<{
    shouldRestart: boolean;
    shouldClearSession: boolean;
  }> {
    console.error('Authentication failed:', error.message);

    // Update session status in database
    try {
      await this.supabaseClient
        .from('whatsapp_sessions')
        .update({
          session_status: 'error',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', this.userId);
    } catch (dbError) {
      console.warn('Failed to update session status:', dbError);
    }

    // Determine recovery strategy
    const isRecoverableError = this.isRecoverableAuthError(error);
    
    if (!isRecoverableError) {
      await this.clearSession();
      return {
        shouldRestart: this.config.restartOnAuthFail || false,
        shouldClearSession: true
      };
    }

    return {
      shouldRestart: this.config.restartOnAuthFail || false,
      shouldClearSession: false
    };
  }

  async cleanup(): Promise<void> {
    // Update final status
    try {
      await this.supabaseClient
        .from('whatsapp_sessions')
        .update({
          session_status: 'disconnected',
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', this.userId);
    } catch (error) {
      console.warn('Failed to update final session status:', error);
    }
  }

  /**
   * Backup session to a separate table or storage
   */
  protected async backupSession(sessionData: SessionData): Promise<void> {
    try {
      const { error } = await this.supabaseClient
        .from('whatsapp_session_backups')
        .upsert({
          user_id: this.userId,
          session_data: sessionData,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.warn('Failed to backup session:', error);
      }
    } catch (error) {
      console.warn('Backup failed:', error);
    }
  }

  /**
   * Restore session from backup
   */
  protected async restoreFromBackup(): Promise<SessionData | null> {
    try {
      const { data, error } = await this.supabaseClient
        .from('whatsapp_session_backups')
        .select('session_data')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return data.session_data;
    } catch (error) {
      console.warn('Failed to restore from backup:', error);
      return null;
    }
  }

  /**
   * Ensure session record exists in database
   */
  private async ensureSessionRecord(): Promise<void> {
    try {
      const { data, error } = await this.supabaseClient
        .from('whatsapp_sessions')
        .select('id')
        .eq('user_id', this.userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Create new session record
        const { error: insertError } = await this.supabaseClient
          .from('whatsapp_sessions')
          .insert({
            user_id: this.userId,
            session_status: 'disconnected',
            auth_strategy: 'database',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (insertError) {
          throw new WhatsAppAuthError(
            `Failed to create session record: ${insertError.message}`,
            'DATABASE_INSERT_ERROR',
            insertError
          );
        }
      } else if (error) {
        throw new WhatsAppAuthError(
          `Failed to check session record: ${error.message}`,
          'DATABASE_CHECK_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof WhatsAppAuthError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new WhatsAppAuthError(
        `Database initialization failed: ${errorMessage}`,
        'DATABASE_ERROR',
        error
      );
    }
  }

  /**
   * Check if authentication error is recoverable
   */
  private isRecoverableAuthError(error: Error): boolean {
    const recoverableErrors = [
      'TIMEOUT',
      'NETWORK_ERROR',
      'TEMPORARY_FAILURE',
      'RATE_LIMITED'
    ];

    return recoverableErrors.some(code => 
      error.message.includes(code) || error.name.includes(code)
    );
  }
}
