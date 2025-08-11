/**
 * Basic WhatsApp Integration Example
 * 
 * This example demonstrates how to set up and use the WhatsApp integration
 * package with different authentication strategies and message types.
 */

import { 
  createWhatsAppClient, 
  createWhatsAppConfig,
  WHATSAPP_EVENTS,
  WhatsAppAuthError,
  WhatsAppConnectionError,
  type WhatsAppClient
} from '../src';

// Example 1: Basic setup with database authentication
async function basicDatabaseExample() {
  console.log('=== Basic Database Authentication Example ===');
  
  // Create configuration for database authentication
  const config = createWhatsAppConfig('database', {
    auth: {
      strategy: 'database',
      clientId: 'my-whatsapp-bot-v1',
      restartOnAuthFail: true
    },
    connection: {
      takeoverOnConflict: false,
      takeoverTimeoutMs: 30000,
      qrMaxRetries: 3,
      authTimeoutMs: 60000,
      reconnectIntervalMs: 5000,
      heartbeatIntervalMs: 30000,
      maxReconnectAttempts: 5
    },
    logger: {
      level: 'info',
      enableConsole: true,
      enableFile: false
    }
  });

  // Create client (you would pass your actual Supabase client here)
  const client = createWhatsAppClient(config, 'user-123', null);

  try {
    // Set up event listeners
    setupEventListeners(client);

    // Initialize and connect
    console.log('Initializing WhatsApp client...');
    await client.initialize();
    
    console.log('Connecting to WhatsApp...');
    await client.connect();

    // Wait for connection
    await waitForConnection(client);

    // Send some example messages
    await sendExampleMessages(client);

  } catch (error) {
    console.error('Error in basic example:', error);
  } finally {
    // Clean up
    await client.cleanup();
  }
}

// Example 2: File-based authentication
async function fileAuthExample() {
  console.log('=== File Authentication Example ===');
  
  const config = createWhatsAppConfig('local', {
    auth: {
      strategy: 'local',
      dataPath: './whatsapp-sessions',
      clientId: 'file-based-client'
    }
  });

  const client = createWhatsAppClient(config);

  try {
    setupEventListeners(client);
    await client.initialize();
    await client.connect();
    await waitForConnection(client);
    
    // Example: Send a scheduled message
    console.log('Sending scheduled message...');
    const messageId = await client.sendMessage(
      '1234567890@c.us', 
      'This is a scheduled message!',
      {
        priority: 'high',
        maxRetries: 5
      }
    );
    
    console.log('Message queued with ID:', messageId);

  } catch (error) {
    console.error('Error in file auth example:', error);
  } finally {
    await client.cleanup();
  }
}

// Example 3: Advanced message types
async function advancedMessagingExample() {
  console.log('=== Advanced Messaging Example ===');
  
  const config = createWhatsAppConfig('database');
  const client = createWhatsAppClient(config, 'advanced-user');

  try {
    setupEventListeners(client);
    await client.initialize();
    await client.connect();
    await waitForConnection(client);

    const chatId = '1234567890@c.us';

    // Text message with mentions
    await client.sendMessage(chatId, 'Hello @user!', {
      mentions: ['1234567890@c.us']
    });

    // Media message (you would use actual file data)
    await client.sendMessage(chatId, {
      media: {
        data: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        filename: 'example.jpg'
      },
      caption: 'Check out this image!'
    });

    // Location message
    await client.sendMessage(chatId, {
      location: {
        latitude: 40.7128,
        longitude: -74.0060,
        description: 'New York City, NY'
      }
    });

    // Contact message
    await client.sendMessage(chatId, {
      contact: {
        name: 'John Doe',
        phone: '+1234567890',
        vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:John Doe\nTEL:+1234567890\nEND:VCARD'
      }
    });

    // Poll message (if supported)
    await client.sendMessage(chatId, {
      poll: {
        question: 'What\'s your favorite color?',
        options: ['Red', 'Blue', 'Green', 'Yellow'],
        multipleAnswers: false
      }
    });

  } catch (error) {
    console.error('Error in advanced messaging example:', error);
  } finally {
    await client.cleanup();
  }
}

// Example 4: Connection monitoring and statistics
async function connectionMonitoringExample() {
  console.log('=== Connection Monitoring Example ===');
  
  const config = createWhatsAppConfig('database');
  const client = createWhatsAppClient(config, 'monitoring-user');

  try {
    setupEventListeners(client);
    
    // Set up periodic stats monitoring
    const statsInterval = setInterval(() => {
      const stats = client.getConnectionStats();
      console.log('Connection Stats:', {
        status: stats.status,
        uptime: `${Math.floor(stats.uptime / 1000)}s`,
        timeInCurrentState: `${Math.floor(stats.timeInCurrentState / 1000)}s`,
        reconnectionAttempts: stats.reconnectionStatus.attempts
      });
    }, 10000);

    await client.initialize();
    await client.connect();
    await waitForConnection(client);

    // Keep running for a while to see stats
    console.log('Monitoring connection for 60 seconds...');
    await new Promise(resolve => setTimeout(resolve, 60000));

    clearInterval(statsInterval);

  } catch (error) {
    console.error('Error in monitoring example:', error);
  } finally {
    await client.cleanup();
  }
}

