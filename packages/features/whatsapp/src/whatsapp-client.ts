// Optional import - will be available when whatsapp-web.js is installed
type Client = any;
import { BaseAuthStrategy, AuthStrategyFactory } from './auth';
import { ConnectionStateManager, ReconnectionManager } from './connection';
import { MessageManager, MessageContent, MessageOptions } from './messaging';
import { 
  WhatsAppConfig, 
  WhatsAppStatus, 
  WhatsAppMessage, 
  WhatsAppConnectionEvent,
  WhatsAppAuthError 
} from './types';

/**
 * Main WhatsApp client that integrates all modules
 * Provides a unified interface for WhatsApp functionality
 */
export class WhatsAppClient {
  private client?: Client;
  private authStrategy: BaseAuthStrategy;
  private stateManager: ConnectionStateManager;
  private reconnectionManager: ReconnectionManager;
  private messageManager: MessageManager;
  private config: WhatsAppConfig;
  private isInitialized = false;
  private isConnecting = false;
  private eventListeners: Map<string, (event: WhatsAppConnectionEvent) => void> = new Map();

  constructor(config: WhatsAppConfig, userId?: string, supabaseClient?: any) {
    this.config = config;
    
    // Initialize managers
    this.stateManager = new ConnectionStateManager();
    this.reconnectionManager = new ReconnectionManager(config.connection);
    this.messageManager = new MessageManager();
    
    // Create authentication strategy
    this.authStrategy = AuthStrategyFactory.createStrategy(
      config.auth,
      userId,
      supabaseClient
    );

    this.setupEventHandlers();
  }

  /**
   * Initialize the WhatsApp client
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('WhatsApp client already initialized');
      return;
    }

    try {
      console.log('Initializing WhatsApp client...');
      
      // Initialize authentication strategy
      await this.authStrategy.initialize();
      
      // Create WhatsApp client instance
      // This will be dynamically imported when whatsapp-web.js is available
      try {
        // Try to import whatsapp-web.js dynamically
        let whatsappModule: any = null;
        try {
          // Use eval to avoid TypeScript checking the import at compile time
          whatsappModule = await eval('import("whatsapp-web.js")');
        } catch (importError) {
          console.warn('whatsapp-web.js not available, using mock client for development');
        }
        
        if (!whatsappModule) {
          console.warn('whatsapp-web.js not found. Creating mock client for development.');
          // Create a mock client for development/testing
          this.client = this.createMockClient();
        } else {
          const { Client: WhatsAppClient } = whatsappModule;
          this.client = new WhatsAppClient({
            authStrategy: this.authStrategy as any, // Type assertion for whatsapp-web.js compatibility
            puppeteer: this.config.puppeteer || {
              headless: true,
              args: ['--no-sandbox', '--disable-setuid-sandbox']
            },
            qrMaxRetries: this.config.connection.maxReconnectAttempts
          });
        }
      } catch (importError) {
        console.warn('Failed to import whatsapp-web.js, using mock client:', importError);
        this.client = this.createMockClient();
      }

      this.setupClientEventHandlers();
      this.isInitialized = true;
      
      console.log('WhatsApp client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WhatsApp client:', error);
      throw new WhatsAppAuthError(
        `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INITIALIZATION_ERROR',
        error
      );
    }
  }

  /**
   * Connect to WhatsApp
   */
  async connect(): Promise<void> {
    if (!this.isInitialized) {
      throw new WhatsAppAuthError('Client not initialized', 'NOT_INITIALIZED');
    }

    if (this.isConnecting) {
      console.warn('Connection already in progress');
      return;
    }

    if (!this.client) {
      throw new WhatsAppAuthError('Client instance not available', 'CLIENT_NOT_AVAILABLE');
    }

    try {
      this.isConnecting = true;
      this.stateManager.setState('connecting');
      
      console.log('Connecting to WhatsApp...');
      await this.client.initialize();
      
    } catch (error) {
      this.isConnecting = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to connect to WhatsApp:', errorMessage);
      
      this.stateManager.setState('error');
      
      // Handle authentication failure
      const authResult = await this.authStrategy.onAuthFailure(error as Error);
      
      if (authResult.shouldClearSession) {
        await this.authStrategy.clearSession();
      }
      
      if (authResult.shouldRestart && this.reconnectionManager.shouldReconnect('error', error as Error)) {
        await this.reconnectionManager.startReconnection(
          `Connection failed: ${errorMessage}`,
          () => this.connect()
        );
      }
      
      throw new WhatsAppAuthError(
        `Connection failed: ${errorMessage}`,
        'CONNECTION_ERROR',
        error
      );
    }
  }

