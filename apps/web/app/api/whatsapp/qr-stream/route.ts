import { NextRequest, NextResponse } from 'next/server';
import { 
  WHATSAPP_EVENTS
} from '@kit/whatsapp';
import { requireUser } from '@kit/supabase/require-user';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getClient, hasClient } from '../clients';

export async function GET(request: NextRequest) {
  try {
    console.log('WhatsApp QR stream route called');
    
    // Get authenticated user
    const userResult = await requireUser(getSupabaseServerClient());
    if (userResult.error) {
      return NextResponse.json({
        success: false,
        error: 'authentication_required',
        message: 'User authentication required'
      }, { status: 401 });
    }
    const userId = userResult.data.id;

    // Check if client exists
    if (!hasClient(userId)) {
      return NextResponse.json({
        success: false,
        error: 'no_client',
        message: 'No WhatsApp client found. Please connect first.'
      }, { status: 404 });
    }

    const client = getClient(userId);

    // Create SSE response
    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();

    // Send initial connection message
    const sendMessage = (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      writer.write(encoder.encode(message));
    };

    // Send heartbeat to keep connection alive (every 10s for Render.com)
    const heartbeat = setInterval(() => {
      sendMessage({ type: 'heartbeat', ts: Date.now() });
    }, 10000);

    // Listen for QR code events
    const qrListener = (event: any) => {
      if (event.type === WHATSAPP_EVENTS.QR_GENERATED) {
        console.log('Sending QR code via SSE:', event.qr?.substring(0, 20) + '...');
        sendMessage({
          type: 'qr_code',
          qr: event.qr,
          timestamp: Date.now()
        });
      }
    };

    // Listen for state changes
    const stateListener = (event: any) => {
      if (event.type === WHATSAPP_EVENTS.STATE_CHANGED) {
        console.log('Sending state change via SSE:', event.state);
        sendMessage({
          type: 'state_change',
          state: event.state,
          timestamp: Date.now()
        });
      }
    };

    // Listen for authentication
    const authListener = (event: any) => {
      if (event.type === WHATSAPP_EVENTS.AUTHENTICATED) {
        console.log('Sending authentication success via SSE');
        sendMessage({
          type: 'authenticated',
          timestamp: Date.now()
        });
      }
    };

    // Listen for errors
    const errorListener = (event: any) => {
      if (event.type === WHATSAPP_EVENTS.ERROR) {
        console.log('Sending error via SSE:', event.error?.message);
        sendMessage({
          type: 'error',
          error: event.error?.message || 'Unknown error',
          timestamp: Date.now()
        });
      }
    };

    // Register event listeners
    client.onConnectionEvent('qr-stream-qr', qrListener);
    client.onConnectionEvent('qr-stream-state', stateListener);
    client.onConnectionEvent('qr-stream-auth', authListener);
    client.onConnectionEvent('qr-stream-error', errorListener);

    // Send initial status and current QR if available
    const currentStatus = client.getConnectionStatus();
    sendMessage({
      type: 'connected',
      message: 'QR stream connected',
      currentState: currentStatus.state,
      timestamp: Date.now()
    });

    // If there's a current QR code, send it immediately
    if (currentStatus.state === 'waiting_qr' && currentStatus.qrCode) {
      console.log('Sending existing QR code via SSE');
      sendMessage({
        type: 'qr_code',
        qr: currentStatus.qrCode,
        timestamp: Date.now()
      });
    }

    // Handle client disconnect
    request.signal.addEventListener('abort', () => {
      console.log('QR stream client disconnected');
      clearInterval(heartbeat);
      client.offConnectionEvent('qr-stream-qr');
      client.offConnectionEvent('qr-stream-state');
      client.offConnectionEvent('qr-stream-auth');
      client.offConnectionEvent('qr-stream-error');
      writer.close();
    });

    return new NextResponse(responseStream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Connection': 'keep-alive',
        'Content-Encoding': 'none',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Authorization',
        'Access-Control-Expose-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error('WhatsApp QR stream error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      message: 'Internal server error'
    }, { status: 500 });
  }
}