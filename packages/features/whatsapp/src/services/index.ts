import { WhatsAppApiResponse, WhatsAppSession, WhatsAppStats } from '../types';

class WhatsAppApiService {
  private baseUrl = '/api/whatsapp';

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
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  async getConnectionStatus() {
    return this.request<{ status: string; connected: boolean; qr?: string; stats?: any }>(
      `/status`
    );
  }

  async initializeConnection() {
    return this.request<{ status: string; qr?: string; message: string }>(
      `/connect`,
      { method: 'POST' }
    );
  }

  async disconnectSession() {
    return this.request<{ status: string; message: string }>(
      `/disconnect`,
      { method: 'POST' }
    );
  }

  async getHealthCheck() {
    return this.request('/health');
  }
}

export const whatsAppApiService = new WhatsAppApiService();
