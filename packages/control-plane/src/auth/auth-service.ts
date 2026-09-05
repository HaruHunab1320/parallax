/**
 * Authentication Service
 *
 * Handles user authentication, JWT token management, and password operations.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient, User } from '@prisma/client';
import jwt from 'jsonwebtoken';
import type { Logger } from 'pino';
import {
  hashPassword,
  isLegacyPasswordHash,
  passwordSchema,
  verifyPassword,
} from './password';

export interface TokenPayload {
  sub: string; // User ID
  email: string;
  role: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthConfig {
  jwtSecret: string;
  accessTokenExpiry: string; // e.g., '15m'
  refreshTokenExpiry: string; // e.g., '7d'
  /** @deprecated Password work factors are maintained by the password module. */
  bcryptRounds?: number;
}

export class AuthService {
  private logger: Logger;
  private config: AuthConfig;

  constructor(
    private prisma: PrismaClient,
    logger: Logger,
    config?: Partial<AuthConfig>
  ) {
    this.logger = logger.child({ component: 'AuthService' });
    const jwtSecret = config?.jwtSecret || process.env.JWT_SECRET;

    if (!jwtSecret && process.env.NODE_ENV === 'production') {
      throw new Error(
        'JWT_SECRET environment variable is required in production'
      );
    }
    if (jwtSecret && Buffer.byteLength(jwtSecret) < 32) {
      throw new Error('JWT_SECRET must contain at least 32 bytes');
    }
    if (!jwtSecret) {
      this.logger.warn(
        'JWT_SECRET not set; using an ephemeral secret. Sessions expire on restart.'
      );
    }

    this.config = {
      jwtSecret: jwtSecret || randomBytes(32).toString('base64'),
      accessTokenExpiry: config?.accessTokenExpiry || '15m',
      refreshTokenExpiry: config?.refreshTokenExpiry || '7d',
      bcryptRounds: config?.bcryptRounds || 12,
    };
  }

  /**
   * Register a new user
   */
  async register(
    email: string,
    password: string,
    name?: string
  ): Promise<{ user: Omit<User, 'passwordHash'>; tokens: AuthTokens }> {
    // Check if user exists
    const existing = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      throw new AuthError(
        'User with this email already exists',
        'EMAIL_EXISTS'
      );
    }

    // Validate password strength
    this.validatePassword(password);

    // Hash password
    const passwordHash = await hashPassword(password);

