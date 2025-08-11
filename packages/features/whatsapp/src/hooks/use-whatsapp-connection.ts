'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { whatsAppApiService } from '../services';
import { WhatsAppConnectionEvent, WhatsAppStatus } from '../types';

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

export function useWhatsAppConnection(userId: string): UseWhatsAppConnectionReturn {
  const [status, setStatus] = useState<WhatsAppStatus>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = whatsAppApiService.createWebSocketConnection(userId);
    if (!ws) return;

    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WhatsApp WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data: WhatsAppConnectionEvent = JSON.parse(event.data);
        
        switch (data.type) {
          case 'qr_generated':
            setQrCode(data.qr || null);
            setStatus('waiting_qr');
            setIsConnecting(false);
            break;
          case 'authenticated':
            setStatus('connected');
            setPhoneNumber(data.phone_number || null);
            setQrCode(null);
            setIsConnecting(false);
            toast.success('WhatsApp connected successfully!');
            break;
          case 'disconnected':
            setStatus('disconnected');
            setPhoneNumber(null);
            setQrCode(null);
            setIsConnecting(false);
            break;
          case 'error':
            setStatus('error');
            setError(data.error || 'Unknown error');
            setIsConnecting(false);
            toast.error(data.error || 'WhatsApp connection error');
            break;
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection error');
      setStatus('error');
      setIsConnecting(false);
    };

    ws.onclose = () => {
      console.log('WhatsApp WebSocket disconnected');
      wsRef.current = null;
    };
  }, [userId]);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await whatsAppApiService.getConnectionStatus(userId);
      
      if (response.success && response.data) {
        if (response.data.connected) {
          setStatus('connected');
          setPhoneNumber(response.data.phone || null);
          setQrCode(null);
        } else {
          setStatus('disconnected');
          setPhoneNumber(null);
          setQrCode(null);
        }
      }
    } catch (err) {
      console.error('Error refreshing status:', err);
    }
  }, [userId]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const response = await whatsAppApiService.initializeConnection(userId);
      
      if (response.success) {
        setStatus('connecting');
        connectWebSocket();
      } else {
        setError(response.error || 'Failed to initialize connection');
        setStatus('error');
        setIsConnecting(false);
        toast.error(response.error || 'Failed to connect to WhatsApp');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setStatus('error');
      setIsConnecting(false);
      toast.error(errorMessage);
    }
  }, [userId, connectWebSocket]);

  const disconnect = useCallback(async () => {
    try {
      const response = await whatsAppApiService.disconnectSession(userId);
      
      if (response.success) {
        setStatus('disconnected');
        setPhoneNumber(null);
        setQrCode(null);
        toast.success('WhatsApp disconnected successfully');
      } else {
        toast.error(response.error || 'Failed to disconnect');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(errorMessage);
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [userId]);

  useEffect(() => {
    refreshStatus();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [refreshStatus, connectWebSocket]);

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