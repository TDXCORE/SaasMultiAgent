'use client';

import { useEffect, useRef } from 'react';
import { RefreshCw, Smartphone } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';

interface WhatsAppQrDisplayProps {
  qrCode: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function WhatsAppQrDisplay({ 
  qrCode, 
  onRefresh, 
  isRefreshing = false 
}: WhatsAppQrDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const generateQR = async () => {
      if (!qrCode || !canvasRef.current) return;

      try {
        // Dynamically import QR code library
        const QRCode = (await import('qrcode')).default;
        
        await QRCode.toCanvas(canvasRef.current, qrCode, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    };

    generateQR();
  }, [qrCode]);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center space-x-2">
          <Smartphone className="h-5 w-5" />
          <span>Scan with WhatsApp</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex flex-col items-center space-y-4">
        <div className="relative p-4 bg-white rounded-lg border">
          <canvas 
            ref={canvasRef} 
            className="block"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
        
        <div className="text-sm text-muted-foreground text-center max-w-xs">
          <p>1. Open WhatsApp on your phone</p>
          <p>2. Go to Settings → Linked Devices</p>
          <p>3. Tap "Link a Device" and scan this QR code</p>
        </div>
        
        {onRefresh && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onRefresh}
            disabled={isRefreshing}
            className="mt-2"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh QR Code
          </Button>
        )}
      </CardContent>
    </Card>
  );
}