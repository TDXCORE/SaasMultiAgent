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
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

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
    setStatus('connecting');
    
    try {
      const response = await whatsAppApiService.initializeConnection();
      
      if (response.success && response.data) {
        if (response.data.status === 'qr_generated' && response.data.qr) {
          setQrCode(response.data.qr);
          setStatus('waiting_qr');
          toast.success('QR code generated. Please scan with WhatsApp.');
          
          // Set up SSE for real-time updates
          setupQrStream();
          
        } else if (response.data.status === 'authenticated') {
          setStatus('connected');
          setQrCode(null);
          toast.success('WhatsApp connected successfully!');
        } else if (response.data.status === 'waiting_for_scan') {
          setStatus('waiting_qr');
          toast.info('Connecting to existing session. Please wait...');
          setupQrStream();
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
  }, []);

  const setupQrStream = useCallback(() => {
    // Close existing connection if any
    if (eventSource) {
      eventSource.close();
    }
    
    const newEventSource = new EventSource('/api/whatsapp/qr-stream');
    setEventSource(newEventSource);
    
    newEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'qr_code':
            console.log('Received new QR code via SSE');
            setQrCode(data.qr);
            setStatus('waiting_qr');
            break;
            
          case 'state_change':
            console.log('Received state change via SSE:', data.state);
            if (data.state === 'authenticated') {
              setStatus('connected');
              setQrCode(null);
              setIsConnecting(false);
              newEventSource.close();
              setEventSource(null);
              toast.success('WhatsApp connected successfully!');
            } else if (data.state === 'disconnected') {
              setStatus('disconnected');
              setQrCode(null);
              setIsConnecting(false);
              newEventSource.close();
              setEventSource(null);
            }
            break;
            
          case 'authenticated':
            console.log('Received authentication via SSE');
            setStatus('connected');
            setQrCode(null);
            setIsConnecting(false);
            newEventSource.close();
            setEventSource(null);
            toast.success('WhatsApp connected successfully!');
            break;
            
          case 'error':
            console.log('Received error via SSE:', data.error);
            setError(data.error);
            setStatus('error');
            setIsConnecting(false);
            newEventSource.close();
            setEventSource(null);
            toast.error(data.error);
            break;
            
          case 'heartbeat':
            // Keep connection alive
            break;
        }
      } catch (err) {
        console.error('Error parsing SSE message:', err);
      }
    };
    
    newEventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      newEventSource.close();
      setEventSource(null);
      
      // Fallback to polling if SSE fails
      const pollInterval = setInterval(async () => {
        const statusResponse = await whatsAppApiService.getConnectionStatus();
        if (statusResponse.success && statusResponse.data?.connected) {
          setStatus('connected');
          setQrCode(null);
          setIsConnecting(false);
          clearInterval(pollInterval);
          toast.success('WhatsApp connected successfully!');
        }
      }, 3000);
      
      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (status === 'waiting_qr') {
          setIsConnecting(false);
          setError('Connection timeout');
          toast.error('Connection timeout. Please try again.');
        }
      }, 120000);
    };
  }, [eventSource, status]);

  const disconnect = useCallback(async () => {
    try {
      // Close SSE connection if active
      if (eventSource) {
        eventSource.close();
        setEventSource(null);
      }
      
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
  }, [eventSource]);

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
      // Clean up SSE connection on unmount
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [refreshStatus, status, eventSource]);

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