  /**
   * Disconnect from WhatsApp
   */
  async disconnect(): Promise<void> {
    try {
      console.log('Disconnecting from WhatsApp...');
      
      // Stop reconnection attempts
      this.reconnectionManager.stopReconnection();
      
      // Disconnect client
      if (this.client) {
        await this.client.destroy();
      }
      
      // Update state
      this.stateManager.setState('disconnected');
      this.isConnecting = false;
      
      console.log('Disconnected from WhatsApp');
    } catch (error) {
      console.error('Error during disconnect:', error);
      this.stateManager.forceSetState('disconnected', 'Forced disconnect due to error');
    }
  }

  /**
   * Send a message
   */
  async sendMessage(to: string, content: MessageContent, options: MessageOptions = {}): Promise<string> {
    if (!this.isConnected()) {
      throw new WhatsAppAuthError('Client not connected', 'NOT_CONNECTED');
    }

    if (!this.client) {
      throw new WhatsAppAuthError('Client instance not available', 'CLIENT_NOT_AVAILABLE');
    }

    // Queue the message
    const messageId = await this.messageManager.queueOutgoingMessage(to, content, options);
    
    // Send the message
    const success = await this.messageManager.sendQueuedMessage(
      messageId,
      async (to, content, options) => {
        if (typeof content === 'string') {
          return await this.client!.sendMessage(to, content);
        } else {
          // Handle complex message types
          if (content.media) {
            const media = content.media;
            return await this.client!.sendMessage(to, media as any, {
              caption: content.caption
            });
          } else if (content.location) {
            return await this.client!.sendMessage(to, content.location as any);
          } else if (content.contact) {
            return await this.client!.sendMessage(to, content.contact as any);
          } else {
            return await this.client!.sendMessage(to, content.text || '');
          }
        }
      }
    );

    if (!success) {
      throw new WhatsAppAuthError(`Failed to send message ${messageId}`, 'MESSAGE_SEND_ERROR');
    }

    return messageId;
  }

  /**
   * Get connection status
   */
  getStatus(): WhatsAppStatus {
    return this.stateManager.getCurrentState();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.stateManager.isConnected();
  }

  /**
   * Check if connecting
   */
  isConnectingToWhatsApp(): boolean {
    return this.stateManager.isConnecting();
  }

  /**
   * Get message history for a chat
   */
  getMessageHistory(chatId: string, limit?: number): WhatsAppMessage[] {
    return this.messageManager.getMessageHistory(chatId, limit);
  }

  /**
   * Get pending messages
   */
  getPendingMessages(chatId?: string) {
    if (chatId) {
      return this.messageManager.getPendingMessages(chatId);
    }
    return this.messageManager.getQueuedMessages();
  }

  /**
   * Cancel a queued message
   */
  cancelMessage(messageId: string): boolean {
    return this.messageManager.cancelMessage(messageId);
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return {
      status: this.getStatus(),
      uptime: this.stateManager.getConnectionUptime(),
      timeInCurrentState: this.stateManager.getTimeInCurrentState(),
      stateHistory: this.stateManager.getStateHistory(),
      stateStats: this.stateManager.getStateStats(),
      reconnectionStatus: this.reconnectionManager.getStatus()
    };
  }

  /**
   * Register event listener
   */
  onConnectionEvent(id: string, callback: (event: WhatsAppConnectionEvent) => void): void {
    this.eventListeners.set(id, callback);
    this.stateManager.onConnectionEvent(id, callback);
  }

