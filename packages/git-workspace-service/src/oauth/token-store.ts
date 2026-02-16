/**
 * Token Store
 *
 * Securely stores and manages OAuth tokens with support for:
 * - Expiry checking
 * - Automatic refresh triggers
 * - Multiple storage backends (file, memory, keychain)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import type { GitProvider, OAuthToken } from '../types';

export interface TokenStoreOptions {
  /**
   * Encryption key for file-based storage
   * If not provided, tokens are stored in plaintext (not recommended for production)
   */
  encryptionKey?: string;

  /**
   * Directory to store tokens (for FileTokenStore)
   * Default: ~/.parallax/tokens
   */
  directory?: string;
}

/**
 * Token store interface
 */
export abstract class TokenStore {
  /**
   * Save a token for a provider
   */
  abstract save(provider: GitProvider, token: OAuthToken): Promise<void>;

  /**
   * Get a token for a provider
   */
  abstract get(provider: GitProvider): Promise<OAuthToken | null>;

  /**
   * Clear a token for a provider (or all tokens)
   */
  abstract clear(provider?: GitProvider): Promise<void>;

  /**
   * List all stored providers
   */
  abstract list(): Promise<GitProvider[]>;

  /**
   * Check if a token is expired
   */
  isExpired(token: OAuthToken): boolean {
    if (!token.expiresAt) {
      return false; // No expiry = never expires
    }
    // Consider expired if within 5 minutes of expiry
    const buffer = 5 * 60 * 1000;
    return Date.now() > token.expiresAt.getTime() - buffer;
  }

  /**
   * Check if a token needs refresh (expired or close to expiry)
   */
  needsRefresh(token: OAuthToken): boolean {
    if (!token.expiresAt) {
      return false;
    }
    // Refresh if within 10 minutes of expiry
    const buffer = 10 * 60 * 1000;
    return Date.now() > token.expiresAt.getTime() - buffer;
  }
}

/**
 * In-memory token store (for testing and short-lived processes)
 */
export class MemoryTokenStore extends TokenStore {
  private tokens: Map<GitProvider, OAuthToken> = new Map();

  async save(provider: GitProvider, token: OAuthToken): Promise<void> {
    this.tokens.set(provider, token);
  }

  async get(provider: GitProvider): Promise<OAuthToken | null> {
    return this.tokens.get(provider) || null;
  }

  async clear(provider?: GitProvider): Promise<void> {
    if (provider) {
      this.tokens.delete(provider);
    } else {
      this.tokens.clear();
    }
  }

  async list(): Promise<GitProvider[]> {
    return Array.from(this.tokens.keys());
  }
}

/**
 * File-based token store with optional encryption
 */
export class FileTokenStore extends TokenStore {
  private readonly directory: string;
  private readonly encryptionKey?: Buffer;

  constructor(options: TokenStoreOptions = {}) {
    super();
    this.directory = options.directory || path.join(os.homedir(), '.parallax', 'tokens');

    if (options.encryptionKey) {
      // Derive a 32-byte key from the provided key
      this.encryptionKey = crypto
        .createHash('sha256')
        .update(options.encryptionKey)
        .digest();
    }
  }

  async save(provider: GitProvider, token: OAuthToken): Promise<void> {
    await this.ensureDirectory();

    const filePath = this.getTokenPath(provider);

    // Serialize token (convert Date to ISO string)
    const serialized = JSON.stringify({
      ...token,
      expiresAt: token.expiresAt?.toISOString(),
      createdAt: token.createdAt.toISOString(),
    });

    // Encrypt if key provided
    const data = this.encryptionKey
      ? this.encrypt(serialized)
      : serialized;

    await fs.writeFile(filePath, data, 'utf-8');
  }

  async get(provider: GitProvider): Promise<OAuthToken | null> {
    const filePath = this.getTokenPath(provider);

    try {
      const data = await fs.readFile(filePath, 'utf-8');

      // Decrypt if encrypted
      const serialized = this.encryptionKey
        ? this.decrypt(data)
        : data;

      const parsed = JSON.parse(serialized);

      // Convert date strings back to Date objects
      return {
        ...parsed,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
        createdAt: new Date(parsed.createdAt),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async clear(provider?: GitProvider): Promise<void> {
    if (provider) {
      const filePath = this.getTokenPath(provider);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    } else {
      // Clear all tokens
      try {
        const files = await fs.readdir(this.directory);
        await Promise.all(
          files
            .filter((f) => f.endsWith('.token'))
            .map((f) => fs.unlink(path.join(this.directory, f)))
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }

  async list(): Promise<GitProvider[]> {
    try {
      const files = await fs.readdir(this.directory);
      return files
        .filter((f) => f.endsWith('.token'))
        .map((f) => f.replace('.token', '') as GitProvider);
    } catch {
      return [];
    }
  }

  private getTokenPath(provider: GitProvider): string {
    return path.join(this.directory, `${provider}.token`);
  }

  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
  }

  private encrypt(data: string): string {
    if (!this.encryptionKey) {
      return data;
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Prepend IV to encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(data: string): string {
    if (!this.encryptionKey) {
      return data;
    }

    const [ivHex, encrypted] = data.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
