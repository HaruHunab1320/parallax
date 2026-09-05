import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSecureContext } from 'node:tls';
import { type ChannelCredentials, credentials, Metadata } from '@grpc/grpc-js';

/** Copy caller metadata and supply the service key only when none was provided. */
export function controlPlaneMetadata(
  metadata?: Metadata,
  apiKey = process.env.PARALLAX_GRPC_API_KEY
): Metadata {
  const result = metadata?.clone() ?? new Metadata();
  if (apiKey && result.get('x-parallax-api-key').length === 0) {
    result.set('x-parallax-api-key', apiKey);
  }
  return result;
}

/** Explicit channel credentials override environment configuration. */
export function controlPlaneCredentials(
  explicit?: ChannelCredentials
): ChannelCredentials {
  if (explicit) return explicit;
  const enabled = process.env.PARALLAX_GRPC_TLS_ENABLED;
  if (enabled !== undefined && !['true', 'false'].includes(enabled)) {
    throw new Error('PARALLAX_GRPC_TLS_ENABLED must be true or false');
  }
  const caPath = process.env.PARALLAX_GRPC_CLIENT_TLS_CA;
  const certPath = process.env.PARALLAX_GRPC_CLIENT_TLS_CERT;
  const keyPath = process.env.PARALLAX_GRPC_CLIENT_TLS_KEY;
  const configured = Boolean(caPath || certPath || keyPath);
  if (enabled === 'false' && configured)
    throw new Error('Client TLS files require TLS to be enabled');
  if (Boolean(certPath) !== Boolean(keyPath))
    throw new Error(
      'Client TLS certificate and key must be configured together'
    );
  if (enabled !== 'true' && !configured) return credentials.createInsecure();
  const ca = caPath ? readFileSync(caPath) : undefined;
  const cert = certPath ? readFileSync(certPath) : undefined;
  const key = keyPath ? readFileSync(keyPath) : undefined;
  for (const pem of [ca, cert]) {
    if (!pem) continue;
    const certificates = pem
      .toString()
      .match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (!certificates?.length)
      throw new Error('Client TLS file must contain PEM certificates');
    for (const certificate of certificates) new X509Certificate(certificate);
  }
  // Validate before making any request; malformed configuration never falls back.
  createSecureContext({ ca, cert, key });
  return credentials.createSsl(ca, key, cert);
}