  /**
   * Register message event listener
   */
  onMessageEvent(id: string, callback: (event: any, data: any) => void): void {
    this.messageManager.onMessageEvent(id, callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(id: string): void {
    this.eventListeners.delete(id);
    this.stateManager.removeEventListener(id);
    this.messageManager.removeMessageListener(id);
    this.reconnectionManager.removeEventListener(id);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      console.log('Cleaning up WhatsApp client...');
      
      // Disconnect if connected
      if (this.isConnected() || this.isConnecting) {
        await this.disconnect();
      }
      
      // Cleanup managers
      this.stateManager.clearAllListeners();
      this.reconnectionManager.clearAllListeners();
      this.messageManager.clearAllListeners();
      
      // Cleanup auth strategy
      await this.authStrategy.cleanup();
      
      this.isInitialized = false;
      console.log('WhatsApp client cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Setup internal event handlers
   */
  private setupEventHandlers(): void {
    // Handle state changes
    this.stateManager.onStateChange('internal', (newState, oldState) => {
      console.log(`WhatsApp state changed: ${oldState} -> ${newState}`);
      
      // Handle reconnection logic
      if (this.stateManager.isError() || this.stateManager.isDisconnected()) {
        if (this.reconnectionManager.shouldReconnect(newState)) {
          this.reconnectionManager.startReconnection(
            `State changed to ${newState}`,
            () => this.connect()
          );
        }
      }
    });

    // Handle reconnection events
    this.reconnectionManager.onReconnectionEvent('internal', (event) => {
      console.log(`Reconnection event: ${event.type}`, event);
    });

    // Handle message events
    this.messageManager.onMessageEvent('internal', (event, data) => {
      console.log(`Message event: ${event}`, data);
    });
  }

  /**
   * Create a mock client for development/testing when whatsapp-web.js is not available
   */
  private createMockClient(): any {
    const mockClient = {
      initialize: async () => {
        console.log('Mock WhatsApp client initialized');
        // Simulate QR code generation
        setTimeout(() => {
          this.stateManager.setState('waiting_qr', { qr: 'MOCK_QR_CODE_FOR_DEVELOPMENT' });
        }, 1000);
        
        // Simulate authentication after a delay
        setTimeout(() => {
          this.stateManager.setState('pairing');
          setTimeout(() => {
            this.stateManager.setState('connected');
            this.isConnecting = false;
            this.reconnectionManager.reset();
          }, 2000);
        }, 3000);
      },
      
      destroy: async () => {
        console.log('Mock WhatsApp client destroyed');
      },
      
      sendMessage: async (to: string, content: any, options?: any) => {
        console.log(`Mock: Sending message to ${to}:`, content);
        return { id: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
      },
      
      on: (event: string, callback: Function) => {
        console.log(`Mock: Registered event listener for ${event}`);
        // Store event listeners for potential mock triggering
        if (!this.mockEventListeners) {
          this.mockEventListeners = new Map();
        }
        if (!this.mockEventListeners.has(event)) {
          this.mockEventListeners.set(event, []);
        }
        this.mockEventListeners.get(event)!.push(callback);
      },
      
      // Mock properties
      info: {
        wid: 'mock_user@c.us',
        pushname: 'Mock User'
      }
    };
    
    return mockClient;
  }

  private mockEventListeners?: Map<string, Function[]>;

  /**
   * Setup WhatsApp client event handlers
   */
  private setupClientEventHandlers(): void {
    if (!this.client) return;

    this.client.on('qr', (qr: string) => {
      console.log('QR Code received');
      this.stateManager.setState('waiting_qr', { qr });
    });

    this.client.on('ready', () => {
      console.log('WhatsApp client is ready');
      this.stateManager.setState('connected');
      this.isConnecting = false;
      this.reconnectionManager.reset();
    });

    this.client.on('authenticated', () => {
      console.log('WhatsApp client authenticated');
      this.stateManager.setState('pairing');
    });

    this.client.on('auth_failure', (msg: string) => {
      console.error('Authentication failed:', msg);
      this.stateManager.setState('error');
      this.isConnecting = false;
    });

    this.client.on('disconnected', (reason: string) => {
      console.log('WhatsApp client disconnected:', reason);
      this.stateManager.setState('disconnected');
      this.isConnecting = false;
    });

    this.client.on('message', async (message: any) => {
      try {
        await this.messageManager.processIncomingMessage(message);
      } catch (error) {
        console.error('Error processing incoming message:', error);
      }
    });

    this.client.on('message_create', async (message: any) => {
      try {
        await this.messageManager.processIncomingMessage(message);
      } catch (error) {
        console.error('Error processing created message:', error);
      }
    });
  }
}
