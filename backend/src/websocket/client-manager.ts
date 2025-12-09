/**
 * WebSocket client state management
 */

import { WebSocket } from 'ws';

export interface WSClient {
  id: string;
  ws: WebSocket;
  authenticated: boolean;
  userId: string | null;
  currentSessionId: string | null;
  connectedAt: number;
}

export class ClientManager {
  private clients: Map<string, WSClient> = new Map();
  private clientIdCounter = 0;

  generateClientId(): string {
    return `client-${Date.now()}-${++this.clientIdCounter}`;
  }

  addClient(ws: WebSocket): WSClient {
    const client: WSClient = {
      id: this.generateClientId(),
      ws,
      authenticated: false,
      userId: null,
      currentSessionId: null,
      connectedAt: Date.now()
    };
    this.clients.set(client.id, client);
    return client;
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  getClient(clientId: string): WSClient | undefined {
    return this.clients.get(clientId);
  }

  getClientByWebSocket(ws: WebSocket): WSClient | undefined {
    for (const client of this.clients.values()) {
      if (client.ws === ws) {
        return client;
      }
    }
    return undefined;
  }

  getClientsBySessionId(sessionId: string): WSClient[] {
    return Array.from(this.clients.values()).filter(
      c => c.currentSessionId === sessionId
    );
  }

  getAuthenticatedClients(): WSClient[] {
    return Array.from(this.clients.values()).filter(c => c.authenticated);
  }

  setAuthenticated(clientId: string, userId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.authenticated = true;
      client.userId = userId;
    }
  }

  setCurrentSession(clientId: string, sessionId: string | null): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.currentSessionId = sessionId;
    }
  }

  broadcast(message: any, filter?: (client: WSClient) => boolean): void {
    const msg = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.authenticated && (!filter || filter(client))) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(msg);
        }
      }
    }
  }

  sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  sendToSession(sessionId: string, message: any): void {
    const msg = JSON.stringify(message);
    for (const client of this.getClientsBySessionId(sessionId)) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(msg);
      }
    }
  }

  getStats(): { total: number; authenticated: number } {
    const authenticated = this.getAuthenticatedClients().length;
    return {
      total: this.clients.size,
      authenticated
    };
  }
}

export const clientManager = new ClientManager();
