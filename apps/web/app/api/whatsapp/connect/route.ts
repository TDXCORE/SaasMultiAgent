import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@kit/supabase/require-user';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { 
  WhatsAppClient,
  createWhatsAppConfig,
  createWhatsAppClient,
  WhatsAppAuthError,
  WhatsAppConnectionError,
  WHATSAPP_EVENTS
} from '@kit/whatsapp';
import { 
  getClient, 
  setClient, 
  hasClient, 
  canAttemptConnection, 
  lockConnection, 
  unlockConnection,
  isConnectionLocked,
  removeClient
} from '../clients';

export async function POST(request: NextRequest) {
  let userId: string | undefined;
  
  try {
    console.log('WhatsApp connect route called');
    
    // Get authenticated user
    const supabase = getSupabaseServerClient();
    const userResult = await requireUser(supabase);
    
    // Handle different return types from requireUser
    if ('error' in userResult && userResult.error) {
      return NextResponse.json({
        success: false,
        error: 'authentication_required',
        message: 'User authentication required'
      }, { status: 401 });
    }
    
    // Extract user ID safely
    const user = 'data' in userResult ? userResult.data : userResult;
    userId = user.id;
    console.log('User authenticated:', userId);

    // Check if connection is locked (another attempt in progress)
    if (isConnectionLocked(userId)) {
      return NextResponse.json({
        success: false,
        error: 'Connection attempt already in progress',
        status: 'connecting'
      }, { status: 429 });
    }

    // Check if user can attempt a new connection
    if (!canAttemptConnection(userId)) {
      return NextResponse.json({
        success: false,
        error: 'Please wait before attempting another connection',
        status: 'rate_limited'
      }, { status: 429 });
    }

    // Lock connection to prevent concurrent attempts
    lockConnection(userId);

    try {
      // Check if client already exists and is connected
      if (hasClient(userId)) {
        const existingClient = getClient(userId);
        if (existingClient) {
          const status = existingClient.getStatus();
          
          console.log('Existing client found with status:', status);
          
          if (status === 'connected') {
            unlockConnection(userId);
            return NextResponse.json({
              success: true,
              status: 'connected',
              message: 'Already connected to WhatsApp'
            });
          }
          
          if (status === 'waiting_qr') {
            const connectionStatus = existingClient.getConnectionStatus();
            unlockConnection(userId);
            return NextResponse.json({
              success: true,
              status: 'waiting_qr',
              qrCode: connectionStatus.qrCode,
              message: 'QR code available'
            });
          }
          
          // Clean up existing client if in error state
          if (status === 'error' || status === 'disconnected') {
            console.log('Cleaning up existing client in error state');
            await existingClient.cleanup();
            removeClient(userId);
          }
        }
      }

      // Create WhatsApp configuration
      const config = createWhatsAppConfig('database', {
        auth: {
          strategy: 'database',
          clientId: `whatsapp-${userId}`,
          restartOnAuthFail: true
        },
        connection: {
          takeoverOnConflict: false,
          takeoverTimeoutMs: 60000, // Increased for production
          qrMaxRetries: 5, // More retries
          authTimeoutMs: 180000, // Increased to 3 minutes
          reconnectIntervalMs: 10000, // Slower reconnection
          heartbeatIntervalMs: 60000, // Longer heartbeat
          maxReconnectAttempts: 3 // Fewer attempts to avoid resource exhaustion
        },
        logger: {
          level: 'info',
          enableConsole: true,
          enableFile: false
        }
      });

      // Create client with Supabase client
      const supabaseClient = getSupabaseServerClient();
      const client = createWhatsAppClient(config, userId, supabaseClient);

      // Store client
      setClient(userId, client);

      // Set up QR code listener with debouncing
      let qrCode: string | null = null;
      let isAuthenticated = false;
      let connectionError: string | null = null;
      let lastQrTime = 0;
      const QR_DEBOUNCE_MS = 2000; // 2 second debounce

      const qrPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('QR code generation timeout'));
        }, 180000); // Increased to 3 minutes for production

        client.onConnectionEvent('qr-listener', (event: any) => {
          if (event.type === WHATSAPP_EVENTS.QR_GENERATED) {
            const now = Date.now();
            
            // Debounce QR code events
            if (now - lastQrTime < QR_DEBOUNCE_MS) {
              console.log('QR code event debounced');
              return;
            }
            
            lastQrTime = now;
            clearTimeout(timeout);
            qrCode = event.qr;
            console.log('QR code received and processed');
            resolve(event.qr);
          }
        });

        client.onConnectionEvent('auth-listener', (event: any) => {
          if (event.type === WHATSAPP_EVENTS.AUTHENTICATED) {
            clearTimeout(timeout);
            isAuthenticated = true;
            resolve('authenticated');
          }
        });

        client.onConnectionEvent('error-listener', (event: any) => {
          if (event.type === WHATSAPP_EVENTS.ERROR) {
            clearTimeout(timeout);
            connectionError = event.error?.message || 'Unknown error';
            reject(new Error(connectionError || 'Unknown error'));
          }
        });
      });

      // Initialize and connect
      console.log('Initializing WhatsApp client...');
      await client.initialize();
      console.log('WhatsApp client initialized, connecting...');
      await client.connect();
      console.log('WhatsApp client connect called, waiting for QR or auth...');

      // Wait for QR code or authentication
      try {
        const result = await qrPromise;
        
        unlockConnection(userId);
        
        if (result === 'authenticated') {
          return NextResponse.json({
            success: true,
            status: 'authenticated',
            message: 'WhatsApp authenticated successfully'
          });
        } else {
          return NextResponse.json({
            success: true,
            status: 'qr_generated',
            qr: result,
            message: 'QR code generated. Please scan with WhatsApp.'
          });
        }
      } catch (error) {
        console.error('Error waiting for QR or auth:', error);
        
        // Clean up on error
        await client.cleanup();
        removeClient(userId);
        unlockConnection(userId);
        
        if (error instanceof WhatsAppAuthError) {
          console.error('WhatsApp auth error:', error.code, error.message);
          return NextResponse.json({
            success: false,
            error: 'authentication_failed',
            message: `Authentication failed: ${error.code}`
          }, { status: 400 });
        } else if (error instanceof WhatsAppConnectionError) {
          console.error('WhatsApp connection error:', error.code, error.message);
          return NextResponse.json({
            success: false,
            error: 'connection_failed',
            message: `Connection failed: ${error.code}`,
            recoverable: error.recoverable
          }, { status: 400 });
        } else {
          console.error('Unknown WhatsApp error:', error);
          return NextResponse.json({
            success: false,
            error: 'unknown_error',
            message: error instanceof Error ? error.message : 'Unknown error occurred'
          }, { status: 500 });
        }
      }
    } catch (innerError) {
      // Unlock connection on any error
      if (userId) {
        unlockConnection(userId);
      }
      throw innerError;
    }

  } catch (error) {
    console.error('WhatsApp connect error:', error);
    
    // Ensure connection is unlocked
    if (userId) {
      unlockConnection(userId);
    }
    
    return NextResponse.json({
      success: false,
      error: 'server_error',
      message: 'Internal server error'
    }, { status: 500 });
  }
}
