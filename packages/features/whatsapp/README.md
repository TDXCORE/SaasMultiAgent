# WhatsApp Integration Package

A comprehensive WhatsApp integration package for the SaaS Multi-Agent platform, providing robust authentication, connection management, and messaging capabilities.

## Features

- 🔐 **Multiple Authentication Strategies**: Database, file-based, and remote authentication
- 🔄 **Automatic Reconnection**: Smart reconnection logic with exponential backoff
- 📱 **Message Management**: Queue-based message handling with retry logic
- 📊 **Connection Monitoring**: Real-time connection state tracking and statistics
- 🎯 **Event-Driven Architecture**: Comprehensive event system for all WhatsApp interactions
- 🛡️ **Error Handling**: Robust error handling with detailed error types
- 📝 **TypeScript Support**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install whatsapp-web.js
# or
yarn add whatsapp-web.js
```

## Quick Start

```typescript
import { createWhatsAppClient, createWhatsAppConfig } from '@features/whatsapp';

// Create configuration
const config = createWhatsAppConfig('database', {
  auth: {
    clientId: 'my-whatsapp-bot'
  },
  connection: {
    maxReconnectAttempts: 5
  }
});

// Create client
const client = createWhatsAppClient(config, 'user-123', supabaseClient);

// Initialize and connect
await client.initialize();
await client.connect();

// Send a message
await client.sendMessage('1234567890@c.us', 'Hello from WhatsApp!');
```

## Architecture

### Core Components

#### 1. WhatsAppClient
The main client class that orchestrates all WhatsApp functionality.

```typescript
const client = new WhatsAppClient(config, userId, supabaseClient);
```

#### 2. Authentication Strategies
- **DatabaseAuthStrategy**: Stores session data in Supabase
- **FileAuthStrategy**: Stores session data in local files
- **BaseAuthStrategy**: Abstract base for custom strategies

#### 3. Connection Management
- **ConnectionStateManager**: Tracks connection states and transitions
- **ReconnectionManager**: Handles automatic reconnection with smart backoff

#### 4. Message Management
- **MessageManager**: Handles message queuing, sending, and history

### Authentication Strategies

#### Database Authentication (Recommended)
```typescript
const config = createWhatsAppConfig('database', {
  auth: {
    clientId: 'unique-client-id'
  }
});
```

#### File Authentication
```typescript
const config = createWhatsAppConfig('local', {
  auth: {
    dataPath: './whatsapp-sessions'
  }
});
```

### Connection States

The client tracks various connection states:

- `disconnected` - Not connected
- `connecting` - Attempting to connect
- `waiting_qr` - Waiting for QR code scan
- `pairing` - Pairing in progress
- `connected` - Successfully connected
- `error` - Connection error occurred

### Event System

```typescript
// Connection events
client.onConnectionEvent('my-listener', (event) => {
  console.log('Connection event:', event.type);
  
  if (event.type === 'qr_generated') {
    console.log('QR Code:', event.qr);
  }
});

// Message events
client.onMessageEvent('message-listener', (event, data) => {
  if (event === 'message_received') {
    console.log('New message:', data);
  }
});
```

## API Reference

### WhatsAppClient

#### Methods

##### `initialize(): Promise<void>`
Initialize the WhatsApp client.

##### `connect(): Promise<void>`
Connect to WhatsApp.

##### `disconnect(): Promise<void>`
Disconnect from WhatsApp.

##### `sendMessage(to: string, content: MessageContent, options?: MessageOptions): Promise<string>`
Send a message.

```typescript
// Text message
await client.sendMessage('1234567890@c.us', 'Hello!');

// Media message
await client.sendMessage('1234567890@c.us', {
  media: {
    data: buffer,
    mimetype: 'image/jpeg',
    filename: 'image.jpg'
  },
  caption: 'Check this out!'
});

