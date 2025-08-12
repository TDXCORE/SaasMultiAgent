import { WhatsAppStatus, WhatsAppConnectionEvent } from '../types';

/**
 * Manages WhatsApp connection state transitions and validation
 * Ensures state changes follow valid patterns and emits events
 */
export class ConnectionStateManager {
  private currentState: WhatsAppStatus = 'disconnected';
  private previousState: WhatsAppStatus = 'disconnected';
  private currentQrCode: string | null = null;
  private stateHistory: Array<{ state: WhatsAppStatus; timestamp: number }> = [];
  private listeners: Map<string, (state: WhatsAppStatus, previous: WhatsAppStatus) => void> = new Map();
  private eventListeners: Map<string, (event: WhatsAppConnectionEvent) => void> = new Map();
  private maxHistorySize = 50;

  // Valid state transitions
  private readonly validTransitions: Record<WhatsAppStatus, WhatsAppStatus[]> = {
    disconnected: ['connecting', 'opening', 'unlaunched'],
    unlaunched: ['opening', 'connecting', 'disconnected'],
    opening: ['connecting', 'waiting_qr', 'pairing', 'error', 'disconnected'],
    connecting: ['waiting_qr', 'pairing', 'connected', 'error', 'timeout', 'disconnected'],
    waiting_qr: ['connecting', 'pairing', 'connected', 'timeout', 'error', 'disconnected'],
    pairing: ['connected', 'unpaired', 'error', 'timeout', 'disconnected'],
    connected: ['disconnected', 'error', 'conflict', 'deprecated_version', 'proxyblock', 'smb_tos_block', 'tos_block'],
    error: ['disconnected', 'connecting', 'opening'],
    timeout: ['disconnected', 'connecting', 'opening'],
    conflict: ['disconnected', 'connecting'],
    deprecated_version: ['disconnected'],
    proxyblock: ['disconnected', 'connecting'],
    smb_tos_block: ['disconnected'],
    tos_block: ['disconnected'],
    unpaired: ['disconnected', 'connecting', 'unpaired_idle'],
    unpaired_idle: ['disconnected', 'connecting']
  };

  constructor() {
    this.addToHistory('disconnected');
  }

  /**
   * Get current connection state
   */
  getCurrentState(): WhatsAppStatus {
    return this.currentState;
  }

  /**
   * Get previous connection state
   */
  getPreviousState(): WhatsAppStatus {
    return this.previousState;
  }

  /**
   * Get current QR code
   */
  getCurrentQrCode(): string | null {
    return this.currentQrCode;
  }

  /**
   * Set current QR code
   */
  setQrCode(qrCode: string | null): void {
    this.currentQrCode = qrCode;
  }

  /**
   * Get full connection status including QR code
   */
  getConnectionStatus(): { state: WhatsAppStatus; qrCode: string | null } {
    return {
      state: this.currentState,
      qrCode: this.currentQrCode
    };
  }

  /**
   * Get state history
   */
  getStateHistory(): Array<{ state: WhatsAppStatus; timestamp: number }> {
    return [...this.stateHistory];
  }

  /**
   * Set new connection state with validation
   */
  setState(newState: WhatsAppStatus, eventData?: any): boolean {
    // Prevent duplicate state transitions
    if (this.currentState === newState) {
      console.log(`State is already ${newState}, skipping transition`);
      return true;
    }

    if (!this.canTransitionTo(newState)) {
      console.warn(`Invalid state transition from ${this.currentState} to ${newState}`);
      return false;
    }

    const oldState = this.currentState;
    this.previousState = oldState;
    this.currentState = newState;
    
    this.addToHistory(newState);
    this.notifyStateChange(newState, oldState);
    this.emitConnectionEvent(newState, eventData);

    return true;
  }

  /**
   * Force set state (bypass validation) - use with caution
   */
  forceSetState(newState: WhatsAppStatus, reason?: string): void {
    console.warn(`Force setting state to ${newState}${reason ? `: ${reason}` : ''}`);
    
    const oldState = this.currentState;
    this.previousState = oldState;
    this.currentState = newState;
    
    this.addToHistory(newState);
    this.notifyStateChange(newState, oldState);
  }

  /**
   * Check if transition to new state is valid
   */
  canTransitionTo(newState: WhatsAppStatus): boolean {
    const allowedStates = this.validTransitions[this.currentState];
    return allowedStates ? allowedStates.includes(newState) : false;
  }

  /**
   * Check if currently in a connected state
   */
  isConnected(): boolean {
    return this.currentState === 'connected';
  }