// Example 5: Error handling and recovery
async function errorHandlingExample() {
  console.log('=== Error Handling Example ===');
  
  const config = createWhatsAppConfig('database', {
    connection: {
      takeoverOnConflict: false,
      takeoverTimeoutMs: 30000,
      qrMaxRetries: 5,
      authTimeoutMs: 60000,
      reconnectIntervalMs: 2000,
      heartbeatIntervalMs: 30000,
      maxReconnectAttempts: 3
    }
  });
  
  const client = createWhatsAppClient(config, 'error-test-user');

  try {
    // Set up comprehensive error handling
    client.onConnectionEvent('error-handler', (event) => {
      switch (event.type) {
        case WHATSAPP_EVENTS.ERROR:
          console.error('WhatsApp Error:', event.error);
          break;
        case WHATSAPP_EVENTS.DISCONNECTED:
          console.warn('WhatsApp Disconnected');
          break;
        case WHATSAPP_EVENTS.RECONNECTING:
          console.info('WhatsApp Reconnecting...');
          break;
      }
    });

    await client.initialize();
    
    // Simulate connection issues
    try {
      await client.connect();
    } catch (error) {
      if (error instanceof WhatsAppAuthError) {
        console.error('Authentication failed:', error.code);
        // Handle auth errors (e.g., show QR code, request re-authentication)
      } else if (error instanceof WhatsAppConnectionError) {
        console.error('Connection failed:', error.code);
        if (error.recoverable) {
          console.log('Error is recoverable, will retry...');
        }
      }
    }

  } catch (error) {
    console.error('Error in error handling example:', error);
  } finally {
    await client.cleanup();
  }
}

// Helper function to set up event listeners
function setupEventListeners(client: any) {
  // QR Code event
  client.onConnectionEvent('qr-listener', (event: any) => {
    if (event.type === WHATSAPP_EVENTS.QR_GENERATED) {
      console.log('📱 QR Code generated! Scan with WhatsApp:');
      console.log(event.qr);
      // In a real app, you'd display this QR code to the user
    }
  });

  // Authentication events
  client.onConnectionEvent('auth-listener', (event: any) => {
    switch (event.type) {
      case WHATSAPP_EVENTS.AUTHENTICATED:
        console.log('✅ WhatsApp authenticated successfully');
        break;
      case WHATSAPP_EVENTS.PAIRING_CODE_GENERATED:
        console.log('📱 Pairing code:', event.pairing_code);
        break;
    }
  });

  // Connection state changes
  client.onConnectionEvent('state-listener', (event: any) => {
    if (event.type === WHATSAPP_EVENTS.STATE_CHANGED) {
      console.log(`🔄 State changed to: ${event.state}`);
    }
  });

  // Message events
  client.onMessageEvent('message-listener', (event: string, data: any) => {
    switch (event) {
      case 'message_received':
        console.log('📨 Message received:', data.body);
        break;
      case 'message_sent':
        console.log('📤 Message sent:', data.id);
        break;
      case 'message_failed':
        console.log('❌ Message failed:', data.id, data.lastError);
        break;
    }
  });
}

// Helper function to wait for connection
async function waitForConnection(client: any, timeout = 60000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkConnection = () => {
      if (client.isConnected()) {
        console.log('✅ Connected to WhatsApp!');
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error('Connection timeout'));
      } else {
        setTimeout(checkConnection, 1000);
      }
    };
    
    checkConnection();
  });
}

// Helper function to send example messages
async function sendExampleMessages(client: any) {
  const chatId = '1234567890@c.us'; // Replace with actual chat ID
  
  try {
    console.log('Sending example messages...');
    
    // Simple text message
    await client.sendMessage(chatId, 'Hello from WhatsApp integration! 👋');
    
    // Message with options
    await client.sendMessage(chatId, 'This is a high priority message', {
      priority: 'high',
      maxRetries: 3
    });
    
    console.log('✅ Example messages sent successfully');
    
    // Get message history
    const history = client.getMessageHistory(chatId, 10);
    console.log(`📚 Message history: ${history.length} messages`);
    
  } catch (error) {
    console.error('❌ Failed to send example messages:', error);
  }
}

// Main execution
async function runExamples() {
  console.log('🚀 Starting WhatsApp Integration Examples\n');
  
  try {
    // Run examples (uncomment the ones you want to test)
    
    // await basicDatabaseExample();
    // await fileAuthExample();
    // await advancedMessagingExample();
    // await connectionMonitoringExample();
    await errorHandlingExample();
    
  } catch (error) {
    console.error('❌ Example execution failed:', error);
  }
  
  console.log('\n✅ Examples completed');
}

// Export for use in other files
export {
  basicDatabaseExample,
  fileAuthExample,
  advancedMessagingExample,
  connectionMonitoringExample,
  errorHandlingExample,
  runExamples
};

// Run if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}
