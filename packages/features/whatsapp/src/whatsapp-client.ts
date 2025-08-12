// Types for whatsapp-web.js since they don't have official types
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
      
      // Import and create real WhatsApp client
      try {
        console.log('Attempting to import whatsapp-web.js...');
        // Import whatsapp-web.js dynamically using eval to avoid TypeScript compile-time checks
        const whatsappModule = await eval('import("whatsapp-web.js")');
        console.log('whatsapp-web.js imported successfully');
        const WhatsAppClient = whatsappModule.Client;
        
        // Create compatible auth strategy for whatsapp-web.js
        let waAuthStrategy = null;
        try {
          // Try to use LocalAuth (most compatible)
          const { LocalAuth } = whatsappModule;
          waAuthStrategy = new LocalAuth({
            clientId: this.config.auth.clientId || 'whatsapp-client'
          });
          console.log('Using LocalAuth strategy for WhatsApp');
        } catch (authError) {
          console.warn('LocalAuth not available, proceeding without auth strategy');
          waAuthStrategy = null;
        }

        console.log('Creating WhatsApp client with auth strategy:', waAuthStrategy ? 'LocalAuth' : 'none');
        
        // Production-optimized Puppeteer configuration
        const puppeteerConfig = {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-field-trial-config',
            '--disable-back-forward-cache',
            '--disable-ipc-flooding-protection',
            '--memory-pressure-off',
            '--max_old_space_size=4096',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--mute-audio',
            '--no-default-browser-check',
            '--no-pings',
            '--window-size=1366,768'
          ],
          defaultViewport: { width: 1366, height: 768 },
          ignoreHTTPSErrors: true,
          ignoreDefaultArgs: ['--disable-extensions'],
          ...this.config.puppeteer
        };

        this.client = new WhatsAppClient({
          authStrategy: waAuthStrategy,
          puppeteer: puppeteerConfig,
          qrMaxRetries: this.config.connection.qrMaxRetries || 5,
          authTimeoutMs: this.config.connection.authTimeoutMs || 180000, // 3 minutes
          takeoverOnConflict: this.config.connection.takeoverOnConflict || false,
          takeoverTimeoutMs: this.config.connection.takeoverTimeoutMs || 60000,
          userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        console.log('Real WhatsApp client created successfully');
      } catch (importError) {
        console.error('Failed to import whatsapp-web.js. Please install it:', importError);
        throw new WhatsAppAuthError(
          'whatsapp-web.js is not installed. Please run: npm install whatsapp-web.js',
          'MISSING_DEPENDENCY',
          importError
        );
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
      
      // Clear QR code on disconnect
      this.stateManager.setQrCode(null);
      
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
   * Get full connection status including QR code
   */
  getConnectionStatus(): { state: WhatsAppStatus; qrCode: string | null } {
    return this.stateManager.getConnectionStatus();
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
   * Remove connection event listener
   */
  offConnectionEvent(id: string): void {
    this.eventListeners.delete(id);
    this.stateManager.removeEventListener(id);
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
   * Setup WhatsApp client event handlers
   */
  private setupClientEventHandlers(): void {
    if (!this.client) return;

    this.client.on('qr', (qr: string) => {
      console.log('QR Code received from WhatsApp client, length:', qr.length);
      console.log('QR Code preview:', qr.substring(0, 50) + '...');
      this.stateManager.setState('waiting_qr');
      this.stateManager.setQrCode(qr);
      
      // Emit the qr_generated event that the connect route expects
      const qrEvent: WhatsAppConnectionEvent = {
        type: 'qr_generated',
        qr,
        user_id: 'user', // Will be set properly by the route
        timestamp: Date.now(),
        data: { qr }
      };
      
      console.log('Notifying', this.eventListeners.size, 'event listeners about QR code');
      
      // Notify all event listeners
      this.eventListeners.forEach(callback => {
        try {
          callback(qrEvent);
        } catch (error) {
          console.error('Error in QR event listener:', error);
        }
      });
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
      this.stateManager.setQrCode(null); // Clear QR code on authentication
      
      // Emit the authenticated event that the connect route expects
      const authEvent: WhatsAppConnectionEvent = {
        type: 'authenticated',
        user_id: 'user', // Will be set properly by the route
        timestamp: Date.now()
      };
      
      // Notify all event listeners
      this.eventListeners.forEach(callback => {
        try {
          callback(authEvent);
        } catch (error) {
          console.error('Error in auth event listener:', error);
        }
      });
    });

    this.client.on('auth_failure', (msg: string) => {
      console.error('Authentication failed:', msg);
      this.stateManager.setState('error');
      this.isConnecting = false;
      
      // Emit the error event that the connect route expects
      const errorEvent: WhatsAppConnectionEvent = {
        type: 'error',
        error: msg,
        user_id: 'user', // Will be set properly by the route
        timestamp: Date.now(),
        data: { message: msg }
      };
      
      // Notify all event listeners
      this.eventListeners.forEach(callback => {
        try {
          callback(errorEvent);
        } catch (error) {
          console.error('Error in error event listener:', error);
        }
      });
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
