import { ConnectionConfig, WhatsAppStatus, WhatsAppConnectionEvent } from '../types';

/**
 * Manages automatic reconnection logic with exponential backoff
 * Handles connection failures and implements retry strategies
 */
export class ReconnectionManager {
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectIntervalMs: number;
  private isReconnecting = false;
  private reconnectTimer?: NodeJS.Timeout;
  private backoffMultiplier = 1.5;
  private maxBackoffMs = 300000; // 5 minutes
  private listeners: Map<string, (event: ReconnectionEvent) => void> = new Map();

  constructor(private config: ConnectionConfig) {
    this.maxReconnectAttempts = config.maxReconnectAttempts;
    this.reconnectIntervalMs = config.reconnectIntervalMs;
  }

  /**
   * Start reconnection process
   */
  async startReconnection(
    reason: string,
    connectFunction: () => Promise<void>
  ): Promise<void> {
    if (this.isReconnecting) {
      console.log('Reconnection already in progress');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emitEvent({
        type: 'max_attempts_reached',
        attempts: this.reconnectAttempts,
        reason
      });
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = this.calculateBackoffDelay();
    
    console.log(
      `Starting reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} ` +
      `in ${delay}ms. Reason: ${reason}`
    );

    this.emitEvent({
      type: 'reconnection_started',
      attempts: this.reconnectAttempts,
      delay,
      reason
    });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await connectFunction();
        this.onReconnectionSuccess();
      } catch (error) {
        this.onReconnectionFailure(error as Error);
      }
    }, delay);
  }

  /**
   * Stop reconnection process
   */
  stopReconnection(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.isReconnecting) {
      console.log('Stopping reconnection process');
      this.emitEvent({
        type: 'reconnection_stopped',
        attempts: this.reconnectAttempts
      });
    }

    this.isReconnecting = false;
  }

  /**
   * Reset reconnection state
   */
  reset(): void {
    this.stopReconnection();
    this.reconnectAttempts = 0;
    
    this.emitEvent({
      type: 'reconnection_reset',
      attempts: 0
    });
  }

  /**
   * Check if should attempt reconnection based on error/state
   */
  shouldReconnect(state: WhatsAppStatus, error?: Error): boolean {
    // Don't reconnect if already at max attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return false;
    }

    // Don't reconnect for certain states
    const nonRecoverableStates: WhatsAppStatus[] = [
      'deprecated_version',
      'tos_block',
      'smb_tos_block'
    ];

    if (nonRecoverableStates.includes(state)) {
      return false;
    }

    // Don't reconnect for certain error types
    if (error) {
      const nonRecoverableErrors = [
        'AUTHENTICATION_FAILURE',
        'INVALID_SESSION',
        'BANNED',
        'DEPRECATED'
      ];

      const errorMessage = error.message.toLowerCase();
      if (nonRecoverableErrors.some(err => errorMessage.includes(err.toLowerCase()))) {
        return false;
      }
    }

    // Reconnect for connection-related issues
    const reconnectableStates: WhatsAppStatus[] = [
      'disconnected',
      'error',
      'timeout',
      'conflict',
      'proxyblock'
    ];

    return reconnectableStates.includes(state);
  }

  /**
   * Get current reconnection status
   */
  getStatus(): {
    isReconnecting: boolean;
    attempts: number;
    maxAttempts: number;
    nextAttemptIn?: number;
  } {
    const status = {
      isReconnecting: this.isReconnecting,
      attempts: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts
    };

    if (this.reconnectTimer && this.isReconnecting) {
      // Estimate time remaining (not precise but gives an idea)
      return {
        ...status,
        nextAttemptIn: this.calculateBackoffDelay()
      };
    }

    return status;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ConnectionConfig>): void {
    if (config.maxReconnectAttempts !== undefined) {
      this.maxReconnectAttempts = config.maxReconnectAttempts;
    }
    if (config.reconnectIntervalMs !== undefined) {
      this.reconnectIntervalMs = config.reconnectIntervalMs;
    }
  }

  /**
   * Register event listener
   */
  onReconnectionEvent(id: string, callback: (event: ReconnectionEvent) => void): void {
    this.listeners.set(id, callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(id: string): void {
    this.listeners.delete(id);
  }

  /**
   * Clear all listeners
   */
  clearAllListeners(): void {
    this.listeners.clear();
  }

  /**
   * Calculate backoff delay with exponential backoff
   */
  private calculateBackoffDelay(): number {
    const baseDelay = this.reconnectIntervalMs;
    const exponentialDelay = baseDelay * Math.pow(this.backoffMultiplier, this.reconnectAttempts - 1);
    
    // Add some jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * exponentialDelay;
    const totalDelay = exponentialDelay + jitter;
    
    return Math.min(totalDelay, this.maxBackoffMs);
  }

  /**
   * Handle successful reconnection
   */
  private onReconnectionSuccess(): void {
    console.log(`Reconnection successful after ${this.reconnectAttempts} attempts`);
    
    this.emitEvent({
      type: 'reconnection_success',
      attempts: this.reconnectAttempts
    });

    this.reset();
  }

  /**
   * Handle failed reconnection
   */
  private onReconnectionFailure(error: Error): void {
    console.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error.message);
    
    this.emitEvent({
      type: 'reconnection_failed',
      attempts: this.reconnectAttempts,
      error: error.message
    });

    this.isReconnecting = false;

    // Schedule next attempt if we haven't reached max attempts
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      // Use a shorter delay for immediate retry scheduling
      setTimeout(() => {
        if (!this.isReconnecting) {
          this.startReconnection(
            `Previous attempt failed: ${error.message}`,
            async () => {
              throw new Error('Reconnection function not provided for retry');
            }
          );
        }
      }, 1000);
    } else {
      this.emitEvent({
        type: 'max_attempts_reached',
        attempts: this.reconnectAttempts,
        reason: `Final attempt failed: ${error.message}`
      });
    }
  }

  /**
   * Emit reconnection event
   */
  private emitEvent(event: ReconnectionEvent): void {
    this.listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in reconnection event listener:', error);
      }
    });
  }
}

