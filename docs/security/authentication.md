# Authentication & Authorization Guide

This guide explains how to implement authentication and authorization in the Parallax platform.

## Overview

Parallax provides a comprehensive authentication system supporting:
- **JWT Authentication**: Token-based authentication for API access
- **OAuth 2.0 / OIDC**: Social login and enterprise SSO
- **Role-Based Access Control (RBAC)**: Fine-grained permissions
- **Multi-tenancy**: Isolated access per tenant

## Quick Start

### 1. Install Dependencies

```bash
pnpm add @parallax/auth
```

### 2. Configure Authentication

```typescript
import { JWTService, JWTMiddleware, RBACService } from '@parallax/auth';
import pino from 'pino';

const logger = pino();

// JWT configuration
const jwtConfig = {
  secret: process.env.JWT_SECRET || 'your-secret-key',
  algorithm: 'HS256' as const,
  expiresIn: '1h',
  refreshExpiresIn: '7d',
  issuer: 'parallax',
  audience: 'parallax-api',
};

// Initialize services
const jwtService = new JWTService(jwtConfig, logger);
const jwtMiddleware = new JWTMiddleware(jwtService, logger);
const rbacService = new RBACService(logger);
```

### 3. Protect Routes

```typescript
import express from 'express';
import { Resources, Actions } from '@parallax/auth';

const app = express();

// Public route
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Protected route - requires authentication
app.get('/api/agents',
  jwtMiddleware.authenticate(),
  async (req, res) => {
    // req.user contains the JWT payload
    res.json({ agents: [] });
  }
);

// Protected route - requires specific permission
app.post('/api/agents',
  jwtMiddleware.authenticate(),
  rbacService.requirePermission({
    resource: Resources.AGENT,
    action: Actions.CREATE,
  }),
  async (req, res) => {
    // Only users with agent:create permission
    res.json({ created: true });
  }
);

// Protected route - requires specific role
app.delete('/api/agents/:id',
  jwtMiddleware.authenticate(),
  jwtMiddleware.requireRoles('admin', 'tenant_admin'),
  async (req, res) => {
    // Only admins can delete
    res.json({ deleted: true });
  }
);
```

## JWT Authentication

### Generate Tokens

```typescript
import { User } from '@parallax/auth';

// After user login
const user: User = {
  id: 'user-123',
  email: 'user@example.com',
  name: 'John Doe',
  roles: ['developer'],
  tenantId: 'tenant-456',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const tokens = await jwtService.generateTokens(user);
// Returns:
// {
//   accessToken: "eyJ...",
//   refreshToken: "eyJ...",
//   expiresIn: 3600,
//   tokenType: "Bearer"
// }
```

### Verify Tokens

```typescript
try {
  const payload = await jwtService.verifyToken(token);
  console.log('User ID:', payload.sub);
  console.log('Roles:', payload.roles);
} catch (error) {
  console.error('Invalid token:', error);
}
```

### Refresh Tokens

```typescript
app.post('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  
  try {
    const tokens = await jwtService.refreshAccessToken(refreshToken);
    res.json(tokens);
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});
```

## OAuth 2.0 Integration

### Configure OAuth Providers

```typescript
import { OAuthMiddleware } from '@parallax/auth';

const oauthMiddleware = new OAuthMiddleware({
  providers: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: 'http://localhost:8080/auth/google/callback',
      scope: ['openid', 'email', 'profile'],
      authorizationUrl: 'https://accounts.google.com',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      redirectUri: 'http://localhost:8080/auth/github/callback',
      scope: ['read:user', 'user:email'],
      authorizationUrl: 'https://github.com',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
    },
  },
  jwtService,
  successRedirect: 'http://localhost:3000/dashboard',
  failureRedirect: 'http://localhost:3000/login',
  onUserAuthenticated: async (user) => {
    // Custom logic: create/update user in database
    await userService.findOrCreate(user);
  },
}, logger);

await oauthMiddleware.initialize();

// Mount OAuth routes
app.use(oauthMiddleware.getRouter());
```

### OAuth Flow

1. **Login**: User visits `/auth/google`
2. **Authorization**: Redirected to Google login
3. **Callback**: Google redirects to `/auth/google/callback`
4. **Token Exchange**: Code exchanged for tokens
5. **JWT Generation**: Platform tokens generated
6. **Success**: User redirected with tokens

## Role-Based Access Control (RBAC)

### Default Roles

```typescript
import { DefaultRoles } from '@parallax/auth';

// Available roles:
// - admin: Full system access
// - tenant_admin: Tenant management
// - operator: System operations
// - developer: Pattern execution
// - viewer: Read-only access
// - user: Basic user
```

### Define Custom Roles

```typescript
import { Role } from '@parallax/auth';

const customRole: Role = {
  name: 'ml_engineer',
  description: 'Machine Learning Engineer',
  permissions: [
    {
      resource: 'agent',
      action: 'manage',
      scope: 'tenant',
    },
    {
      resource: 'pattern',
      action: 'execute',
      scope: 'tenant',
    },
    {
      resource: 'metrics',
      action: 'read',
      scope: 'all',
    },
  ],
};

rbacService.addRole(customRole);
```

