# Real-time Chat Application

> **Note**: This tutorial covers the planned real-time subscription API. Some features are still in development. Check the [roadmap](https://github.com/dot-do/evodb) for current status.

Build a real-time chat application with EvoDB subscriptions. Learn how to set up WebSocket connections, handle incoming messages, and track user presence.

## Prerequisites

- Completed [Building a TODO App](./02-todo-app.md)
- Node.js 18.0.0 or higher
- Basic understanding of WebSockets

## What We're Building

A real-time chat application with:

- Multiple chat rooms
- Live message updates
- User presence indicators
- Typing indicators
- Message history

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Client A      │     │   EvoDB Worker  │     │   Client B      │
│   (Browser)     │     │ (Durable Object)│     │   (Browser)     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ 1. Connect WebSocket  │                       │
         │──────────────────────>│                       │
         │                       │                       │
         │ 2. Subscribe to room  │                       │
         │──────────────────────>│                       │
         │                       │  3. Connect WebSocket │
         │                       │<──────────────────────│
         │                       │                       │
         │ 4. Send message       │                       │
         │──────────────────────>│                       │
         │                       │                       │
         │                       │ 5. Broadcast to room  │
         │<──────────────────────│──────────────────────>│
         │                       │                       │
```

## Step 1: Project Setup

Create a new Cloudflare Workers project:

```bash
mkdir evodb-chat
cd evodb-chat
npm create cloudflare@latest -- --template hello-world-ts
npm install @evodb/core
```

Update `wrangler.toml`:

```toml
name = "evodb-chat"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

# Enable Durable Objects for real-time state management
[[durable_objects.bindings]]
name = "CHAT_ROOM"
class_name = "ChatRoom"

[[migrations]]
tag = "v1"
new_classes = ["ChatRoom"]
```

## Step 2: Define Types

Create `src/types.ts`:

```typescript
/**
 * Chat message structure
 */
export interface ChatMessage {
  _id: string;
  roomId: string;
  userId: string;
  username: string;
  content: string;
  type: 'message' | 'system' | 'typing';
  createdAt: string;
}

/**
 * User presence in a room
 */
export interface UserPresence {
  userId: string;
  username: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: string;
}

/**
 * WebSocket message types
 */
export type WSMessage =
  | { type: 'join'; roomId: string; username: string }
  | { type: 'leave' }
  | { type: 'message'; content: string }
  | { type: 'typing'; isTyping: boolean };

/**
 * Server-sent events
 */
export type ServerEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'presence'; users: UserPresence[] }
  | { type: 'typing'; userId: string; username: string; isTyping: boolean }
  | { type: 'error'; message: string };
```

## Step 3: Create the Chat Room Durable Object

Create `src/chat-room.ts`:

```typescript
import { EvoDB, createSubscriptionManager } from '@evodb/core';
import type { ChatMessage, UserPresence, WSMessage, ServerEvent } from './types.js';

/**
 * ChatRoom Durable Object
 *
 * Manages real-time state for a single chat room including:
 * - Connected WebSocket clients
 * - User presence tracking
 * - Message broadcasting
 * - Typing indicators
 */
export class ChatRoom {
  private state: DurableObjectState;
  private db: EvoDB;
  private subscriptionManager: ReturnType<typeof createSubscriptionManager>;

  // Connected clients: WebSocket -> UserInfo
  private clients: Map<WebSocket, { userId: string; username: string }> = new Map();

  // Typing status
  private typingUsers: Set<string> = new Set();

  constructor(state: DurableObjectState, env: unknown) {
    this.state = state;
    this.db = new EvoDB({ mode: 'development' });
    this.subscriptionManager = createSubscriptionManager();
  }

