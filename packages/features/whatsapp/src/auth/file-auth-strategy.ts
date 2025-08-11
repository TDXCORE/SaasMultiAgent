import { promises as fs } from 'fs';
import { join } from 'path';
import { BaseAuthStrategy } from './base-auth-strategy';
import { AuthConfig, SessionData, WhatsAppAuthError } from '../types';

/**
 * File-based authentication strategy
 * Stores session data in local files for development and simple deployments
 */
export class FileAuthStrategy extends BaseAuthStrategy {
  private sessionDir: string;
  private sessionFile: string;
  private backupFile: string;

  constructor(config: AuthConfig) {
    super(config);
    this.sessionDir = config.dataPath || './sessions';
    this.sessionFile = join(this.sessionDir, `${this.clientId}.json`);
    this.backupFile = join(this.sessionDir, `${this.clientId}.backup.json`);
  }

  async initialize(): Promise<void> {
    try {
      // Ensure session directory exists
      await fs.mkdir(this.sessionDir, { recursive: true });
      
      // Set proper permissions (readable/writable by owner only)
      try {
        await fs.chmod(this.sessionDir, 0o700);
      } catch (error) {
        console.warn('Could not set directory permissions:', error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new WhatsAppAuthError(
        `Failed to initialize session directory: ${errorMessage}`,
        'FILE_INIT_ERROR',
        error
      );
    }
  }

  async saveSession(sessionData: SessionData): Promise<void> {
    try {
      if (!this.validateSessionData(sessionData)) {
        throw new WhatsAppAuthError(
          'Invalid session data provided',
          'INVALID_SESSION_DATA'
        );
      }

      const sessionWithMetadata = {
        ...sessionData,
        _metadata: {
          clientId: this.clientId,
          savedAt: new Date().toISOString(),
          version: '1.0'
        }
      };

      // Create backup of existing session
      if (await this.fileExists(this.sessionFile)) {
        await this.backupSession(sessionData);
      }

      // Write new session data
      await fs.writeFile(
        this.sessionFile, 
        JSON.stringify(sessionWithMetadata, null, 2),
        { mode: 0o600 } // Readable/writable by owner only
      );

    } catch (error) {
      if (error instanceof WhatsAppAuthError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new WhatsAppAuthError(
        `Failed to save session: ${errorMessage}`,
        'FILE_SAVE_ERROR',
        error
      );
    }
  }

  async loadSession(): Promise<SessionData | null> {
    try {
      if (!(await this.fileExists(this.sessionFile))) {
        return null;
      }

      const fileContent = await fs.readFile(this.sessionFile, 'utf8');
      const sessionData = JSON.parse(fileContent);

      // Remove metadata if present
      if (sessionData._metadata) {
        delete sessionData._metadata;
      }

      if (!this.validateSessionData(sessionData)) {
        console.warn('Invalid session data found, attempting to restore from backup');
        return await this.restoreFromBackup();
      }

      return sessionData;

    } catch (error) {
      console.warn('Failed to load session, attempting backup restore:', error);
      
      // Try to restore from backup
      const backupSession = await this.restoreFromBackup();
      if (backupSession) {
        console.warn('Successfully restored session from backup');
        return backupSession;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new WhatsAppAuthError(
        `Failed to load session: ${errorMessage}`,
        'FILE_LOAD_ERROR',
        error
      );
    }
  }

  async clearSession(): Promise<void> {
    try {
      const filesToClear = [this.sessionFile, this.backupFile];
      
      for (const file of filesToClear) {
        if (await this.fileExists(file)) {
          await fs.unlink(file);
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new WhatsAppAuthError(
        `Failed to clear session: ${errorMessage}`,
        'FILE_CLEAR_ERROR',
        error
      );
    }
  }

  async hasSession(): Promise<boolean> {
    try {
      if (!(await this.fileExists(this.sessionFile))) {
        return false;
      }

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

    // Check if error indicates corrupted session
    const isCorruptedSession = this.isSessionCorruptionError(error);
    
    if (isCorruptedSession) {
      await this.handleCorruptedSession(error);
      return {
        shouldRestart: this.config.restartOnAuthFail || false,
        shouldClearSession: true
      };
    }

    // For other errors, try to preserve session
    return {
      shouldRestart: this.config.restartOnAuthFail || false,
      shouldClearSession: false
    };
  }

  async cleanup(): Promise<void> {
    // File strategy doesn't need special cleanup
    // Session files are preserved for next startup
  }

  /**
   * Backup session to backup file
   */
  protected async backupSession(sessionData: SessionData): Promise<void> {
    try {
      const backupData = {
        ...sessionData,
        _backup: {
          originalFile: this.sessionFile,
          backedUpAt: new Date().toISOString(),
          clientId: this.clientId
        }
      };

      await fs.writeFile(
        this.backupFile,
        JSON.stringify(backupData, null, 2),
        { mode: 0o600 }
      );

    } catch (error) {
      console.warn('Failed to create session backup:', error);
    }
  }

  /**
   * Restore session from backup file
   */
  protected async restoreFromBackup(): Promise<SessionData | null> {
    try {
      if (!(await this.fileExists(this.backupFile))) {
        return null;
      }

      const backupContent = await fs.readFile(this.backupFile, 'utf8');
      const backupData = JSON.parse(backupContent);

      // Remove backup metadata
      if (backupData._backup) {
        delete backupData._backup;
      }

      if (this.validateSessionData(backupData)) {
        // Restore the backup as the main session
        await this.saveSession(backupData);
        return backupData;
      }

      return null;

    } catch (error) {
      console.warn('Failed to restore from backup:', error);
      return null;
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if error indicates session corruption
   */
  private isSessionCorruptionError(error: Error): boolean {
    const corruptionIndicators = [
      'JSON',
      'parse',
      'corrupt',
      'invalid',
      'malformed',
      'ENOENT',
      'EACCES'
    ];

    return corruptionIndicators.some(indicator => 
      error.message.toLowerCase().includes(indicator.toLowerCase()) ||
      error.name.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * Get session file stats for debugging
   */
  async getSessionStats(): Promise<{
    exists: boolean;
    size?: number;
    modified?: Date;
    hasBackup: boolean;
  }> {
    try {
      const stats = {
        exists: await this.fileExists(this.sessionFile),
        hasBackup: await this.fileExists(this.backupFile)
      };

      if (stats.exists) {
        const fileStats = await fs.stat(this.sessionFile);
        return {
          ...stats,
          size: fileStats.size,
          modified: fileStats.mtime
        };
      }

      return stats;
    } catch (error) {
      return {
        exists: false,
        hasBackup: false
      };
    }
  }
}
