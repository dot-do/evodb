/**
 * Tests for the synthetic Bluesky event generator
 */

import { describe, it, expect } from 'vitest';
import {
  generateEvents,
  generateDataset,
  generateEventsIterator,
  estimateMemoryUsage,
  estimateJsonSize,
} from '../generator.js';
import { DATA_SIZES, type BlueskyEventJson } from '../types.js';

describe('Bluesky Event Generator', () => {
  describe('generateEvents', () => {
    it('should generate the requested number of events', () => {
      const events = generateEvents(100);
      expect(events).toHaveLength(100);
    });

    it('should generate valid event structure', () => {
      const events = generateEvents(10);

      for (const event of events) {
        // Check required fields
        expect(event.kind).toBeDefined();
        expect(['commit', 'identity', 'account']).toContain(event.kind);
        expect(event.did).toBeDefined();
        expect(event.did).toMatch(/^did:plc:[a-z2-7]+$/);
        expect(event.time_us).toBeDefined();
        expect(typeof event.time_us).toBe('number');
      }
    });

    it('should generate commit events with proper structure', () => {
      // Generate enough events to get some commits
      const events = generateEvents(100);
      const commits = events.filter(e => e.kind === 'commit');

      expect(commits.length).toBeGreaterThan(0);

      for (const event of commits) {
        expect(event.commit).toBeDefined();
        expect(event.commit!.operation).toBeDefined();
        expect(['create', 'update', 'delete']).toContain(event.commit!.operation);
        expect(event.commit!.collection).toBeDefined();
        expect(event.commit!.rkey).toBeDefined();
      }
    });

    it('should generate identity events with proper structure', () => {
      // Generate many events to ensure we get identity events
      const events = generateEvents(1000);
      const identities = events.filter(e => e.kind === 'identity');

      expect(identities.length).toBeGreaterThan(0);

      for (const event of identities) {
        expect(event.identity).toBeDefined();
        expect(event.identity!.seq).toBeDefined();
        expect(typeof event.identity!.seq).toBe('number');
      }
    });

    it('should generate account events with proper structure', () => {
      // Generate many events to ensure we get account events
      const events = generateEvents(1000);
      const accounts = events.filter(e => e.kind === 'account');

      expect(accounts.length).toBeGreaterThan(0);

      for (const event of accounts) {
        expect(event.account).toBeDefined();
        expect(typeof event.account!.active).toBe('boolean');
        expect(typeof event.account!.seq).toBe('number');
      }
    });

    it('should be reproducible with the same seed', () => {
      const events1 = generateEvents(50, { seed: 12345 });
      const events2 = generateEvents(50, { seed: 12345 });

      expect(events1).toEqual(events2);
    });

    it('should generate different events with different seeds', () => {
      const events1 = generateEvents(50, { seed: 12345 });
      const events2 = generateEvents(50, { seed: 54321 });

      expect(events1).not.toEqual(events2);
    });

    it('should generate events with increasing timestamps', () => {
      const events = generateEvents(100);

      for (let i = 1; i < events.length; i++) {
        expect(events[i].time_us).toBeGreaterThan(events[i - 1].time_us);
      }
    });

    it('should generate post records with text content', () => {
      const events = generateEvents(500);
      const posts = events.filter(
        e => e.kind === 'commit' &&
             e.commit?.collection === 'app.bsky.feed.post' &&
             e.commit?.operation !== 'delete'
      );

      expect(posts.length).toBeGreaterThan(0);

      for (const event of posts) {
        expect(event.commit!.record).toBeDefined();
        expect(event.commit!.record!.text).toBeDefined();
        expect(typeof event.commit!.record!.text).toBe('string');
        expect(event.commit!.record!.createdAt).toBeDefined();
      }
    });

    it('should generate some posts with replies', () => {
      const events = generateEvents(1000);
      const postsWithReplies = events.filter(
        e => e.kind === 'commit' &&
             e.commit?.collection === 'app.bsky.feed.post' &&
             e.commit?.record?.reply
      );

      expect(postsWithReplies.length).toBeGreaterThan(0);

      for (const event of postsWithReplies) {
        const reply = event.commit!.record!.reply!;
        expect(reply.parent).toBeDefined();
        expect(reply.parent.uri).toBeDefined();
        expect(reply.parent.cid).toBeDefined();
        expect(reply.root).toBeDefined();
        expect(reply.root.uri).toBeDefined();
        expect(reply.root.cid).toBeDefined();
      }
    });

    it('should generate some posts with embeds', () => {
      const events = generateEvents(1000);
      const postsWithEmbeds = events.filter(
        e => e.kind === 'commit' &&
             e.commit?.collection === 'app.bsky.feed.post' &&
             e.commit?.record?.embed
      );

      expect(postsWithEmbeds.length).toBeGreaterThan(0);

      for (const event of postsWithEmbeds) {
        const embed = event.commit!.record!.embed!;
        expect(embed.$type).toBeDefined();
      }
    });

    it('should generate some posts with languages', () => {
      const events = generateEvents(500);
      const postsWithLangs = events.filter(
        e => e.kind === 'commit' &&
             e.commit?.collection === 'app.bsky.feed.post' &&
             e.commit?.record?.langs
      );

      expect(postsWithLangs.length).toBeGreaterThan(0);

      for (const event of postsWithLangs) {
        const langs = event.commit!.record!.langs!;
        expect(Array.isArray(langs)).toBe(true);
        expect(langs.length).toBeGreaterThan(0);
      }
    });
  });

  describe('generateDataset', () => {
    it('should generate tiny dataset', () => {
      const events = generateDataset('tiny');
      expect(events).toHaveLength(DATA_SIZES.tiny);
    });

    it('should respect custom config', () => {
      const events = generateDataset('tiny', {
        seed: 99999,
        kindDistribution: {
          commit: 1.0,
          identity: 0,
          account: 0,
        },
      });

      expect(events).toHaveLength(DATA_SIZES.tiny);
      // All should be commits
      expect(events.every(e => e.kind === 'commit')).toBe(true);
    });
  });

  describe('generateEventsIterator', () => {
    it('should generate events in batches', async () => {
      const batches: BlueskyEventJson[][] = [];

      for await (const batch of generateEventsIterator(250, 100)) {
        batches.push(batch);
      }

      // Should have 3 batches: 100, 100, 50
      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(100);
      expect(batches[1]).toHaveLength(100);
      expect(batches[2]).toHaveLength(50);

      // Total should be 250
      const total = batches.reduce((sum, b) => sum + b.length, 0);
      expect(total).toBe(250);
    });

    it('should be reproducible with seed', async () => {
      const batches1: BlueskyEventJson[][] = [];
      const batches2: BlueskyEventJson[][] = [];

      for await (const batch of generateEventsIterator(100, 50, { seed: 42 })) {
        batches1.push(batch);
      }

      for await (const batch of generateEventsIterator(100, 50, { seed: 42 })) {
        batches2.push(batch);
      }

      expect(batches1).toEqual(batches2);
    });
  });

  describe('estimateMemoryUsage', () => {
    it('should estimate memory for event counts', () => {
      const tiny = estimateMemoryUsage(1000);
      const small = estimateMemoryUsage(100000);

      expect(tiny).toBeLessThan(small);
      expect(tiny).toBeGreaterThan(0);

      // ~400 bytes per event
      expect(tiny).toBeCloseTo(400000, -4);
    });
  });

  describe('estimateJsonSize', () => {
    it('should estimate JSON size for event counts', () => {
      const tiny = estimateJsonSize(1000);
      const small = estimateJsonSize(100000);

      expect(tiny).toBeLessThan(small);
      expect(tiny).toBeGreaterThan(0);

      // ~350 bytes per event
      expect(tiny).toBeCloseTo(350000, -4);
    });
  });

  describe('Event Distribution', () => {
    it('should follow expected kind distribution', () => {
      const events = generateEvents(10000);

      const counts = {
        commit: events.filter(e => e.kind === 'commit').length,
        identity: events.filter(e => e.kind === 'identity').length,
        account: events.filter(e => e.kind === 'account').length,
      };

      // ~95% commits, 3% identity, 2% account (with some variance)
      expect(counts.commit).toBeGreaterThan(9000);
      expect(counts.commit).toBeLessThan(9800);
      expect(counts.identity).toBeGreaterThan(100);
      expect(counts.account).toBeGreaterThan(50);
    });

    it('should follow expected collection distribution for commits', () => {
      const events = generateEvents(10000);
      const commits = events.filter(e => e.kind === 'commit');

      const counts = {
        post: commits.filter(e => e.commit?.collection === 'app.bsky.feed.post').length,
        like: commits.filter(e => e.commit?.collection === 'app.bsky.feed.like').length,
        repost: commits.filter(e => e.commit?.collection === 'app.bsky.feed.repost').length,
        follow: commits.filter(e => e.commit?.collection === 'app.bsky.graph.follow').length,
        profile: commits.filter(e => e.commit?.collection === 'app.bsky.actor.profile').length,
      };

      // Likes should be most common (~45%), posts ~25%
      expect(counts.like).toBeGreaterThan(counts.post);
      expect(counts.like).toBeGreaterThan(counts.repost);
      expect(counts.like).toBeGreaterThan(counts.follow);
      expect(counts.post).toBeGreaterThan(counts.profile);
    });
  });
});