  /**
   * Handle incoming HTTP requests (including WebSocket upgrades)
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // REST API for message history
    if (url.pathname === '/messages' && request.method === 'GET') {
      return this.getMessageHistory(url);
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle WebSocket connection
   */
  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Accept the WebSocket
    this.state.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handle WebSocket messages
   */
  async webSocketMessage(ws: WebSocket, message: string): Promise<void> {
    try {
      const data = JSON.parse(message) as WSMessage;

      switch (data.type) {
        case 'join':
          await this.handleJoin(ws, data.roomId, data.username);
          break;
        case 'leave':
          await this.handleLeave(ws);
          break;
        case 'message':
          await this.handleMessage(ws, data.content);
          break;
        case 'typing':
          await this.handleTyping(ws, data.isTyping);
          break;
      }
    } catch (error) {
      this.sendToClient(ws, {
        type: 'error',
        message: `Failed to process message: ${error}`,
      });
    }
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleLeave(ws);
  }

  /**
   * Handle user joining the room
   */
  private async handleJoin(ws: WebSocket, roomId: string, username: string): Promise<void> {
    const userId = crypto.randomUUID();

    // Register client
    this.clients.set(ws, { userId, username });

    // Store presence
    await this.db.insert('presence', {
      roomId,
      userId,
      username,
      status: 'online',
      lastSeen: new Date().toISOString(),
    });

    // Send system message
    const systemMessage: ChatMessage = {
      _id: crypto.randomUUID(),
      roomId,
      userId: 'system',
      username: 'System',
      content: `${username} joined the room`,
      type: 'system',
      createdAt: new Date().toISOString(),
    };

    await this.db.insert('messages', systemMessage);

    // Broadcast join to all clients
    this.broadcast({
      type: 'message',
      message: systemMessage,
    });

    // Send updated presence list
    await this.broadcastPresence(roomId);

    // Send recent message history to the new user
    const history = await this.db.query<ChatMessage>('messages')
      .where('roomId', '=', roomId)
      .orderBy('createdAt', 'desc')
      .limit(50);

    // Send history in chronological order
    for (const msg of history.reverse()) {
      this.sendToClient(ws, { type: 'message', message: msg });
    }
  }

  /**
   * Handle user leaving the room
   */
  private async handleLeave(ws: WebSocket): Promise<void> {
    const client = this.clients.get(ws);
    if (!client) return;

    const { userId, username } = client;
    this.clients.delete(ws);
    this.typingUsers.delete(userId);

    // Update presence to offline
    await this.db.update('presence', { userId }, { status: 'offline' });

    // Get room ID from first remaining client (or use stored value)
    const roomId = 'default'; // In production, track this per-client

    // Send system message
    const systemMessage: ChatMessage = {
      _id: crypto.randomUUID(),
      roomId,
      userId: 'system',
      username: 'System',
      content: `${username} left the room`,
      type: 'system',
      createdAt: new Date().toISOString(),
    };

    await this.db.insert('messages', systemMessage);

    this.broadcast({
      type: 'message',
      message: systemMessage,
    });

    await this.broadcastPresence(roomId);
  }

  /**
   * Handle incoming chat message
   */
  private async handleMessage(ws: WebSocket, content: string): Promise<void> {
    const client = this.clients.get(ws);
    if (!client) return;

    const { userId, username } = client;
    const roomId = 'default'; // In production, track this per-client

    // Clear typing indicator
    this.typingUsers.delete(userId);

    // Create and store message
    const message: ChatMessage = {
      _id: crypto.randomUUID(),
      roomId,
      userId,
      username,
      content,
      type: 'message',
      createdAt: new Date().toISOString(),
    };

    await this.db.insert('messages', message);

    // Emit change event for subscriptions
    this.subscriptionManager.emit({
      type: 'insert',
      table: 'messages',
      data: message,
      timestamp: Date.now(),
    });

    // Broadcast to all clients
    this.broadcast({
      type: 'message',
      message,
    });
  }

  /**
   * Handle typing indicator
   */
  private async handleTyping(ws: WebSocket, isTyping: boolean): Promise<void> {
    const client = this.clients.get(ws);
    if (!client) return;

    const { userId, username } = client;

    if (isTyping) {
      this.typingUsers.add(userId);
    } else {
      this.typingUsers.delete(userId);
    }

    // Broadcast typing status to other clients
    this.broadcast(
      {
        type: 'typing',
        userId,
        username,
        isTyping,
      },
      ws // Exclude sender
    );
  }

