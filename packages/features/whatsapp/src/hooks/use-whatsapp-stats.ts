'use client';

import { useQuery } from '@tanstack/react-query';

import { WhatsAppStats } from '../types';

export function useWhatsAppStats(userId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['whatsapp-stats', userId],
    queryFn: async (): Promise<WhatsAppStats | null> => {
      // TODO: Implement stats API endpoint
      // For now, return null until we implement the stats functionality
      return null;
    },
    enabled: false, // Disable until we implement the stats API
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: 2,
  });
}