/**
 * Reconnection event types
 */
export interface ReconnectionEvent {
  type: 'reconnection_started' 
      | 'reconnection_success' 
      | 'reconnection_failed' 
      | 'reconnection_stopped'
      | 'reconnection_reset'
      | 'max_attempts_reached';
  attempts: number;
  delay?: number;
  reason?: string;
  error?: string;
}

/**
 * Reconnection strategy configuration
 */
export interface ReconnectionStrategy {
  enabled: boolean;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterEnabled: boolean;
  retryableStates: WhatsAppStatus[];
  nonRetryableErrors: string[];
}

/**
 * Default reconnection strategies for different environments
 */
export const RECONNECTION_STRATEGIES: Record<string, ReconnectionStrategy> = {
  development: {
    enabled: true,
    maxAttempts: 5,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 1.5,
    jitterEnabled: true,
    retryableStates: ['disconnected', 'error', 'timeout'],
    nonRetryableErrors: ['AUTHENTICATION_FAILURE', 'BANNED']
  },
  
  production: {
    enabled: true,
    maxAttempts: 10,
    baseDelayMs: 5000,
    maxDelayMs: 300000,
    backoffMultiplier: 2,
    jitterEnabled: true,
    retryableStates: ['disconnected', 'error', 'timeout', 'conflict', 'proxyblock'],
    nonRetryableErrors: ['AUTHENTICATION_FAILURE', 'BANNED', 'DEPRECATED_VERSION']
  },
  
  testing: {
    enabled: false,
    maxAttempts: 0,
    baseDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 1,
    jitterEnabled: false,
    retryableStates: [],
    nonRetryableErrors: []
  }
};