  /**
   * Broadcast presence update to all clients
   */
  private async broadcastPresence(roomId: string): Promise<void> {
    const presence = await this.db.query<UserPresence>('presence')
      .where('roomId', '=', roomId)
      .where('status', '=', 'online');

    this.broadcast({
      type: 'presence',
      users: presence,
    });
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(ws: WebSocket, event: ServerEvent): void {
    try {
      ws.send(JSON.stringify(event));
    } catch {
      // Client disconnected
      this.clients.delete(ws);
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(event: ServerEvent, exclude?: WebSocket): void {
    const message = JSON.stringify(event);

    for (const [ws] of this.clients) {
      if (ws !== exclude) {
        try {
          ws.send(message);
        } catch {
          // Client disconnected
          this.clients.delete(ws);
        }
      }
    }
  }

  /**
   * Get message history via REST API
   */
  private async getMessageHistory(url: URL): Promise<Response> {
    const roomId = url.searchParams.get('roomId') ?? 'default';
    const limit = parseInt(url.searchParams.get('limit') ?? '50');
    const before = url.searchParams.get('before');

    let query = this.db.query<ChatMessage>('messages')
      .where('roomId', '=', roomId)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (before) {
      query = query.where('createdAt', '<', before);
    }

    const messages = await query;

    return Response.json({
      messages: messages.reverse(),
      hasMore: messages.length === limit,
    });
  }
}
```

## Step 4: Create the Worker Entry Point

Create `src/index.ts`:

```typescript
export { ChatRoom } from './chat-room.js';

export interface Env {
  CHAT_ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route to chat room
    if (url.pathname.startsWith('/room/')) {
      const roomId = url.pathname.split('/')[2] ?? 'default';

      // Get Durable Object stub
      const id = env.CHAT_ROOM.idFromName(roomId);
      const stub = env.CHAT_ROOM.get(id);

      // Forward request to Durable Object
      return stub.fetch(request);
    }

    // Serve chat UI
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(getChatHTML(), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Simple chat UI HTML
 */
function getChatHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EvoDB Chat</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; height: 100vh; display: flex; flex-direction: column; }
    .header { background: #2563eb; color: white; padding: 1rem; }
    .header h1 { font-size: 1.25rem; }
    .container { flex: 1; display: flex; overflow: hidden; }
    .sidebar { width: 200px; background: #f3f4f6; padding: 1rem; border-right: 1px solid #e5e7eb; }
    .sidebar h2 { font-size: 0.875rem; color: #6b7280; margin-bottom: 0.5rem; }
    .user-list { list-style: none; }
    .user-item { padding: 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
    .messages { flex: 1; display: flex; flex-direction: column; }
    .message-list { flex: 1; overflow-y: auto; padding: 1rem; }
    .message { margin-bottom: 1rem; }
    .message-header { display: flex; gap: 0.5rem; align-items: baseline; margin-bottom: 0.25rem; }
    .message-username { font-weight: 600; color: #1f2937; }
    .message-time { font-size: 0.75rem; color: #9ca3af; }
    .message-content { color: #374151; }
    .message.system { color: #6b7280; font-style: italic; }
    .typing { padding: 0 1rem; color: #6b7280; font-size: 0.875rem; height: 1.5rem; }
    .input-area { padding: 1rem; border-top: 1px solid #e5e7eb; display: flex; gap: 0.5rem; }
    .input-area input { flex: 1; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.5rem; }
    .input-area button { padding: 0.75rem 1.5rem; background: #2563eb; color: white; border: none; border-radius: 0.5rem; cursor: pointer; }
    .input-area button:hover { background: #1d4ed8; }
    .join-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }
    .join-form { background: white; padding: 2rem; border-radius: 1rem; width: 300px; }
    .join-form h2 { margin-bottom: 1rem; }
    .join-form input { width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.5rem; margin-bottom: 1rem; }
    .join-form button { width: 100%; padding: 0.75rem; background: #2563eb; color: white; border: none; border-radius: 0.5rem; cursor: pointer; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="header">
    <h1>EvoDB Chat</h1>
  </div>

  <div class="container">
    <div class="sidebar">
      <h2>Online Users</h2>
      <ul class="user-list" id="userList"></ul>
    </div>

    <div class="messages">
      <div class="message-list" id="messageList"></div>
      <div class="typing" id="typing"></div>
      <div class="input-area">
        <input type="text" id="messageInput" placeholder="Type a message..." />
        <button id="sendButton">Send</button>
      </div>
    </div>
  </div>

  <div class="join-modal" id="joinModal">
    <div class="join-form">
      <h2>Join Chat</h2>
      <input type="text" id="usernameInput" placeholder="Enter your name" />
      <button id="joinButton">Join</button>
    </div>
  </div>

  <script>
    const roomId = 'default';
    let ws;
    let username;
    let typingTimeout;

    // DOM elements
    const joinModal = document.getElementById('joinModal');
    const usernameInput = document.getElementById('usernameInput');
    const joinButton = document.getElementById('joinButton');
    const messageList = document.getElementById('messageList');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const userList = document.getElementById('userList');
    const typingIndicator = document.getElementById('typing');

    // Join room
    joinButton.onclick = () => {
      username = usernameInput.value.trim();
      if (!username) return;

      joinModal.classList.add('hidden');
      connect();
    };

    usernameInput.onkeypress = (e) => {
      if (e.key === 'Enter') joinButton.click();
    };

    // Connect WebSocket
    function connect() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(\`\${protocol}//\${location.host}/room/\${roomId}\`);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', roomId, username }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerEvent(data);
      };

      ws.onclose = () => {
        setTimeout(connect, 1000);
      };
    }

    // Handle server events
    function handleServerEvent(event) {
      switch (event.type) {
        case 'message':
          addMessage(event.message);
          break;
        case 'presence':
          updateUserList(event.users);
          break;
        case 'typing':
          updateTyping(event);
          break;
        case 'error':
          console.error(event.message);
          break;
      }
    }

    // Add message to list
    function addMessage(msg) {
      const div = document.createElement('div');
      div.className = 'message' + (msg.type === 'system' ? ' system' : '');

      if (msg.type === 'system') {
        div.textContent = msg.content;
      } else {
        const time = new Date(msg.createdAt).toLocaleTimeString();
        div.innerHTML = \`
          <div class="message-header">
            <span class="message-username">\${msg.username}</span>
            <span class="message-time">\${time}</span>
          </div>
          <div class="message-content">\${msg.content}</div>
        \`;
      }

      messageList.appendChild(div);
      messageList.scrollTop = messageList.scrollHeight;
    }

    // Update user list
    function updateUserList(users) {
      userList.innerHTML = users.map(u => \`
        <li class="user-item">
          <span class="status-dot"></span>
          \${u.username}
        </li>
      \`).join('');
    }

    // Update typing indicator
    const typingUsers = new Map();
    function updateTyping(event) {
      if (event.isTyping) {
        typingUsers.set(event.userId, event.username);
      } else {
        typingUsers.delete(event.userId);
      }

      if (typingUsers.size === 0) {
        typingIndicator.textContent = '';
      } else if (typingUsers.size === 1) {
        typingIndicator.textContent = \`\${[...typingUsers.values()][0]} is typing...\`;
      } else {
        typingIndicator.textContent = 'Several people are typing...';
      }
    }

    // Send message
    function sendMessage() {
      const content = messageInput.value.trim();
      if (!content || !ws) return;

      ws.send(JSON.stringify({ type: 'message', content }));
      messageInput.value = '';
    }

    sendButton.onclick = sendMessage;
    messageInput.onkeypress = (e) => {
      if (e.key === 'Enter') sendMessage();
    };

    // Send typing indicator
    messageInput.oninput = () => {
      if (!ws) return;

      ws.send(JSON.stringify({ type: 'typing', isTyping: true }));

      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        ws.send(JSON.stringify({ type: 'typing', isTyping: false }));
      }, 1000);
    };
  </script>
</body>
</html>`;
}
```

## Step 5: Using Subscriptions API

EvoDB provides a subscription manager for handling real-time events. Here is how to use it:

```typescript
import { createSubscriptionManager } from '@evodb/core';

// Create subscription manager
const subscriptions = createSubscriptionManager();

// Subscribe to all changes on a table
const messageSub = subscriptions.subscribe('messages', (event) => {
  console.log(`${event.type} on messages:`, event.data);
  // event.type: 'insert' | 'update' | 'delete'
  // event.data: the affected document
  // event.timestamp: when it happened
});

// Subscribe with query filter
const pendingSub = subscriptions.subscribeQuery(
  {
    table: 'orders',
    predicates: [
      { column: 'status', operator: 'eq', value: 'pending' }
    ]
  },
  (event) => {
    console.log('Pending order changed:', event);
  }
);

// Emit events (called by database layer on write operations)
subscriptions.emit({
  type: 'insert',
  table: 'messages',
  data: { _id: '123', content: 'Hello!' },
  timestamp: Date.now()
});

// Cleanup when done
messageSub.unsubscribe();
pendingSub.unsubscribe();
```

## Step 6: Deploy and Test

Deploy to Cloudflare Workers:

```bash
npx wrangler deploy
```

Test locally:

```bash
npx wrangler dev
```

Open `http://localhost:8787` in multiple browser tabs to test real-time messaging.

## Key Concepts

### WebSocket Lifecycle

1. **Connect** - Client opens WebSocket connection to Worker
2. **Join** - Client sends join message with username
3. **Subscribe** - Server registers client for room events
4. **Message** - Client sends message, server broadcasts to room
5. **Presence** - Server tracks online/offline status
6. **Disconnect** - Client closes connection, server cleans up

### Durable Objects for State

Durable Objects provide:
- **Single-threaded execution** - No race conditions
- **Persistent storage** - State survives restarts
- **WebSocket management** - Built-in WebSocket support
- **Global distribution** - Runs close to users

### Subscription Patterns

```typescript
// Table-level subscription (all changes)
subscriptions.subscribe('messages', callback);

// Query-filtered subscription (only matching changes)
subscriptions.subscribeQuery({
  table: 'messages',
  predicates: [
    { column: 'roomId', operator: 'eq', value: 'room-123' }
  ]
}, callback);
```

## What You Learned

In this tutorial, you learned how to:

1. **Set up Durable Objects** - Create stateful Workers for real-time features
2. **Handle WebSocket connections** - Manage client connections and messages
3. **Use subscriptions** - React to database changes in real-time
4. **Track presence** - Show who is online in a room
5. **Build typing indicators** - Provide real-time feedback

## Next Steps

- [Vector Search for RAG](./04-vector-search.md) - Add AI-powered semantic search
- [Getting Started Guide](../GETTING_STARTED.md) - Production configuration options
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) - Learn more about DO

## Troubleshooting

### WebSocket Connection Fails

Make sure your `wrangler.toml` has the correct Durable Object configuration:

```toml
[[durable_objects.bindings]]
name = "CHAT_ROOM"
class_name = "ChatRoom"
```

### Messages Not Broadcasting

Check that:
1. All clients are connected to the same Durable Object (same room ID)
2. The `broadcast` function is being called after inserting messages
3. WebSocket connections are properly stored in the `clients` Map

### Typing Indicators Stuck

Ensure the typing timeout clears the indicator:

```typescript
// Client-side
messageInput.oninput = () => {
  ws.send(JSON.stringify({ type: 'typing', isTyping: true }));

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    ws.send(JSON.stringify({ type: 'typing', isTyping: false }));
  }, 1000);
};
```
