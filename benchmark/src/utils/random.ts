/**
 * @evodb/benchmark - Random Number Utilities
 *
 * Seedable pseudo-random number generator for reproducible benchmarks.
 * Uses xorshift128+ algorithm for good statistical properties.
 */

/**
 * Seedable PRNG using xorshift128+
 */
export class SeededRandom {
  private state0: bigint;
  private state1: bigint;

  constructor(seed: number = Date.now()) {
    // Initialize state from seed using splitmix64
    let s = BigInt(seed);
    s = (s ^ (s >> 30n)) * 0xbf58476d1ce4e5b9n;
    s = (s ^ (s >> 27n)) * 0x94d049bb133111ebn;
    this.state0 = s ^ (s >> 31n);

    s = BigInt(seed + 1);
    s = (s ^ (s >> 30n)) * 0xbf58476d1ce4e5b9n;
    s = (s ^ (s >> 27n)) * 0x94d049bb133111ebn;
    this.state1 = s ^ (s >> 31n);
  }

  /**
   * Get next random 64-bit value
   */
  private next(): bigint {
    let s1 = this.state0;
    const s0 = this.state1;
    const result = s0 + s1;
    this.state0 = s0;
    s1 ^= s1 << 23n;
    this.state1 = s1 ^ s0 ^ (s1 >> 17n) ^ (s0 >> 26n);
    return result & 0xFFFFFFFFFFFFFFFFn;
  }

  /**
   * Get random float in [0, 1)
   */
  random(): number {
    const value = this.next();
    return Number(value & 0x1FFFFFFFFFFFFFn) / 0x20000000000000;
  }

  /**
   * Get random integer in [min, max]
   */
  int(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /**
   * Get random float in [min, max)
   */
  float(min: number, max: number): number {
    return this.random() * (max - min) + min;
  }

  /**
   * Get random boolean with given probability of true
   */
  bool(probability: number = 0.5): boolean {
    return this.random() < probability;
  }

  /**
   * Pick random element from array
   */
  pick<T>(array: T[]): T {
    return array[this.int(0, array.length - 1)];
  }

  /**
   * Shuffle array in place
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Generate random string of given length
   */
  string(length: number, charset: string = 'abcdefghijklmnopqrstuvwxyz0123456789'): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[this.int(0, charset.length - 1)];
    }
    return result;
  }

  /**
   * Generate UUID v4
   */
  uuid(): string {
    const hex = '0123456789abcdef';
    let uuid = '';
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        uuid += '-';
      } else if (i === 14) {
        uuid += '4';
      } else if (i === 19) {
        uuid += hex[this.int(8, 11)];
      } else {
        uuid += hex[this.int(0, 15)];
      }
    }
    return uuid;
  }

  /**
   * Generate value following Zipf distribution
   * Used for realistic access patterns where some items are accessed much more frequently
   */
  zipf(n: number, skew: number = 1.0): number {
    // Use inverse transform sampling
    const u = this.random();

    // Precompute normalization constant (approximate for large n)
    let sum = 0;
    for (let i = 1; i <= n; i++) {
      sum += 1 / Math.pow(i, skew);
    }

    // Find the value
    let cumulative = 0;
    for (let i = 1; i <= n; i++) {
      cumulative += (1 / Math.pow(i, skew)) / sum;
      if (u <= cumulative) {
        return i - 1; // 0-indexed
      }
    }
    return n - 1;
  }

  /**
   * Generate value following Gaussian (normal) distribution
   */
  gaussian(mean: number = 0, stdDev: number = 1): number {
    // Box-Muller transform
    const u1 = this.random();
    const u2 = this.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  }

  /**
   * Generate value following exponential distribution
   */
  exponential(lambda: number = 1): number {
    return -Math.log(1 - this.random()) / lambda;
  }

  /**
   * Generate weighted random selection
   */
  weighted<T>(items: T[], weights: number[]): T {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = this.random() * totalWeight;

    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return items[i];
      }
    }
    return items[items.length - 1];
  }
}

/**
 * Global random instance with default seed
 */
export const random = new SeededRandom();

/**
 * Create random instance with specific seed
 */
export function createRandom(seed: number): SeededRandom {
  return new SeededRandom(seed);
}
