import { WhatsAppApiResponse, WhatsAppSession, WhatsAppStats } from '../types';

class WhatsAppApiService {
  private baseUrl = 'https://chatbotmicroservicio.onrender.com';

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<WhatsAppApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getConnectionStatus(userId: string) {
    return this.request<{ status: string; connected: boolean; phone?: string }>(
      `/whatsapp/status/${userId}`
    );
  }

  async initializeConnection(userId: string) {
    return this.request<{ session_id: string }>(
      `/whatsapp/init/${userId}`,
      { method: 'POST' }
    );
  }

  async getQrCode(userId: string) {
    return this.request<{ qr: string }>(
      `/whatsapp/qr/${userId}`
    );
  }

  async disconnectSession(userId: string) {
    return this.request<{ message: string }>(
      `/whatsapp/disconnect/${userId}`,
      { method: 'POST' }
    );
  }

  async getStats(userId: string) {
    return this.request<WhatsAppStats>(
      `/whatsapp/stats/${userId}`
    );
  }

  async getHealthCheck() {
    return this.request('/health');
  }

  createWebSocketConnection(userId: string): WebSocket | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const wsUrl = this.baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    return new WebSocket(`${wsUrl}/ws/${userId}`);
  }
}

export const whatsAppApiService = new WhatsAppApiService();