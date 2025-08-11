'use client';

import { useQuery } from '@tanstack/react-query';

import { whatsAppApiService } from '../services';
import { WhatsAppStats } from '../types';

export function useWhatsAppStats(userId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['whatsapp-stats', userId],
    queryFn: async (): Promise<WhatsAppStats | null> => {
      const response = await whatsAppApiService.getStats(userId);
      
      if (response.success && response.data) {
        return response.data;
      }
      
      return null;
    },
    enabled,
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: 2,
  });
}