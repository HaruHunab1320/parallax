# mTLS Setup Guide

This guide explains how to set up mutual TLS (mTLS) authentication for secure agent communication in the Parallax platform.

## Overview

mTLS provides:
- **Mutual Authentication**: Both client and server verify each other's identity
- **Encrypted Communication**: All data is encrypted in transit
- **Certificate-based Identity**: No passwords or API keys needed
- **Automatic Rotation**: Support for certificate rotation without downtime

## Prerequisites

- OpenSSL or Node.js (for certificate generation)
- Access to certificate storage directory
- Proper file permissions for private keys

## Quick Start

### 1. Generate Certificates

```bash
# Using the built-in script
cd packages/security
pnpm run generate-certs

# Or manually specify directory
PARALLAX_CERTS_DIR=/path/to/certs pnpm run generate-certs
```

This generates:
- Root CA certificate
- Service certificates (control-plane, agent-proxy)
- Agent certificates
- Client certificates (CLI, admin)

### 2. Enable mTLS

Set environment variables:

```bash
# Enable mTLS
export PARALLAX_TLS_ENABLED=true
export PARALLAX_CERTS_DIR=/path/to/certs

# Optional: Require client certificates
export PARALLAX_TLS_VERIFY_CLIENT=true

# For development: Allow fallback to insecure
export PARALLAX_TLS_ALLOW_INSECURE=true
```

### 3. Start Services with mTLS

Control Plane:
```bash
PARALLAX_TLS_ENABLED=true pnpm --filter @parallax/control-plane start
```

Secure Agent:
```bash
PARALLAX_TLS_ENABLED=true pnpm --filter @parallax/secure-agent-example dev
```

## Certificate Management

### Directory Structure

```
certs/
├── ca/
│   ├── cert.pem      # Root CA certificate
│   └── key.pem       # Root CA private key
├── control-plane/
│   ├── cert.pem      # Service certificate
│   ├── key.pem       # Service private key
│   └── ca.pem        # CA certificate
├── agent-1/
│   ├── cert.pem      # Agent certificate
│   ├── key.pem       # Agent private key
│   └── ca.pem        # CA certificate
└── cli/
    ├── cert.pem      # Client certificate
    ├── key.pem       # Client private key
    └── ca.pem        # CA certificate
```

### Manual Certificate Generation

Generate CA:
```bash
# Generate CA private key
openssl genrsa -out ca/key.pem 4096

# Generate CA certificate
openssl req -new -x509 -days 3650 -key ca/key.pem -out ca/cert.pem \
  -subj "/C=US/ST=CA/L=San Francisco/O=Parallax/CN=Parallax Root CA"
```

Generate service certificate:
```bash
# Generate private key
openssl genrsa -out service/key.pem 2048

# Generate CSR
openssl req -new -key service/key.pem -out service/csr.pem \
  -subj "/C=US/ST=CA/L=San Francisco/O=Parallax/CN=control-plane.parallax.local"

# Sign with CA
openssl x509 -req -in service/csr.pem -CA ca/cert.pem -CAkey ca/key.pem \
  -CAcreateserial -out service/cert.pem -days 365 \
  -extensions v3_req -extfile <(cat <<EOF
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1 = control-plane.parallax.local
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF
)
```

### Certificate Rotation

Automatic rotation:
```typescript
// In your agent code
await agent.rotateCertificates();
```

Manual rotation:
```bash
# Generate new certificates
pnpm --filter @parallax/security generate-certs

# Restart services to pick up new certificates
```

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PARALLAX_TLS_ENABLED` | Enable mTLS | `false` |
| `PARALLAX_CERTS_DIR` | Certificate directory | `./certs` |
| `PARALLAX_TLS_CA_FILE` | CA certificate path | Auto-detected |
| `PARALLAX_TLS_CERT_FILE` | Certificate path | Auto-detected |
| `PARALLAX_TLS_KEY_FILE` | Private key path | Auto-detected |
| `PARALLAX_TLS_VERIFY_CLIENT` | Require client certs | `false` |
| `PARALLAX_TLS_ALLOW_INSECURE` | Allow insecure fallback | `false` |

### Programmatic Configuration

```typescript
import { getMTLSConfig } from '@parallax/security';