// Location message
await client.sendMessage('1234567890@c.us', {
  location: {
    latitude: 40.7128,
    longitude: -74.0060,
    description: 'New York City'
  }
});
```

##### `getStatus(): WhatsAppStatus`
Get current connection status.

##### `isConnected(): boolean`
Check if connected to WhatsApp.

##### `getMessageHistory(chatId: string, limit?: number): WhatsAppMessage[]`
Get message history for a chat.

##### `getPendingMessages(chatId?: string): QueuedMessage[]`
Get pending messages.

##### `cancelMessage(messageId: string): boolean`
Cancel a queued message.

##### `getConnectionStats()`
Get detailed connection statistics.

### Configuration

#### WhatsAppConfig

```typescript
interface WhatsAppConfig {
  auth: AuthConfig;
  connection: ConnectionConfig;
  puppeteer?: any;
  logger?: WhatsAppLogger;
  environment?: 'development' | 'production';
  library?: LibraryConfig;
}
```

#### AuthConfig

```typescript
interface AuthConfig {
  strategy: 'local' | 'remote' | 'database' | 'no_auth';
  clientId?: string;
  dataPath?: string;
  restartOnAuthFail?: boolean;
  backupSyncIntervalMs?: number;
  rmMaxRetries?: number;
}
```

#### ConnectionConfig

```typescript
interface ConnectionConfig {
  takeoverOnConflict: boolean;
  takeoverTimeoutMs: number;
  qrMaxRetries: number;
  authTimeoutMs: number;
  reconnectIntervalMs: number;
  heartbeatIntervalMs: number;
  maxReconnectAttempts: number;
  userAgent?: string;
  bypassCSP?: boolean;
}
```

## Message Types

### Text Messages
```typescript
await client.sendMessage(chatId, 'Simple text message');
```

### Media Messages
```typescript
await client.sendMessage(chatId, {
  media: {
    data: fs.readFileSync('image.jpg'),
    mimetype: 'image/jpeg',
    filename: 'image.jpg'
  },
  caption: 'Optional caption'
});
```

### Location Messages
```typescript
await client.sendMessage(chatId, {
  location: {
    latitude: 40.7128,
    longitude: -74.0060,
    description: 'New York City'
  }
});
```

### Contact Messages
```typescript
await client.sendMessage(chatId, {
  contact: {
    name: 'John Doe',
    phone: '+1234567890',
    vcard: 'BEGIN:VCARD...'
  }
});
```

## Error Handling

The package provides specific error types:

```typescript
import { WhatsAppAuthError, WhatsAppConnectionError } from '@features/whatsapp';

try {
  await client.connect();
} catch (error) {
  if (error instanceof WhatsAppAuthError) {
    console.error('Authentication error:', error.code);
  } else if (error instanceof WhatsAppConnectionError) {
    console.error('Connection error:', error.code, error.recoverable);
  }
}
```

## Best Practices

### 1. Use Database Authentication in Production
```typescript
const config = createWhatsAppConfig('database', {
  auth: {
    clientId: process.env.WHATSAPP_CLIENT_ID
  }
});
```

### 2. Handle QR Code Events
```typescript
client.onConnectionEvent('qr-handler', (event) => {
  if (event.type === 'qr_generated') {
    // Display QR code to user
    displayQRCode(event.qr);
  }
});
```

### 3. Implement Proper Error Handling
```typescript
client.onConnectionEvent('error-handler', (event) => {
  if (event.type === 'error') {
    console.error('WhatsApp error:', event.error);
    // Implement your error handling logic
  }
});
```

### 4. Clean Up Resources
```typescript
process.on('SIGINT', async () => {
  await client.cleanup();
  process.exit(0);
});
```

## Environment Variables

```env
# WhatsApp Configuration
WHATSAPP_CLIENT_ID=your-unique-client-id
WHATSAPP_DATA_PATH=./whatsapp-sessions
WHATSAPP_MAX_RECONNECT_ATTEMPTS=10
WHATSAPP_RECONNECT_INTERVAL=5000

# Supabase (for database auth)
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Troubleshooting

### Common Issues

#### 1. QR Code Not Generating
- Ensure puppeteer is properly configured
- Check if headless mode is appropriate for your environment

#### 2. Authentication Failures
- Verify session data is being stored correctly
- Check if the authentication strategy is properly configured

#### 3. Connection Drops
- Review reconnection settings
- Check network stability
- Verify WhatsApp Web is not open in another browser

#### 4. Message Send Failures
- Ensure the client is connected
- Verify the recipient number format
- Check message content and size limits

### Debug Mode

Enable debug logging:

```typescript
const config = createWhatsAppConfig('database', {
  logger: {
    level: 'debug',
    enableConsole: true,
    enableFile: true,
    filePath: './whatsapp.log'
  }
});
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This package is part of the SaaS Multi-Agent platform and follows the same license terms.
