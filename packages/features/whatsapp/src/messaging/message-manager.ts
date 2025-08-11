import { WhatsAppMessage, MessageType } from '../types';

/**
 * Manages WhatsApp message processing, validation, and formatting
 * Handles different message types and provides utilities for message handling
 */
export class MessageManager {
  private messageQueue: Map<string, QueuedMessage> = new Map();
  private messageHistory: Map<string, WhatsAppMessage[]> = new Map();
  private maxHistoryPerChat = 100;
  private listeners: Map<string, MessageListener> = new Map();

  /**
   * Process incoming message
   */
  async processIncomingMessage(rawMessage: any): Promise<WhatsAppMessage | null> {
    try {
      const message = this.parseMessage(rawMessage);
      
      if (!message) {
        console.warn('Failed to parse message:', rawMessage);
        return null;
      }

      // Validate message
      if (!this.validateMessage(message)) {
        console.warn('Invalid message received:', message);
        return null;
      }

      // Add to history
      this.addToHistory(message);

      // Notify listeners
      this.notifyListeners('message_received', message);

      return message;
    } catch (error) {
      console.error('Error processing incoming message:', error);
      return null;
    }
  }

  /**
   * Queue outgoing message
   */
  async queueOutgoingMessage(
    to: string,
    content: MessageContent,
    options: MessageOptions = {}
  ): Promise<string> {
    const messageId = this.generateMessageId();
    
    const queuedMessage: QueuedMessage = {
      id: messageId,
      to,
      content,
      options,
      status: 'queued',
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries || 3
    };

    this.messageQueue.set(messageId, queuedMessage);
    
    // Notify listeners
    this.notifyListeners('message_queued', queuedMessage);

    return messageId;
  }

  /**
   * Send queued message
   */
  async sendQueuedMessage(
    messageId: string,
    sendFunction: (to: string, content: MessageContent, options: MessageOptions) => Promise<any>
  ): Promise<boolean> {
    const queuedMessage = this.messageQueue.get(messageId);
    
    if (!queuedMessage) {
      console.error(`Queued message ${messageId} not found`);
      return false;
    }

    if (queuedMessage.status === 'sending') {
      console.warn(`Message ${messageId} is already being sent`);
      return false;
    }

    try {
      queuedMessage.status = 'sending';
      this.notifyListeners('message_sending', queuedMessage);

      const result = await sendFunction(
        queuedMessage.to,
        queuedMessage.content,
        queuedMessage.options
      );

      // Create sent message record
      const sentMessage: WhatsAppMessage = {
        id: messageId,
        from: 'me',
        to: queuedMessage.to,
        body: this.extractMessageBody(queuedMessage.content),
        type: this.determineMessageType(queuedMessage.content),
        timestamp: Date.now(),
        fromMe: true,
        hasMedia: this.hasMedia(queuedMessage.content),
        isForwarded: false,
        isStatus: false
      };

      // Add to history
      this.addToHistory(sentMessage);

      queuedMessage.status = 'sent';
      queuedMessage.sentAt = Date.now();
      
      this.notifyListeners('message_sent', sentMessage);

      // Remove from queue after successful send
      setTimeout(() => {
        this.messageQueue.delete(messageId);
      }, 5000);

      return true;

    } catch (error) {
      console.error(`Failed to send message ${messageId}:`, error);
      
      queuedMessage.retryCount++;
      queuedMessage.lastError = error instanceof Error ? error.message : 'Unknown error';

      if (queuedMessage.retryCount >= queuedMessage.maxRetries) {
        queuedMessage.status = 'failed';
        this.notifyListeners('message_failed', queuedMessage);
      } else {
        queuedMessage.status = 'queued';
        this.notifyListeners('message_retry', queuedMessage);
      }

      return false;
    }
  }

  /**
   * Get message history for a chat
   */
  getMessageHistory(chatId: string, limit?: number): WhatsAppMessage[] {
    const history = this.messageHistory.get(chatId) || [];
    
    if (limit) {
      return history.slice(-limit);
    }
    
    return [...history];
  }

  /**
   * Get queued messages
   */
  getQueuedMessages(): QueuedMessage[] {
    return Array.from(this.messageQueue.values());
  }

  /**
   * Get pending messages for a specific chat
   */
  getPendingMessages(chatId: string): QueuedMessage[] {
    return Array.from(this.messageQueue.values())
      .filter(msg => msg.to === chatId && msg.status !== 'sent' && msg.status !== 'failed');
  }

  /**
   * Cancel queued message
   */
  cancelMessage(messageId: string): boolean {
    const message = this.messageQueue.get(messageId);
    
    if (!message) {
      return false;
    }

    if (message.status === 'sending') {
      console.warn(`Cannot cancel message ${messageId} - already sending`);
      return false;
    }

    message.status = 'cancelled';
    this.notifyListeners('message_cancelled', message);
    
    this.messageQueue.delete(messageId);
    return true;
  }

  /**
   * Clear message history for a chat
   */
  clearHistory(chatId: string): void {
    this.messageHistory.delete(chatId);
  }

  /**
   * Register message event listener
   */
  onMessageEvent(id: string, callback: MessageListener): void {
    this.listeners.set(id, callback);
  }