### Check Permissions

```typescript
// In route handler
const hasPermission = await rbacService.hasPermission(req.user, {
  resource: 'agent',
  action: 'update',
  resourceId: req.params.agentId,
  tenantId: req.user.tenantId,
});

if (!hasPermission) {
  return res.status(403).json({ error: 'Access denied' });
}
```

## Multi-Tenancy

### Tenant Isolation

```typescript
// Require tenant access
app.get('/api/tenants/:tenantId/agents',
  jwtMiddleware.authenticate(),
  jwtMiddleware.requireTenant(),
  async (req, res) => {
    // Only users in the tenant can access
    const agents = await agentService.getByTenant(req.params.tenantId);
    res.json(agents);
  }
);

// Custom tenant extraction
app.get('/api/data',
  jwtMiddleware.authenticate(),
  jwtMiddleware.requireTenant(req => req.headers['x-tenant-id']),
  async (req, res) => {
    // Tenant ID from header
    res.json({ data: [] });
  }
);
```

## Security Best Practices

### 1. Environment Variables

```bash
# .env
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_REFRESH_SECRET=different-secret-for-refresh-tokens
BCRYPT_ROUNDS=12
SESSION_TIMEOUT=3600000

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 2. Token Storage

```typescript
// Client-side (React)
// Store tokens securely
const storeTokens = (tokens: AuthToken) => {
  // Access token in memory only
  setAccessToken(tokens.accessToken);
  
  // Refresh token in httpOnly cookie
  document.cookie = `refreshToken=${tokens.refreshToken}; HttpOnly; Secure; SameSite=Strict`;
};

// Include token in requests
const apiClient = axios.create({
  headers: {
    'Authorization': `Bearer ${getAccessToken()}`,
  },
});
```

### 3. Password Security

```typescript
import { CryptoUtils } from '@parallax/auth';

// Hash passwords
const hashedPassword = await CryptoUtils.hashPassword(plainPassword);

// Verify passwords
const isValid = await CryptoUtils.comparePassword(plainPassword, hashedPassword);

// Generate secure tokens
const resetToken = CryptoUtils.generateToken(32);
const sessionId = CryptoUtils.generateUUID();
```

### 4. CORS Configuration

```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

### 5. Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests
  message: 'Too many login attempts',
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  // Login logic
});
```

## API Authentication Examples

### Login Endpoint

```typescript
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  // Validate user credentials
  const user = await userService.findByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const validPassword = await CryptoUtils.comparePassword(
    password,
    user.passwordHash
  );
  
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Generate tokens
  const tokens = await jwtService.generateTokens(user);
  
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
    },
    tokens,
  });
});
```

### Logout Endpoint

```typescript
app.post('/api/auth/logout',
  jwtMiddleware.authenticate({ credentialsRequired: false }),
  async (req, res) => {
    if (req.token) {
      await jwtService.revokeToken(req.token);
    }
    
    res.json({ success: true });
  }
);
```

### User Profile Endpoint

```typescript
app.get('/api/auth/profile',
  jwtMiddleware.authenticate(),
  async (req, res) => {
    const user = await userService.findById(req.user!.sub);
    
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      tenantId: user.tenantId,
      permissions: rbacService.getUserPermissions(user.roles),
    });
  }
);
```

## Testing Authentication

### Unit Tests

```typescript
import { JWTService } from '@parallax/auth';

describe('JWTService', () => {
  it('should generate and verify tokens', async () => {
    const user = createMockUser();
    const tokens = await jwtService.generateTokens(user);
    
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    
    const payload = await jwtService.verifyToken(tokens.accessToken);
    expect(payload.sub).toBe(user.id);
    expect(payload.email).toBe(user.email);
  });
});
```

### Integration Tests

```typescript
import supertest from 'supertest';

describe('Auth API', () => {
  it('should protect routes', async () => {
    // Without token
    const res1 = await supertest(app)
      .get('/api/agents')
      .expect(401);
    
    // With token
    const token = await getTestToken();
    const res2 = await supertest(app)
      .get('/api/agents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
```

## Troubleshooting

### Common Issues

1. **Invalid Token Error**
   - Check token expiration
   - Verify JWT secret matches
   - Ensure proper token format

2. **CORS Errors**
   - Add origin to allowed list
   - Enable credentials in CORS

3. **Permission Denied**
   - Check user roles
   - Verify resource permissions
   - Check tenant isolation

4. **OAuth Callback Errors**
   - Verify redirect URI matches
   - Check OAuth app configuration
   - Ensure secrets are correct

## Next Steps

- [Security Best Practices](./security-best-practices.md)
- [API Documentation](../api/authentication.md)
- [Multi-tenancy Guide](./multi-tenancy.md)