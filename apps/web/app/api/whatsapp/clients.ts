// Shared client storage for WhatsApp connections
// In production, this should be replaced with Redis or another persistent store

import { WhatsAppClient } from '@kit/whatsapp';

export const activeClients = new Map<string, WhatsAppClient>();
const connectionLocks = new Map<string, boolean>();
const lastConnectionAttempt = new Map<string, number>();

// Minimum time between connection attempts (5 seconds)
const MIN_CONNECTION_INTERVAL = 5000;

export function getClient(userId: string): WhatsAppClient | undefined {
  return activeClients.get(userId);
}

export function setClient(userId: string, client: WhatsAppClient): void {
  activeClients.set(userId, client);
  connectionLocks.set(userId, false);
  lastConnectionAttempt.set(userId, Date.now());
}

export function removeClient(userId: string): boolean {
  connectionLocks.delete(userId);
  lastConnectionAttempt.delete(userId);
  return activeClients.delete(userId);
}

export function hasClient(userId: string): boolean {
  return activeClients.has(userId);
}

export function getAllClients(): Array<[string, WhatsAppClient]> {
  return Array.from(activeClients.entries());
}

export function getClientCount(): number {
  return activeClients.size;
}

/**
 * Check if user can attempt a new connection
 */
export function canAttemptConnection(userId: string): boolean {
  // Check if there's an active connection lock
  if (connectionLocks.get(userId)) {
    return false;
  }

  // Check minimum interval between attempts
  const lastAttempt = lastConnectionAttempt.get(userId);
  if (lastAttempt && (Date.now() - lastAttempt) < MIN_CONNECTION_INTERVAL) {
    return false;
  }

  return true;
}

/**
 * Lock connection for a user to prevent concurrent attempts
 */
export function lockConnection(userId: string): void {
  connectionLocks.set(userId, true);
}

/**
 * Unlock connection for a user
 */
export function unlockConnection(userId: string): void {
  connectionLocks.set(userId, false);
}

/**
 * Check if connection is locked
 */
export function isConnectionLocked(userId: string): boolean {
  return connectionLocks.get(userId) || false;
}

/**
 * Cleanup inactive clients
 */
export async function cleanupInactiveClients(): Promise<void> {
  const now = Date.now();
  const INACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 minutes

  for (const [userId, client] of activeClients.entries()) {
    try {
      const stats = client.getConnectionStats();
      const timeInCurrentState = stats.timeInCurrentState;
      
      // Clean up clients that have been in error/disconnected state for too long
      if (
        (stats.status === 'error' || stats.status === 'disconnected') &&
        timeInCurrentState > INACTIVE_THRESHOLD
      ) {
        console.log(`Cleaning up inactive client for user ${userId}`);
        await client.cleanup();
        removeClient(userId);
      }
    } catch (error) {
      console.error(`Error checking client status for user ${userId}:`, error);
      // Remove problematic clients
      removeClient(userId);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupInactiveClients, 10 * 60 * 1000);
