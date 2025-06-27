import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

export class CryptoUtils {
  /**
   * Hash a password using bcrypt
   */
  static async hashPassword(password: string, rounds = 10): Promise<string> {
    return bcrypt.hash(password, rounds);
  }

  /**
   * Compare a plain password with a hashed password
   */
  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate a random token
   */
  static generateToken(length = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a secure random string
   */
  static generateSecureRandom(length = 16): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(length);
    const result = new Array(length);
    
    for (let i = 0; i < length; i++) {
      result[i] = chars[bytes[i] % chars.length];
    }
    
    return result.join('');
  }

  /**
   * Generate a UUID v4
   */
  static generateUUID(): string {
    return crypto.randomUUID();
  }

  /**
   * Create a hash of data using SHA256
   */
  static hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Create an HMAC signature
   */
  static createHMAC(data: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Verify an HMAC signature
   */
  static verifyHMAC(data: string, signature: string, secret: string): boolean {
    const expectedSignature = this.createHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}