    // Serialize first-admin bootstrap across control-plane nodes. A count before
    // an independent insert allows two concurrent requests to become admins.
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1885434488, 1)`;
      if ((await tx.user.count()) > 0) {
        throw new AuthError(
          'Registration is closed. Ask an admin to create your account.',
          'REGISTRATION_CLOSED'
        );
      }
      return tx.user.create({
        data: {
          email: email.toLowerCase(),
          name,
          passwordHash,
          role: 'admin',
          status: 'active',
        },
      });
    });

    this.logger.info({ userId: user.id, email: user.email }, 'User registered');

    // Generate tokens
    const tokens = this.generateTokens(user);

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Return user without password hash
    const {
      passwordHash: _,
      metadata: _metadata,
      ...userWithoutPassword
    } = user;
    const safeUser = { ...userWithoutPassword, metadata: null };
    return { user: safeUser, tokens };
  }

  /**
   * Login with email and password
   */
  async login(
    email: string,
    password: string
  ): Promise<{ user: Omit<User, 'passwordHash'>; tokens: AuthTokens }> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (user.status !== 'active') {
      throw new AuthError('Account is not active', 'ACCOUNT_INACTIVE');
    }

    if (!user.passwordHash) {
      throw new AuthError('This account uses SSO authentication', 'SSO_ONLY');
    }

    // Verify password
    if (!(await verifyPassword(password, user.passwordHash))) {
      this.logger.warn({ userId: user.id, email }, 'Failed login attempt');
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (isLegacyPasswordHash(user.passwordHash)) {
      await this.prisma.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash },
        data: { passwordHash: await hashPassword(password) },
      });
    }

    this.logger.info({ userId: user.id, email }, 'User logged in');

    // Generate tokens
    const tokens = this.generateTokens(user);

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Return user without password hash
    const {
      passwordHash: _,
      metadata: _metadata,
      ...userWithoutPassword
    } = user;
    const safeUser = { ...userWithoutPassword, metadata: null };
    return { user: safeUser, tokens };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = jwt.verify(refreshToken, this.config.jwtSecret, {
        algorithms: ['HS256'],
      }) as TokenPayload;

      if (payload.type !== 'refresh') {
        throw new AuthError('Invalid token type', 'INVALID_TOKEN');
      }

      // Get user to ensure they still exist and are active
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.status !== 'active') {
        throw new AuthError('User not found or inactive', 'USER_INACTIVE');
      }

      // Generate new tokens
      return this.generateTokens(user);
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('Invalid or expired refresh token', 'INVALID_TOKEN');
    }
  }

  /**
   * Verify an access token and return the payload
   */
  verifyAccessToken(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret, {
        algorithms: ['HS256'],
      }) as TokenPayload;

      if (payload.type !== 'access') {
        throw new AuthError('Invalid token type', 'INVALID_TOKEN');
      }

      return payload;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthError('Token expired', 'TOKEN_EXPIRED');
      }
      throw new AuthError('Invalid token', 'INVALID_TOKEN');
    }
  }

  /**
   * Verify an API key and return the user
   */
  async authenticateAccessToken(token: string): Promise<TokenPayload> {
    const payload = this.verifyAccessToken(token);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.status !== 'active') {
      throw new AuthError('User not found or inactive', 'USER_INACTIVE');
    }
    return { ...payload, email: user.email, role: user.role };
  }

  async verifyApiKey(apiKey: string): Promise<User> {
    return (await this.authenticateApiKey(apiKey)).user;
  }

  async authenticateApiKey(apiKey: string) {
    const keyHash = createHash('sha256').update(apiKey).digest('hex');

    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

    if (!key) {
      throw new AuthError('Invalid API key', 'INVALID_API_KEY');
    }

    if (key.expiresAt && key.expiresAt <= new Date()) {
      throw new AuthError('API key expired', 'API_KEY_EXPIRED');
    }

    if (key.user.status !== 'active') {
      throw new AuthError('User account is not active', 'ACCOUNT_INACTIVE');
    }

    // Update last used timestamp
    await this.prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      user: key.user,
      apiKey: { id: key.id, permissions: key.permissions },
    };
  }

  /**
   * Change password for a user
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.passwordHash) {
      throw new AuthError('User not found', 'USER_NOT_FOUND');
    }

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AuthError('Current password is incorrect', 'INVALID_PASSWORD');
    }

    this.validatePassword(newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    this.logger.info({ userId }, 'Password changed');
  }

  /**
   * Generate password reset token
   */
  async generatePasswordResetToken(email: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Don't reveal if user exists
      this.logger.info(
        { email },
        'Password reset requested for non-existent user'
      );
      return '';
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        metadata: {
          ...((user.metadata as object) || {}),
          passwordResetToken: tokenHash,
          passwordResetExpires: expiresAt.toISOString(),
        },
      },
    });

    this.logger.info({ userId: user.id }, 'Password reset token generated');
    return token;
  }

  /**
   * Reset password using reset token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Find user with this reset token
    const users = await this.prisma.user.findMany({
      where: {
        metadata: {
          path: ['passwordResetToken'],
          equals: tokenHash,
        },
      },
    });

    if (users.length === 0) {
      throw new AuthError('Invalid or expired reset token', 'INVALID_TOKEN');
    }

    const user = users[0];
    const metadata = user.metadata as any;

    if (
      !metadata?.passwordResetExpires ||
      new Date(metadata.passwordResetExpires) < new Date()
    ) {
      throw new AuthError('Reset token has expired', 'TOKEN_EXPIRED');
    }

    this.validatePassword(newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        metadata: {
          ...metadata,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      },
    });

    this.logger.info({ userId: user.id }, 'Password reset completed');
  }

  /**
   * Get user by ID
   */
  async getUserById(
    userId: string
  ): Promise<Omit<User, 'passwordHash'> | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return null;

    const {
      passwordHash: _,
      metadata: _metadata,
      ...userWithoutPassword
    } = user;
    const safeUser = { ...userWithoutPassword, metadata: null };
    return safeUser;
  }

  // Private methods

  private generateTokens(user: User): AuthTokens {
    const accessPayload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };

    const refreshPayload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
    };

    // Convert expiry strings to seconds for jwt.sign
    const accessExpirySeconds = this.parseExpiry(this.config.accessTokenExpiry);
    const refreshExpirySeconds = this.parseExpiry(
      this.config.refreshTokenExpiry
    );

    const accessToken = jwt.sign(accessPayload, this.config.jwtSecret, {
      expiresIn: accessExpirySeconds,
    });

    const refreshToken = jwt.sign(refreshPayload, this.config.jwtSecret, {
      expiresIn: refreshExpirySeconds,
    });

    return { accessToken, refreshToken, expiresIn: accessExpirySeconds };
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // Default 15 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        return 900;
    }
  }

  private validatePassword(password: string): void {
    const result = passwordSchema.safeParse(password);
    if (!result.success) {
      throw new AuthError(result.error.issues[0].message, 'WEAK_PASSWORD');
    }
  }
}

/**
 * Custom error class for authentication errors
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';

    // Set appropriate status codes
    switch (code) {
      case 'EMAIL_EXISTS':
        this.statusCode = 409;
        break;
      case 'WEAK_PASSWORD':
      case 'INVALID_INPUT':
        this.statusCode = 400;
        break;
      case 'USER_NOT_FOUND':
        this.statusCode = 404;
        break;
      case 'FORBIDDEN':
      case 'REGISTRATION_CLOSED':
        this.statusCode = 403;
        break;
      default:
        this.statusCode = 401;
    }
  }
}
