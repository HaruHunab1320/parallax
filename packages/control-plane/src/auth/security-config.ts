export interface SecurityConfig {
  development: boolean;
  httpHost: string;
  grpcHost: string;
  grpcApiKey?: string;
}

/** Authentication is independent of the commercial license. Open access is opt-in. */
export function getSecurityConfig(
  env: NodeJS.ProcessEnv = process.env
): SecurityConfig {
  const mode = env.PARALLAX_AUTH_MODE || 'required';
  if (mode !== 'required' && mode !== 'development') {
    throw new Error('PARALLAX_AUTH_MODE must be required or development');
  }
  const development = mode === 'development';
  if (development && env.NODE_ENV === 'production') {
    throw new Error(
      'Development authentication mode is forbidden in production'
    );
  }
  const httpHost =
    env.PARALLAX_HTTP_HOST || (development ? '127.0.0.1' : '0.0.0.0');
  const grpcHost =
    env.PARALLAX_GRPC_HOST || (development ? '127.0.0.1' : '0.0.0.0');
  if (
    development &&
    [httpHost, grpcHost].some((host) => !['127.0.0.1', '::1'].includes(host))
  ) {
    throw new Error(
      'Development authentication mode requires loopback HTTP and gRPC binds'
    );
  }
  const grpcApiKey = env.PARALLAX_GRPC_API_KEY;
  if (!development && (!grpcApiKey || Buffer.byteLength(grpcApiKey) < 32)) {
    throw new Error('PARALLAX_GRPC_API_KEY with at least 32 bytes is required');
  }
  if (
    env.NODE_ENV === 'production' &&
    env.PARALLAX_GRPC_TLS_ENABLED !== 'true'
  ) {
    throw new Error('PARALLAX_GRPC_TLS_ENABLED=true is required in production');
  }
  return { development, httpHost, grpcHost, grpcApiKey };
}
