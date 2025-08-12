import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@kit/supabase/require-user';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getClient } from '../clients';

export async function GET(request: NextRequest) {
  try {
    console.log('WhatsApp QR stream route called');
    
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
    const userId = user.id;

    // Check if client exists
    const client = getClient(userId);
    if (!client) {
      return NextResponse.json({
        success: false,
        error: 'no_client',
        message: 'No WhatsApp client found'
      }, { status: 404 });
    }

    // Set up Server-Sent Events
    const encoder = new TextEncoder();
    let isConnectionClosed = false;
    
    const stream = new ReadableStream({
      start(controller) {
        console.log('SSE stream started for user:', userId);
        
        // Send initial connection message
        const initialData = `data: ${JSON.stringify({
          type: 'connected',
          timestamp: new Date().toISOString()
        })}\n\n`;
        controller.enqueue(encoder.encode(initialData));

        // Check for existing QR code
        try {
          const connectionStatus = client.getConnectionStatus();
          if (connectionStatus.qrCode) {
            console.log('Sending existing QR code via SSE');
            const qrData = `data: ${JSON.stringify({
              type: 'qr',
              qr: connectionStatus.qrCode,
              timestamp: new Date().toISOString()
            })}\n\n`;
            controller.enqueue(encoder.encode(qrData));
          }
        } catch (error) {
          console.error('Error getting existing QR code:', error);
        }

        // QR code debouncing
        let lastQrTime = 0;
        const QR_DEBOUNCE_MS = 3000; // 3 second debounce for SSE
        
        // Set up event listeners
        const qrListener = (event: any) => {
          if (isConnectionClosed) return;
          
          const now = Date.now();
          
          // Debounce QR code events
          if (now - lastQrTime < QR_DEBOUNCE_MS) {
            console.log('QR code SSE event debounced');
            return;
          }
          
          lastQrTime = now;
          
          try {
            console.log('Sending QR code via SSE:', event.qr?.substring(0, 20) + '...');
            const data = `data: ${JSON.stringify({
              type: 'qr',
              qr: event.qr,
              timestamp: new Date().toISOString()
            })}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch (error) {
            console.error('Error sending QR via SSE:', error);
          }
        };

        const authListener = (event: any) => {
          if (isConnectionClosed) return;
          
          try {
            const data = `data: ${JSON.stringify({
              type: 'authenticated',
              timestamp: new Date().toISOString()
            })}\n\n`;
            controller.enqueue(encoder.encode(data));
            
            // Close stream after authentication
            setTimeout(() => {
              if (!isConnectionClosed) {
                controller.close();
              }
            }, 1000);
          } catch (error) {
            console.error('Error sending auth event via SSE:', error);
          }
        };

        const errorListener = (event: any) => {
          if (isConnectionClosed) return;
          
          try {
            const data = `data: ${JSON.stringify({
              type: 'error',
              error: event.error?.message || 'Unknown error',
              timestamp: new Date().toISOString()
            })}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch (error) {
            console.error('Error sending error event via SSE:', error);
          }
        };

        // Register listeners
        client.onConnectionEvent('qr-sse-listener', qrListener);
        client.onConnectionEvent('auth-sse-listener', authListener);
        client.onConnectionEvent('error-sse-listener', errorListener);

        // Cleanup function
        const cleanup = () => {
          if (isConnectionClosed) return;
          isConnectionClosed = true;
          
          console.log('QR stream client disconnected');
          
          // Remove event listeners
          try {
            client.offConnectionEvent('qr-sse-listener');
            client.offConnectionEvent('auth-sse-listener');
            client.offConnectionEvent('error-sse-listener');
          } catch (error) {
            console.error('Error removing SSE listeners:', error);
          }
        };

        // Set up cleanup on stream close
        request.signal.addEventListener('abort', cleanup);
        
        // Auto-cleanup after 5 minutes
        setTimeout(() => {
          if (!isConnectionClosed) {
            cleanup();
            controller.close();
          }
        }, 5 * 60 * 1000);
      },
      
      cancel() {
        isConnectionClosed = true;
        console.log('QR stream cancelled');
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
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
