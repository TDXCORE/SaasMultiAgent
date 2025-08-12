import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@kit/supabase/require-user';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getClient } from '../clients';

export async function GET(request: NextRequest) {
  try {
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
        success: true,
        status: 'disconnected',
        connected: false,
        message: 'No WhatsApp client found'
      });
    }

    try {
      // Get connection status and stats
      const isConnected = client.isConnected();
      const stats = client.getConnectionStats();
      const connectionStatus = client.getConnectionStatus();

      return NextResponse.json({
        success: true,
        status: isConnected ? 'connected' : connectionStatus.state,
        connected: isConnected,
        qr: connectionStatus.qrCode, // Include QR code for polling fallback
        stats: {
          status: stats.status,
          uptime: stats.uptime,
          timeInCurrentState: stats.timeInCurrentState,
          reconnectionAttempts: stats.reconnectionStatus?.attempts || 0,
          maxReconnectionAttempts: stats.reconnectionStatus?.maxAttempts || 0,
          isReconnecting: stats.reconnectionStatus?.isReconnecting || false,
          nextAttemptIn: stats.reconnectionStatus?.nextAttemptIn
        },
        message: isConnected ? 'WhatsApp is connected' : `WhatsApp is ${connectionStatus.state}`
      });
    } catch (clientError) {
      console.error('Error getting client status:', clientError);
      
      // If client is in an error state, return basic status
      return NextResponse.json({
        success: true,
        status: 'error',
        connected: false,
        message: 'WhatsApp client is in an error state'
      });
    }

  } catch (error) {
    console.error('WhatsApp status error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      message: 'Internal server error'
    }, { status: 500 });
  }
}
