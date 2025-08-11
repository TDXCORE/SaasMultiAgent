// Shared client storage for WhatsApp connections
// In production, this should be replaced with Redis or another persistent store

export const activeClients = new Map<string, any>();

export function getClient(userId: string) {
  return activeClients.get(userId);
}

export function setClient(userId: string, client: any) {
  activeClients.set(userId, client);
}

export function removeClient(userId: string) {
  return activeClients.delete(userId);
}

export function hasClient(userId: string) {
  return activeClients.has(userId);
}

export function getAllClients() {
  return Array.from(activeClients.entries());
}

export function getClientCount() {
  return activeClients.size;
}