  /**
   * Remove message event listener
   */
  removeMessageListener(id: string): void {
    this.listeners.delete(id);
  }

  /**
   * Clear all listeners
   */
  clearAllListeners(): void {
    this.listeners.clear();
  }

  /**
   * Parse raw message into WhatsAppMessage format
   */
  private parseMessage(rawMessage: any): WhatsAppMessage | null {
    try {
      // This would be adapted based on the WhatsApp library being used
      // Example for whatsapp-web.js format
      return {
        id: rawMessage.id?.id || rawMessage.id || this.generateMessageId(),
        from: rawMessage.from || rawMessage.author || '',
        to: rawMessage.to || rawMessage.chatId || '',
        body: rawMessage.body || rawMessage.content || '',
        type: this.parseMessageType(rawMessage),
        timestamp: rawMessage.timestamp || Date.now(),
        fromMe: rawMessage.fromMe || false,
        hasMedia: rawMessage.hasMedia || false,
        mediaUrl: rawMessage.mediaUrl,
        caption: rawMessage.caption,
        quotedMessage: rawMessage.quotedMsg ? this.parseMessage(rawMessage.quotedMsg) || undefined : undefined,
        mentions: rawMessage.mentionedIds || [],
        isForwarded: rawMessage.isForwarded || false,
        isStatus: rawMessage.isStatus || false
      };
    } catch (error) {
      console.error('Error parsing message:', error);
      return null;
    }
  }

  /**
   * Parse message type from raw message
   */
  private parseMessageType(rawMessage: any): MessageType {
    if (rawMessage.type) {
      return rawMessage.type;
    }

    // Determine type based on content
    if (rawMessage.hasMedia) {
      if (rawMessage.mimetype?.startsWith('image/')) return 'image';
      if (rawMessage.mimetype?.startsWith('video/')) return 'video';
      if (rawMessage.mimetype?.startsWith('audio/')) return 'audio';
      return 'document';
    }

    if (rawMessage.location) return 'location';
    if (rawMessage.vCards) return 'contact';
    if (rawMessage.poll) return 'poll';

    return 'text';
  }

  /**
   * Validate message structure
   */
  private validateMessage(message: WhatsAppMessage): boolean {
    return !!(
      message.id &&
      message.from &&
      message.to &&
      message.type &&
      typeof message.timestamp === 'number'
    );
  }

  /**
   * Add message to history
   */
  private addToHistory(message: WhatsAppMessage): void {
    const chatId = message.fromMe ? message.to : message.from;
    
    if (!this.messageHistory.has(chatId)) {
      this.messageHistory.set(chatId, []);
    }

    const history = this.messageHistory.get(chatId)!;
    history.push(message);

    // Limit history size
    if (history.length > this.maxHistoryPerChat) {
      history.splice(0, history.length - this.maxHistoryPerChat);
    }
  }

  /**
   * Extract message body from content
   */
  private extractMessageBody(content: MessageContent): string {
    if (typeof content === 'string') {
      return content;
    }

    if (content.text) {
      return content.text;
    }

    if (content.caption) {
      return content.caption;
    }

    return '';
  }

  /**
   * Determine message type from content
   */
  private determineMessageType(content: MessageContent): MessageType {
    if (typeof content === 'string') {
      return 'text';
    }

    if (content.media) {
      if (content.media.mimetype?.startsWith('image/')) return 'image';
      if (content.media.mimetype?.startsWith('video/')) return 'video';
      if (content.media.mimetype?.startsWith('audio/')) return 'audio';
      return 'document';
    }

    if (content.location) return 'location';
    if (content.contact) return 'contact';
    if (content.poll) return 'poll';

    return 'text';
  }

  /**
   * Check if content has media
   */
  private hasMedia(content: MessageContent): boolean {
    return typeof content === 'object' && !!content.media;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(event: MessageEventType, data: any): void {
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Error in message listener:', error);
      }
    });
  }
}

/**
 * Message content types
 */
export type MessageContent = string | {
  text?: string;
  media?: {
    data: Buffer | string;
    mimetype: string;
    filename?: string;
  };
  caption?: string;
  location?: {
    latitude: number;
    longitude: number;
    description?: string;
  };
  contact?: {
    name: string;
    phone: string;
    vcard?: string;
  };
  poll?: {
    question: string;
    options: string[];
    multipleAnswers?: boolean;
  };
};

/**
 * Message sending options
 */
export interface MessageOptions {
  quotedMessageId?: string;
  mentions?: string[];
  linkPreview?: boolean;
  maxRetries?: number;
  priority?: 'low' | 'normal' | 'high';
  scheduledAt?: number;
}

/**
 * Queued message structure
 */
export interface QueuedMessage {
  id: string;
  to: string;
  content: MessageContent;
  options: MessageOptions;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';
  timestamp: number;
  sentAt?: number;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
}

/**
 * Message event types
 */
export type MessageEventType = 
  | 'message_received'
  | 'message_queued'
  | 'message_sending'
  | 'message_sent'
  | 'message_failed'
  | 'message_retry'
  | 'message_cancelled';

/**
 * Message event listener
 */
export type MessageListener = (event: MessageEventType, data: any) => void;
