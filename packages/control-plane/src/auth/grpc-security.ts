import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSecureContext } from 'node:tls';
import * as grpc from '@grpc/grpc-js';

/** Shared service identity for trusted control-plane clients, not end-user RBAC. */
export function createGrpcAuthInterceptor(
  apiKey: string
): grpc.ServerInterceptor {
  const expected = createHash('sha256').update(apiKey).digest();
  return (_method, call) =>
    new grpc.ServerInterceptingCall(call, {
      start(next) {
        next({
          onReceiveMetadata(metadata, forward) {
            const supplied = metadata.get('x-parallax-api-key');
            if (
              supplied.length !== 1 ||
              typeof supplied[0] !== 'string' ||
              !timingSafeEqual(
                expected,
                createHash('sha256').update(supplied[0]).digest()
              )
            ) {
              call.sendStatus({
                code: grpc.status.UNAUTHENTICATED,
                details: 'Valid service API key required',
              });
              return;
            }
            forward(metadata);
          },
        });
      },
    });
}

/** Explicit TLS configuration must never degrade to plaintext. */
export function buildGrpcServerCredentials(
  env: NodeJS.ProcessEnv = process.env
): grpc.ServerCredentials {
  for (const field of [
    'PARALLAX_GRPC_TLS_ENABLED',
    'PARALLAX_GRPC_TLS_REQUIRE_CLIENT_CERT',
  ]) {
    if (env[field] !== undefined && !['true', 'false'].includes(env[field]!)) {
      throw new Error(`${field} must be true or false`);
    }
  }

  if (env.PARALLAX_GRPC_TLS_ENABLED !== 'true') {
    if (env.NODE_ENV === 'production')
      throw new Error('gRPC TLS is required in production');
    if (
      env.PARALLAX_GRPC_TLS_CA ||
      env.PARALLAX_GRPC_TLS_CERT ||
      env.PARALLAX_GRPC_TLS_KEY ||
      env.PARALLAX_GRPC_TLS_REQUIRE_CLIENT_CERT === 'true'
    ) {
      throw new Error(
        'gRPC TLS files/client-certificate mode configured but TLS is not enabled'
      );
    }
    return grpc.ServerCredentials.createInsecure();
  }
  const requireClientCert =
    env.PARALLAX_GRPC_TLS_REQUIRE_CLIENT_CERT === 'true';
  if (
    !env.PARALLAX_GRPC_TLS_CERT ||
    !env.PARALLAX_GRPC_TLS_KEY ||
    (requireClientCert && !env.PARALLAX_GRPC_TLS_CA)
  ) {
    throw new Error(
      'gRPC TLS requires certificate and key paths, plus CA for client-certificate authentication'
    );
  }
  const ca = env.PARALLAX_GRPC_TLS_CA
    ? readFileSync(env.PARALLAX_GRPC_TLS_CA)
    : null;
  const cert = readFileSync(env.PARALLAX_GRPC_TLS_CERT);
  const key = readFileSync(env.PARALLAX_GRPC_TLS_KEY);
  // Validate now so invalid material fails startup rather than failing later handshakes.
  createSecureContext({
    ca: ca || undefined,
    cert,
    key,
    minVersion: 'TLSv1.2',
  });
  return grpc.ServerCredentials.createSsl(
    ca,
    [{ private_key: key, cert_chain: cert }],
    requireClientCert
  );
}
