'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { whatsAppApiService } from '../services';
import { WhatsAppStatus } from '../types';

interface UseWhatsAppConnectionReturn {
  status: WhatsAppStatus;
  qrCode: string | null;
  phoneNumber: string | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export function useWhatsAppConnection(): UseWhatsAppConnectionReturn {
  const [status, setStatus] = useState<WhatsAppStatus>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await whatsAppApiService.getConnectionStatus();
      
      if (response.success && response.data) {
        if (response.data.connected) {
          setStatus('connected');
          setQrCode(null);
          setError(null);
        } else {
          setStatus('disconnected');
          setQrCode(null);
        }
      } else {
        setError(response.error || 'Failed to get status');
      }
    } catch (err) {
      console.error('Error refreshing status:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const response = await whatsAppApiService.initializeConnection();
      
      if (response.success && response.data) {
        if (response.data.status === 'qr_generated' && response.data.qr) {
          setQrCode(response.data.qr);
          setStatus('waiting_qr');
          toast.success('QR code generated. Please scan with WhatsApp.');
          
          // Start polling for authentication
          const pollInterval = setInterval(async () => {
            const statusResponse = await whatsAppApiService.getConnectionStatus();
            if (statusResponse.success && statusResponse.data?.connected) {
              setStatus('connected');
              setQrCode(null);
              setIsConnecting(false);
              clearInterval(pollInterval);
              toast.success('WhatsApp connected successfully!');
            }
          }, 2000);
          
          // Stop polling after 2 minutes
          setTimeout(() => {
            clearInterval(pollInterval);
            if (status === 'waiting_qr') {
              setIsConnecting(false);
              setError('QR code scan timeout');
              toast.error('QR code scan timeout. Please try again.');
            }
          }, 120000);
          
        } else if (response.data.status === 'authenticated') {
          setStatus('connected');
          setQrCode(null);
          toast.success('WhatsApp connected successfully!');
        }
      } else {
        setError(response.error || 'Failed to initialize connection');
        setStatus('error');
        toast.error(response.error || 'Failed to connect to WhatsApp');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setStatus('error');
      toast.error(errorMessage);
    } finally {
      setIsConnecting(false);
    }
  }, [status]);

  const disconnect = useCallback(async () => {
    try {
      const response = await whatsAppApiService.disconnectSession();
      
      if (response.success) {
        setStatus('disconnected');
        setPhoneNumber(null);
        setQrCode(null);
        setError(null);
        toast.success('WhatsApp disconnected successfully');
      } else {
        toast.error(response.error || 'Failed to disconnect');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(errorMessage);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    
    // Poll status every 30 seconds when connected
    const statusInterval = setInterval(() => {
      if (status === 'connected') {
        refreshStatus();
      }
    }, 30000);

    return () => {
      clearInterval(statusInterval);
    };
  }, [refreshStatus, status]);

  return {
    status,
    qrCode,
    phoneNumber,
    isConnecting,
    error,
    connect,
    disconnect,
    refreshStatus,
  };
}
