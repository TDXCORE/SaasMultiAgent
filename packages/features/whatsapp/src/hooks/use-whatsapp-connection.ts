'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { whatsAppApiService } from '../services';
import { WhatsAppStatus } from '../types';

interface UseWhatsAppConnectionReturn {
  status: WhatsAppStatus;
  qrCode: string | null;
  phoneNumber: string | null;
  isConnecting: boolean;
  error: string | null;
  connectionMethod: 'sse' | 'polling' | null;
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
  const [connectionMethod, setConnectionMethod] = useState<'sse' | 'polling' | null>(null);
  
  // Refs to track intervals and prevent memory leaks
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const immediatePollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
          // Also start polling immediately as backup
          startImmediatePolling();
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
  }, [setupQrStream, startImmediatePolling]);

  const startImmediatePolling = useCallback(() => {
    console.log('🔍 Starting immediate polling as backup...');
    setConnectionMethod('polling');
    
    // Clear existing interval if any
    if (immediatePollIntervalRef.current) {
      clearInterval(immediatePollIntervalRef.current);
    }
    
    immediatePollIntervalRef.current = setInterval(async () => {
      try {
        const statusResponse = await whatsAppApiService.getConnectionStatus();
        if (statusResponse.success && statusResponse.data) {
          if (statusResponse.data.connected) {
            setStatus('connected');
            setQrCode(null);
            setIsConnecting(false);
            if (immediatePollIntervalRef.current) {
              clearInterval(immediatePollIntervalRef.current);
              immediatePollIntervalRef.current = null;
            }
            return;
          }
          
          if (statusResponse.data.qr) {
            console.log('📱 QR code found via immediate polling');
            setQrCode(statusResponse.data.qr);
            setStatus('waiting_qr');
          }
        }
      } catch (error) {
        console.error('❌ Immediate polling error:', error);
      }
    }, 1000); // Poll every second initially
    
    // Clean up after 2 minutes
    setTimeout(() => {
      if (immediatePollIntervalRef.current) {
        clearInterval(immediatePollIntervalRef.current);
        immediatePollIntervalRef.current = null;
      }
    }, 120000);
  }, []);

  const setupQrStream = useCallback(() => {
    console.log('🔗 Setting up QR stream connection...');
    
    // Close existing connection if any
    if (eventSource) {
      console.log('📤 Closing existing EventSource connection');
      eventSource.close();
    }
    
    const newEventSource = new EventSource('/api/whatsapp/qr-stream');
    setEventSource(newEventSource);
    
    // Enhanced debugging
    newEventSource.addEventListener('open', () => {
      console.log('✅ SSE connection opened successfully');
      console.log('Connection details:', {
        url: newEventSource.url,
        readyState: newEventSource.readyState,
        timestamp: new Date().toISOString()
      });
      setConnectionMethod('sse');
      toast.success('Real-time connection established');
    });
    
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
      console.error('❌ SSE connection error occurred:', {
        error,
        readyState: newEventSource.readyState,
        url: newEventSource.url,
        timestamp: new Date().toISOString()
      });
      
      // Log readyState meanings for debugging  
      const stateMessages: Record<number, string> = {
        0: 'CONNECTING',
        1: 'OPEN', 
        2: 'CLOSED'
      };
      console.log(`SSE ReadyState: ${newEventSource.readyState} (${stateMessages[newEventSource.readyState] || 'UNKNOWN'})`);
      
      newEventSource.close();
      setEventSource(null);
      
      console.log('🔄 SSE failed, falling back to aggressive polling...');
      setConnectionMethod('polling');
      toast.warning('Using backup connection method...');
      
      // Clear existing polling interval
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      
      // More aggressive polling fallback
      let pollAttempts = 0;
      const maxPollAttempts = 60; // 2 minutes with 2s intervals
      
      pollIntervalRef.current = setInterval(async () => {
        pollAttempts++;
        console.log(`🔍 Polling attempt ${pollAttempts}/${maxPollAttempts}`);
        
        try {
          const statusResponse = await whatsAppApiService.getConnectionStatus();
          console.log('📊 Poll response:', statusResponse);
          
          if (statusResponse.success && statusResponse.data) {
            if (statusResponse.data.connected) {
              setStatus('connected');
              setQrCode(null);
              setIsConnecting(false);
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              toast.success('WhatsApp connected successfully!');
              return;
            }
            
            // Check if there's a QR code in the response
            if (statusResponse.data.qr) {
              console.log('📱 QR code found in poll response');
              setQrCode(statusResponse.data.qr);
              setStatus('waiting_qr');
            }
          }
        } catch (pollError) {
          console.error('❌ Polling error:', pollError);
        }
        
        // Stop polling after max attempts
        if (pollAttempts >= maxPollAttempts) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsConnecting(false);
          setError('Connection timeout');
          toast.error('Connection timeout. Please try again.');
        }
      }, 2000);
    };
  }, []);

  const disconnect = useCallback(async () => {
    try {
      // Close SSE connection if active
      if (eventSource) {
        eventSource.close();
        setEventSource(null);
      }
      
      // Clear all polling intervals
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      
      if (immediatePollIntervalRef.current) {
        clearInterval(immediatePollIntervalRef.current);
        immediatePollIntervalRef.current = null;
      }
      
      const response = await whatsAppApiService.disconnectSession();
      
      if (response.success) {
        setStatus('disconnected');
        setPhoneNumber(null);
        setQrCode(null);
        setError(null);
        setConnectionMethod(null);
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
      // Clean up all polling intervals
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (immediatePollIntervalRef.current) {
        clearInterval(immediatePollIntervalRef.current);
      }
    };
  }, [refreshStatus, status, eventSource]);

  return {
    status,
    qrCode,
    phoneNumber,
    isConnecting,
    error,
    connectionMethod,
    connect,
    disconnect,
    refreshStatus,
  };
}