const mtlsConfig = {
  enabled: true,
  certsDir: '/path/to/certs',
  checkClientCertificate: true,
  allowInsecure: false
};

// For agents
const agent = new SecureParallaxAgent(
  'agent-1',
  'My Agent',
  ['capability'],
  {},
  mtlsConfig,
  logger
);

// For control plane
const credentialsProvider = new MTLSCredentialsProvider(
  mtlsConfig,
  logger
);
```

## Security Best Practices

### 1. Certificate Storage

- Store private keys with restricted permissions (600)
- Use secure storage solutions (HashiCorp Vault, AWS KMS)
- Never commit certificates to version control
- Regularly backup CA certificate and key

### 2. Certificate Lifecycle

- Use short-lived certificates (90-365 days)
- Implement automatic rotation
- Monitor certificate expiration
- Maintain certificate revocation list (CRL)

### 3. Network Security

- Use mTLS for all agent communication
- Restrict network access with firewalls
- Enable client certificate verification in production
- Monitor for unauthorized connection attempts

### 4. Kubernetes Deployment

Use cert-manager for automatic certificate management:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: parallax-control-plane
spec:
  secretName: control-plane-tls
  issuerRef:
    name: parallax-ca-issuer
    kind: ClusterIssuer
  commonName: control-plane.parallax.local
  dnsNames:
  - control-plane.parallax.local
  - control-plane
  duration: 2160h # 90 days
  renewBefore: 720h # 30 days
```

## Troubleshooting

### Common Issues

1. **Certificate verification failed**
   - Check CA certificate is correct
   - Verify certificate chain
   - Check certificate validity dates
   - Ensure hostname matches certificate CN/SAN

2. **Permission denied**
   - Check file permissions on private keys
   - Ensure process has read access to certificates

3. **Connection refused**
   - Verify mTLS is enabled on both client and server
   - Check firewall rules
   - Verify correct ports are being used

### Debug Mode

Enable detailed logging:
```bash
export LOG_LEVEL=debug
export GRPC_VERBOSITY=DEBUG
export GRPC_TRACE=all
```

### Verify Certificates

Check certificate details:
```bash
# View certificate
openssl x509 -in cert.pem -text -noout

# Verify certificate chain
openssl verify -CAfile ca/cert.pem service/cert.pem

# Test TLS connection
openssl s_client -connect localhost:50051 \
  -cert client/cert.pem \
  -key client/key.pem \
  -CAfile ca/cert.pem
```

## Integration Examples

### Secure Agent

```typescript
import { SecureParallaxAgent } from '@parallax/sdk-typescript';
import { getMTLSConfig } from '@parallax/security';

class MySecureAgent extends SecureParallaxAgent {
  constructor() {
    super(
      'my-agent',
      'My Secure Agent',
      ['capability'],
      {},
      getMTLSConfig(),
      logger
    );
  }
  
  async analyze(task: string, data?: any): Promise<[any, number]> {
    // Implementation
  }
}
```

### Secure Client

```typescript
import { SecureGrpcAgentProxy } from '@parallax/runtime';
import { getMTLSConfig } from '@parallax/security';

const proxy = await SecureGrpcAgentProxy.fromMetadata(
  {
    id: 'agent-1',
    name: 'My Agent',
    endpoint: 'localhost:50051'
  },
  getMTLSConfig(),
  logger
);
```

## Monitoring

### Metrics

Monitor these metrics for mTLS health:
- Certificate expiration time
- Failed authentication attempts
- Certificate rotation events
- TLS handshake duration

### Alerts

Set up alerts for:
- Certificates expiring within 30 days
- Failed certificate verifications
- Unusual authentication patterns
- Certificate rotation failures

## Next Steps

- [API Authentication](./api-authentication.md) - JWT and OAuth2 setup
- [Security Best Practices](./best-practices.md) - Overall security guide
- [Compliance](./compliance.md) - Meeting security standards