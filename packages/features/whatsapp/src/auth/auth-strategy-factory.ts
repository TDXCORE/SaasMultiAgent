import { BaseAuthStrategy } from './base-auth-strategy';
import { DatabaseAuthStrategy } from './database-auth-strategy';
import { FileAuthStrategy } from './file-auth-strategy';
import { AuthConfig, AuthStrategy, WhatsAppAuthError } from '../types';

/**
 * Factory for creating authentication strategies
 * Provides a centralized way to create and configure auth strategies
 */
export class AuthStrategyFactory {
  /**
   * Create an authentication strategy based on configuration
   */
  static createStrategy(
    config: AuthConfig,
    userId?: string,
    supabaseClient?: any
  ): BaseAuthStrategy {
    const strategy = config.strategy || 'local';

    switch (strategy) {
      case 'database':
        if (!userId) {
          throw new WhatsAppAuthError(
            'User ID is required for database authentication strategy',
            'MISSING_USER_ID'
          );
        }
        if (!supabaseClient) {
          throw new WhatsAppAuthError(
            'Supabase client is required for database authentication strategy',
            'MISSING_SUPABASE_CLIENT'
          );
        }
        return new DatabaseAuthStrategy(config, userId, supabaseClient);

      case 'local':
        return new FileAuthStrategy(config);

      case 'remote':
        // For future implementation - could be Redis, external API, etc.
        throw new WhatsAppAuthError(
          'Remote authentication strategy not yet implemented',
          'STRATEGY_NOT_IMPLEMENTED'
        );

      case 'no_auth':
        // For testing or special cases where no authentication is needed
        return new NoAuthStrategy(config);

      default:
        throw new WhatsAppAuthError(
          `Unknown authentication strategy: ${strategy}`,
          'UNKNOWN_STRATEGY'
        );
    }
  }

  /**
   * Validate authentication configuration
   */
  static validateConfig(config: AuthConfig): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!config.strategy) {
      errors.push('Authentication strategy is required');
    }

    if (config.strategy === 'database') {
      if (!config.clientId) {
        errors.push('Client ID is required for database strategy');
      }
    }

    if (config.strategy === 'local') {
      if (config.dataPath && typeof config.dataPath !== 'string') {
        errors.push('Data path must be a string');
      }
    }

    if (config.backupSyncIntervalMs && config.backupSyncIntervalMs < 1000) {
      errors.push('Backup sync interval must be at least 1000ms');
    }

    if (config.rmMaxRetries && config.rmMaxRetries < 0) {
      errors.push('Max retries must be a positive number');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get default configuration for a strategy
   */
  static getDefaultConfig(strategy: AuthStrategy): Partial<AuthConfig> {
    const baseConfig = {
      restartOnAuthFail: true,
      rmMaxRetries: 3
    };

    switch (strategy) {
      case 'database':
        return {
          ...baseConfig,
          backupSyncIntervalMs: 30000 // 30 seconds
        };

      case 'local':
        return {
          ...baseConfig,
          dataPath: './sessions',
          backupSyncIntervalMs: 60000 // 1 minute
        };

      case 'remote':
        return {
          ...baseConfig,
          backupSyncIntervalMs: 15000 // 15 seconds
        };

      case 'no_auth':
        return {
          restartOnAuthFail: false,
          rmMaxRetries: 0
        };

      default:
        return baseConfig;
    }
  }

  /**
   * Merge user config with defaults
   */
  static mergeWithDefaults(userConfig: Partial<AuthConfig>): AuthConfig {
    const strategy = userConfig.strategy || 'local';
    const defaults = this.getDefaultConfig(strategy);
    
    return {
      strategy,
      ...defaults,
      ...userConfig
    } as AuthConfig;
  }
}

/**
 * No-authentication strategy for testing or special cases
 */
class NoAuthStrategy extends BaseAuthStrategy {
  async initialize(): Promise<void> {
    // No initialization needed
  }

  async saveSession(sessionData: any): Promise<void> {
    // No-op
  }

  async loadSession(): Promise<any> {
    return null;
  }

  async clearSession(): Promise<void> {
    // No-op
  }

  async hasSession(): Promise<boolean> {
    return false;
  }

  async onAuthFailure(error: Error): Promise<{
    shouldRestart: boolean;
    shouldClearSession: boolean;
  }> {
    return {
      shouldRestart: false,
      shouldClearSession: false
    };
  }

  async cleanup(): Promise<void> {
    // No-op
  }
}
