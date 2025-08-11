'use client';

import { CheckCircle, Clock, Loader2, XCircle, AlertCircle } from 'lucide-react';

import { Badge } from '@kit/ui/badge';

import { WhatsAppStatus } from '../types';

interface WhatsAppStatusIndicatorProps {
  status: WhatsAppStatus;
  phoneNumber?: string | null;
  className?: string;
}

const statusConfig = {
  disconnected: {
    icon: XCircle,
    label: 'Disconnected',
    variant: 'secondary' as const,
    color: 'text-gray-500',
    spin: false,
  },
  connecting: {
    icon: Loader2,
    label: 'Connecting...',
    variant: 'secondary' as const,
    color: 'text-blue-500',
    spin: true,
  },
  waiting_qr: {
    icon: Clock,
    label: 'Waiting for QR scan',
    variant: 'outline' as const,
    color: 'text-yellow-500',
    spin: false,
  },
  connected: {
    icon: CheckCircle,
    label: 'Connected',
    variant: 'success' as const,
    color: 'text-green-500',
    spin: false,
  },
  error: {
    icon: AlertCircle,
    label: 'Error',
    variant: 'destructive' as const,
    color: 'text-red-500',
    spin: false,
  },
  conflict: {
    icon: AlertCircle,
    label: 'Conflict',
    variant: 'destructive' as const,
    color: 'text-orange-500',
    spin: false,
  },
  deprecated_version: {
    icon: AlertCircle,
    label: 'Deprecated Version',
    variant: 'destructive' as const,
    color: 'text-red-500',
    spin: false,
  },
  opening: {
    icon: Loader2,
    label: 'Opening...',
    variant: 'secondary' as const,
    color: 'text-blue-500',
    spin: true,
  },
  pairing: {
    icon: Loader2,
    label: 'Pairing...',
    variant: 'secondary' as const,
    color: 'text-blue-500',
    spin: true,
  },
  proxyblock: {
    icon: XCircle,
    label: 'Proxy Blocked',
    variant: 'destructive' as const,
    color: 'text-red-500',
    spin: false,
  },
  smb_tos_block: {
    icon: XCircle,
    label: 'SMB ToS Block',
    variant: 'destructive' as const,
    color: 'text-red-500',
    spin: false,
  },
  timeout: {
    icon: Clock,
    label: 'Timeout',
    variant: 'destructive' as const,
    color: 'text-red-500',
    spin: false,
  },
  tos_block: {
    icon: XCircle,
    label: 'ToS Block',
    variant: 'destructive' as const,
    color: 'text-red-500',
    spin: false,
  },
  unlaunched: {
    icon: Clock,
    label: 'Unlaunched',
    variant: 'secondary' as const,
    color: 'text-gray-500',
    spin: false,
  },
  unpaired: {
    icon: XCircle,
    label: 'Unpaired',
    variant: 'secondary' as const,
    color: 'text-gray-500',
    spin: false,
  },
  unpaired_idle: {
    icon: Clock,
    label: 'Unpaired Idle',
    variant: 'secondary' as const,
    color: 'text-gray-500',
    spin: false,
  },
};

export function WhatsAppStatusIndicator({ 
  status, 
  phoneNumber, 
  className 
}: WhatsAppStatusIndicatorProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={`flex items-center space-x-2 ${className || ''}`}>
      <Badge variant={config.variant} className="flex items-center space-x-1">
        <Icon 
          className={`h-3 w-3 ${config.color} ${config.spin ? 'animate-spin' : ''}`} 
        />
        <span>{config.label}</span>
      </Badge>
      
      {status === 'connected' && phoneNumber && (
        <span className="text-sm text-muted-foreground">
          {phoneNumber}
        </span>
      )}
    </div>
  );
}
