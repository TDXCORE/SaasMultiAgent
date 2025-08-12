import { NextRequest, NextResponse } from 'next/server';
import { 
  createWhatsAppClient, 
  createWhatsAppConfig,
  WHATSAPP_EVENTS,
  WhatsAppAuthError,
  WhatsAppConnectionError
} from '@kit/whatsapp';
import { requireUser } from '@kit/supabase/require-user';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getClient, setClient, removeClient, hasClient } from '../clients';

export async function POST(request: NextRequest) {
  try {
    console.log('WhatsApp connect route called');
    
    // Get authenticated user
    const userResult = await requireUser(getSupabaseServerClient());
    if (userResult.error) {
      console.log('Authentication failed:', userResult.error);
      return NextResponse.json({
        success: false,
        error: 'authentication_required',
        message: 'User authentication required'
      }, { status: 401 });
    }
    const userId = userResult.data.id;
    console.log('User authenticated:', userId);

    // Check if client already exists
    if (hasClient(userId)) {
      const existingClient = getClient(userId);
      if (existingClient.isConnected()) {
        return NextResponse.json({
          success: true,
          status: 'already_connected',
          message: 'WhatsApp is already connected'
        });
      }
      // Clean up existing client if not connected
      await existingClient.cleanup();
      removeClient(userId);
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
        authTimeoutMs: 120000, // Increased to 2 minutes
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

    // Set up QR code listener
    let qrCode: string | null = null;
    let isAuthenticated = false;
    let connectionError: string | null = null;

    const qrPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('QR code generation timeout'));
      }, 120000); // Increased to 2 minutes for production

      client.onConnectionEvent('qr-listener', (event: any) => {
        if (event.type === WHATSAPP_EVENTS.QR_GENERATED) {
          clearTimeout(timeout);
          qrCode = event.qr;
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

  } catch (error) {
    console.error('WhatsApp connect error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      message: 'Internal server error'
    }, { status: 500 });
  }
}
