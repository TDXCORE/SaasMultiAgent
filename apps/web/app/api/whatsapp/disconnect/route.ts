import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@kit/supabase/require-user';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getClient, removeClient } from '../clients';

export async function POST(request: NextRequest) {
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
        status: 'already_disconnected',
        message: 'WhatsApp client was not connected'
      });
    }

    try {
      // Disconnect and cleanup
      await client.disconnect();
      await client.cleanup();
      
      // Remove from active clients
      removeClient(userId);

      return NextResponse.json({
        success: true,
        status: 'disconnected',
        message: 'WhatsApp disconnected successfully'
      });

    } catch (error) {
      console.error('Error during WhatsApp disconnect:', error);
      
      // Force cleanup even if disconnect failed
      try {
        await client.cleanup();
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
      
      // Remove from active clients regardless
      removeClient(userId);

      return NextResponse.json({
        success: true,
        status: 'disconnected',
        message: 'WhatsApp disconnected (with errors during cleanup)',
        warning: error instanceof Error ? error.message : 'Unknown error during disconnect'
      });
    }

  } catch (error) {
    console.error('WhatsApp disconnect error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      message: 'Internal server error'
    }, { status: 500 });
  }
}
