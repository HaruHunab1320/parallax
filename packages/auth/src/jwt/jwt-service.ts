import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from 'pino';
import { AuthToken, JWTPayload, User, AuthConfig } from '../types';

export class JWTService {
  constructor(
    private config: AuthConfig['jwt'],
    private logger: Logger
  ) {}

  /**
   * Generate access and refresh tokens for a user
   */
  async generateTokens(user: User): Promise<AuthToken> {
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      tenantId: user.tenantId,
    };

    const accessToken = await this.signToken(payload, this.config.expiresIn);
    const refreshToken = await this.signToken(
      { ...payload, type: 'refresh' },
      this.config.refreshExpiresIn
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiration(this.config.expiresIn),
      tokenType: 'Bearer',
    };
  }

  /**
   * Sign a JWT token
   */
  private async signToken(
    payload: JWTPayload | any,
    expiresIn: string
  ): Promise<string> {
    const options: jwt.SignOptions = {
      expiresIn: expiresIn as any,
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithm: this.config.algorithm,
      jwtid: uuidv4(),
    };

    const secret = this.config.algorithm === 'RS256' 
      ? this.config.privateKey! 
      : this.config.secret;

    return new Promise((resolve, reject) => {
      jwt.sign(payload, secret, options, (err, token) => {
        if (err) {
          this.logger.error({ err }, 'Failed to sign token');
          reject(err);
        } else {
          resolve(token!);
        }
      });
    });
  }

  /**
   * Verify and decode a JWT token
   */
  async verifyToken(token: string): Promise<JWTPayload> {
    const secret = this.config.algorithm === 'RS256' 
      ? this.config.publicKey! 
      : this.config.secret;

    const options: jwt.VerifyOptions = {
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithms: [this.config.algorithm],
    };

    return new Promise((resolve, reject) => {
      jwt.verify(token, secret, options, (err, decoded) => {
        if (err) {
          this.logger.warn({ err, token: token.substring(0, 20) }, 'Invalid token');
          reject(err);
        } else {
          resolve(decoded as JWTPayload);
        }
      });
    });
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthToken> {
    const payload = await this.verifyToken(refreshToken);
    
    // Verify it's a refresh token
    if ((payload as any).type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    // Create new user object from payload
    const user: User = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      roles: payload.roles,
      tenantId: payload.tenantId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Generate new tokens
    return this.generateTokens(user);
  }

  /**
   * Revoke a token (would typically add to a blacklist)
   */
  async revokeToken(token: string): Promise<void> {
    // In a real implementation, this would add the token to a blacklist
    // stored in Redis or a database
    this.logger.info({ token: token.substring(0, 20) }, 'Token revoked');
  }

  /**
   * Parse expiration string to seconds
   */
  private parseExpiration(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiration format: ${expiration}`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: throw new Error(`Invalid expiration unit: ${unit}`);
    }
  }
}