import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@kit/supabase/require-user';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getClient } from '../clients';

export async function GET(request: NextRequest) {
  try {
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
    const client = getClient(userId);
    if (!client) {
      return NextResponse.json({
        success: true,
        status: 'disconnected',
        connected: false,
        message: 'No WhatsApp client found'
      });
    }

    // Get connection status and stats
    const isConnected = client.isConnected();
    const stats = client.getConnectionStats();

    return NextResponse.json({
      success: true,
      status: isConnected ? 'connected' : 'disconnected',
      connected: isConnected,
      stats: {
        status: stats.status,
        uptime: stats.uptime,
        timeInCurrentState: stats.timeInCurrentState,
        reconnectionAttempts: stats.reconnectionStatus?.attempts || 0,
        lastError: stats.lastError
      },
      message: isConnected ? 'WhatsApp is connected' : 'WhatsApp is not connected'
    });

  } catch (error) {
    console.error('WhatsApp status error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      message: 'Internal server error'
    }, { status: 500 });
  }
}
