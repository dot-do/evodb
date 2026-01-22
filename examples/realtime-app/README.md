# EvoDB Real-time Subscriptions Example

> **STATUS: PLACEHOLDER**
>
> This example demonstrates the planned API for real-time subscriptions.
> The actual implementation is in progress. Code structure shows the intended
> design, but full functionality is not yet available.

## Overview

This example shows how to build real-time applications with EvoDB using
WebSocket-based change subscriptions. When a document is created, updated,
or deleted, all subscribers receive the change event in real-time.

## Planned Features

- **WebSocket Change Streams**: Subscribe to table changes via WebSocket
- **Per-Table Subscriptions**: Watch all changes to a specific table
- **Query Subscriptions**: Subscribe to query result changes
- **Optimistic Updates**: Apply changes locally before server confirmation
- **Offline Support**: Queue changes when offline, sync when reconnected
- **Conflict Resolution**: Handle concurrent edits gracefully

## Project Structure

```
realtime-app/
├── src/
│   └── index.ts    # Placeholder implementation with planned API
├── package.json    # Dependencies and scripts
├── tsconfig.json   # TypeScript configuration
├── wrangler.toml   # Cloudflare Workers configuration
└── README.md       # This file
```

## Planned API

### Basic Subscription

```typescript
import { EvoDB, RealtimeManager } from '@evodb/core';

const db = new EvoDB({ mode: 'development' });
const realtime = new RealtimeManager(db);

// Subscribe to all changes on a table
const subscription = await realtime.subscribe('users', {
  includeSnapshot: true, // Get current state first
}, (event) => {
  switch (event.type) {
    case 'insert':
      console.log('New user:', event.document);
      break;
    case 'update':
      console.log('User updated:', event.document);
      break;
    case 'delete':
      console.log('User deleted:', event.previousDocument);
      break;
  }
});

// Later: unsubscribe
subscription.unsubscribe();
```

### Filtered Subscription

```typescript
// Only receive changes matching a filter
const adminSub = await realtime.subscribe('users', {
  filter: { role: 'admin' },
}, (event) => {
  console.log('Admin change:', event);
});
```

### Query Subscription

```typescript
// Subscribe to query result changes
const topUsersSub = await realtime.subscribeQuery(
  db.query('users')
    .where('score', '>', 1000)
    .orderBy('score', 'desc')
    .limit(10),
  (results) => {
    // Called whenever the top 10 leaderboard changes
    updateLeaderboardUI(results);
  }
);
```

### Resume from LSN

```typescript
// Resume subscription from a specific point
const resumeSub = await realtime.subscribe('orders', {
  fromLsn: lastProcessedLsn,
}, (event) => {
  // Process changes since last seen
  processOrder(event);
  lastProcessedLsn = event.lsn;
});
```

## Architecture (Planned)

```
┌─────────────────┐     ┌─────────────────┐
│  Client App     │────▶│  Worker         │
│  (Browser/App)  │◀────│  (Edge)         │
└─────────────────┘     └────────┬────────┘
        │                        │
        │ WebSocket              │ Internal
        │                        │
        ▼                        ▼
┌─────────────────┐     ┌─────────────────┐
│  Subscription   │◀────│  CDC Buffer     │
│  Manager (DO)   │     │  (Parent DO)    │
└─────────────────┘     └────────┬────────┘
                                 │
                                 │ Writes
                                 ▼
                        ┌─────────────────┐
                        │  R2 Storage     │
                        │  (Lakehouse)    │
                        └─────────────────┘
```

## Use Cases

### Chat Application

Real-time message delivery in chat rooms:

```typescript
await realtime.subscribe('messages', {
  filter: { roomId: currentRoom },
  includeSnapshot: true, // Load history
}, (event) => {
  if (event.type === 'insert') {
    appendMessage(event.document);
  }
});
```

### Live Dashboard

Update dashboard metrics in real-time:

```typescript
// Subscribe to order events
await realtime.subscribe('orders', {}, (event) => {
  if (event.type === 'insert') {
    incrementOrderCount();
    updateRevenue(event.document.total);
  }
});
```

### Collaborative Editing

Multi-user document editing:

```typescript
await realtime.subscribe('documents', {
  filter: { _id: documentId },
}, (event) => {
  if (event.type === 'update') {
    // Apply remote changes with conflict resolution
    mergeChanges(event.document, event.previousDocument);
  }
});
```

## Current Limitations

Since this is a placeholder implementation:

1. **WebSocket not implemented**: The `/subscribe` endpoint returns 501
2. **No Durable Object**: Subscription state is not persisted
3. **No actual streaming**: Events are not broadcast
4. **No offline support**: Changes are not queued

## Development Status

- [ ] WebSocket upgrade handler
- [ ] Subscription Durable Object
- [ ] CDC event broadcasting
- [ ] Client SDK for subscriptions
- [ ] Query-based subscriptions
- [ ] Offline queue and sync
- [ ] Conflict resolution strategies

## Setup

1. Install dependencies:

```bash
cd examples/realtime-app
pnpm install
```

2. Run locally:

```bash
pnpm dev
```

3. Visit http://localhost:8787 to see the placeholder output

## Contributing

If you're interested in helping implement real-time subscriptions,
see the main [EvoDB repository](https://github.com/dot-do/evodb) for
contribution guidelines and open issues.

## Learn More

- [EvoDB Documentation](https://github.com/dot-do/evodb)
- [@evodb/writer Package](../../writer/README.md) - CDC buffer implementation
- [Cloudflare Durable Objects](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/)
- [WebSocket API](https://developers.cloudflare.com/workers/runtime-apis/websockets/)
