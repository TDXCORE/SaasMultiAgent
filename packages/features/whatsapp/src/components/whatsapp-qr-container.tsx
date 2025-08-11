'use client';

import { MessageCircle, Zap, AlertTriangle } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Alert, AlertDescription } from '@kit/ui/alert';

import { useWhatsAppConnection } from '../hooks';
import { WhatsAppQrDisplay } from './whatsapp-qr-display';
import { WhatsAppSessionManager } from './whatsapp-session-manager';
import { WhatsAppStatusIndicator } from './whatsapp-status-indicator';

interface WhatsAppQrContainerProps {
  className?: string;
}

export function WhatsAppQrContainer({ className }: WhatsAppQrContainerProps) {
  const {
    status,
    qrCode,
    phoneNumber,
    isConnecting,
    error,
    connect,
    disconnect,
    refreshStatus,
  } = useWhatsAppConnection();

  const renderContent = () => {
    switch (status) {
      case 'disconnected':
        return (
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center space-x-2">
                <MessageCircle className="h-6 w-6" />
                <span>Connect Your WhatsApp</span>
              </CardTitle>
              <CardDescription>
                Link your WhatsApp account to start receiving and managing messages
              </CardDescription>
            </CardHeader>
            
            <CardContent className="text-center space-y-4">
              <div className="flex items-center justify-center space-x-2 mb-4">
                <Zap className="h-5 w-5 text-blue-500" />
                <span className="text-sm text-muted-foreground">
                  Secure connection via WhatsApp Web
                </span>
              </div>
              
              <Button 
                onClick={connect} 
                disabled={isConnecting}
                size="lg"
                className="w-full max-w-sm"
              >
                {isConnecting ? 'Connecting...' : 'Connect WhatsApp'}
              </Button>
            </CardContent>
          </Card>
        );

      case 'connecting':
        return (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>Initializing Connection...</CardTitle>
              <CardDescription>
                Setting up your WhatsApp connection
              </CardDescription>
            </CardHeader>
            
            <CardContent className="text-center py-8">
              <div className="flex flex-col items-center space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-muted-foreground">Please wait...</p>
              </div>
            </CardContent>
          </Card>
        );

      case 'waiting_qr':
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader className="text-center">
                <CardTitle>Scan QR Code</CardTitle>
                <CardDescription>
                  Use your phone to scan the QR code below
                </CardDescription>
              </CardHeader>
            </Card>
            
            <div className="flex justify-center">
              {qrCode && (
                <WhatsAppQrDisplay 
                  qrCode={qrCode} 
                  onRefresh={refreshStatus}
                />
              )}
            </div>
          </div>
        );

      case 'connected':
        return (
          <WhatsAppSessionManager
            phoneNumber={phoneNumber}
            onDisconnect={disconnect}
          />
        );

      case 'error':
        return (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {error || 'An error occurred while connecting to WhatsApp'}
              </AlertDescription>
            </Alert>
            
            <Card>
              <CardHeader>
                <CardTitle>Connection Error</CardTitle>
                <CardDescription>
                  There was a problem connecting to WhatsApp
                </CardDescription>
              </CardHeader>
              
              <CardContent>
                <div className="flex flex-col space-y-2">
                  <Button onClick={connect} variant="outline">
                    Try Again
                  </Button>
                  <Button onClick={refreshStatus} variant="ghost" size="sm">
                    Refresh Status
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={className}>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">WhatsApp Integration</h2>
            <p className="text-muted-foreground">
              Connect and manage your WhatsApp business account
            </p>
          </div>
          
          <WhatsAppStatusIndicator 
            status={status} 
            phoneNumber={phoneNumber}
          />
        </div>
      </div>
      
      {renderContent()}
    </div>
  );
}
