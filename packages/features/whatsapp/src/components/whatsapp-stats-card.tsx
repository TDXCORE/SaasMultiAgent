'use client';

import { MessageSquare, Send, Calendar, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@kit/ui/skeleton';

import { WhatsAppStats } from '../types';

interface WhatsAppStatsCardProps {
  stats: WhatsAppStats | null | undefined;
  isLoading?: boolean;
}

export function WhatsAppStatsCard({ stats, isLoading }: WhatsAppStatsCardProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center text-muted-foreground py-4">
        No activity data available
      </div>
    );
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Invalid date';
    }
  };

  const statsItems = [
    {
      icon: Send,
      label: 'Messages Sent',
      value: stats.messages_sent.toLocaleString(),
      color: 'text-blue-500',
    },
    {
      icon: MessageSquare,
      label: 'Messages Received',
      value: stats.messages_received.toLocaleString(),
      color: 'text-green-500',
    },
    {
      icon: Activity,
      label: 'Last Activity',
      value: formatDate(stats.last_activity),
      color: 'text-purple-500',
    },
    {
      icon: Calendar,
      label: 'Connected Since',
      value: formatDate(stats.connected_since),
      color: 'text-orange-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {statsItems.map((item, index) => {
        const Icon = item.icon;
        
        return (
          <div key={index} className="flex items-center space-x-3">
            <div className={`p-2 rounded-full bg-muted ${item.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {item.value}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {item.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}