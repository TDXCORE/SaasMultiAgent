'use client';

import { LogOut, MessageCircle, TrendingUp } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';

import { useWhatsAppStats } from '../hooks';
import { WhatsAppStatsCard } from './whatsapp-stats-card';

interface WhatsAppSessionManagerProps {
  userId: string;
  phoneNumber?: string | null;
  onDisconnect: () => void;
  isDisconnecting?: boolean;
}

export function WhatsAppSessionManager({ 
  userId,
  phoneNumber, 
  onDisconnect, 
  isDisconnecting = false 
}: WhatsAppSessionManagerProps) {
  const { data: stats, isLoading: statsLoading } = useWhatsAppStats(userId, true);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageCircle className="h-5 w-5 text-green-500" />
            <span>WhatsApp Connected</span>
          </CardTitle>
          <CardDescription>
            {phoneNumber ? `Connected as ${phoneNumber}` : 'Your WhatsApp is connected and ready'}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Your WhatsApp session is active and ready to receive messages.
            </div>
            
            <Button 
              variant="destructive" 
              size="sm"
              onClick={onDisconnect}
              disabled={isDisconnecting}
              className="ml-4"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Activity Stats</span>
          </CardTitle>
        </CardHeader>
        
        <CardContent>
          <WhatsAppStatsCard 
            stats={stats} 
            isLoading={statsLoading} 
          />
        </CardContent>
      </Card>
    </div>
  );
}