  /**
   * Check if currently in a connecting state
   */
  isConnecting(): boolean {
    return ['connecting', 'opening', 'waiting_qr', 'pairing'].includes(this.currentState);
  }

  /**
   * Check if currently in an error state
   */
  isError(): boolean {
    return ['error', 'timeout', 'conflict', 'deprecated_version', 'proxyblock', 'smb_tos_block', 'tos_block'].includes(this.currentState);
  }

  /**
   * Check if currently disconnected
   */
  isDisconnected(): boolean {
    return ['disconnected', 'unpaired', 'unpaired_idle'].includes(this.currentState);
  }

  /**
   * Check if authentication is required
   */
  requiresAuth(): boolean {
    return ['waiting_qr', 'pairing', 'unpaired'].includes(this.currentState);
  }

  /**
   * Get time spent in current state
   */
  getTimeInCurrentState(): number {
    const lastEntry = this.stateHistory[this.stateHistory.length - 1];
    return lastEntry ? Date.now() - lastEntry.timestamp : 0;
  }

  /**
   * Get total connection uptime (time spent in connected state)
   */
  getConnectionUptime(): number {
    const connectedEntries = this.stateHistory.filter(entry => entry.state === 'connected');
    
    return connectedEntries.reduce((total, entry, index) => {
      if (!entry) return total;
      
      if (index === connectedEntries.length - 1 && this.currentState === 'connected') {
        // Current connected session
        return total + (Date.now() - entry.timestamp);
      }
      
      // Find when this connected session ended
      const nextEntry = this.stateHistory.find(
        h => h.timestamp > entry.timestamp && h.state !== 'connected'
      );
      
      if (nextEntry) {
        return total + (nextEntry.timestamp - entry.timestamp);
      }
      
      return total;
    }, 0);
  }

  /**
   * Register state change listener
   */
  onStateChange(id: string, callback: (state: WhatsAppStatus, previous: WhatsAppStatus) => void): void {
    this.listeners.set(id, callback);
  }

  /**
   * Register connection event listener
   */
  onConnectionEvent(id: string, callback: (event: WhatsAppConnectionEvent) => void): void {
    this.eventListeners.set(id, callback);
  }

  /**
   * Remove state change listener
   */
  removeStateListener(id: string): void {
    this.listeners.delete(id);
  }

  /**
   * Remove connection event listener
   */
  removeEventListener(id: string): void {
    this.eventListeners.delete(id);
  }

  /**
   * Clear all listeners
   */
  clearAllListeners(): void {
    this.listeners.clear();
    this.eventListeners.clear();
  }

  /**
   * Reset state manager
   */
  reset(): void {
    this.currentState = 'disconnected';
    this.previousState = 'disconnected';
    this.stateHistory = [];
    this.addToHistory('disconnected');
  }

  /**
   * Get state statistics
   */
  getStateStats(): Record<WhatsAppStatus, { count: number; totalTime: number }> {
    const stats: Record<string, { count: number; totalTime: number }> = {};
    
    for (let i = 0; i < this.stateHistory.length; i++) {
      const entry = this.stateHistory[i];
      if (!entry) continue;
      
      const nextEntry = this.stateHistory[i + 1];
      
      if (!stats[entry.state]) {
        stats[entry.state] = { count: 0, totalTime: 0 };
      }
      
      stats[entry.state]!.count++;
      
      if (nextEntry) {
        stats[entry.state]!.totalTime += nextEntry.timestamp - entry.timestamp;
      } else if (entry.state === this.currentState) {
        stats[entry.state]!.totalTime += Date.now() - entry.timestamp;
      }
    }
    
    return stats as Record<WhatsAppStatus, { count: number; totalTime: number }>;
  }

  /**
   * Add state to history
   */
  private addToHistory(state: WhatsAppStatus): void {
    this.stateHistory.push({
      state,
      timestamp: Date.now()
    });

    // Limit history size
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory = this.stateHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Notify all state change listeners
   */
  private notifyStateChange(newState: WhatsAppStatus, oldState: WhatsAppStatus): void {
    this.listeners.forEach(callback => {
      try {
        callback(newState, oldState);
      } catch (error) {
        console.error('Error in state change listener:', error);
      }
    });
  }

  /**
   * Emit connection event
   */
  private emitConnectionEvent(state: WhatsAppStatus, eventData?: any): void {
    const event: WhatsAppConnectionEvent = {
      type: 'state_changed',
      state,
      user_id: eventData?.userId || 'unknown',
      timestamp: Date.now(),
      data: eventData
    };

    this.eventListeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in connection event listener:', error);
      }
    });
  }
}
