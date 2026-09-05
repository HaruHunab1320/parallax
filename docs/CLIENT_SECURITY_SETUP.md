# Client security setup

HTTP API keys and the gRPC service key are separate credentials. HTTP keys carry an account's role and may have narrower scopes. The gRPC key grants trusted service access to all gRPC methods; use it only in trusted agents and backend clients. Do not put it or a JWT signing key in browser configuration.

## TypeScript and Python agent SDKs

The TypeScript registry, pattern, coordinator and execution wrappers, TypeScript agent registration/renewal/unregistration/gateway, Python pattern/execution clients, and Python agent registration/renewal/unregistration/gateway send `x-parallax-api-key` metadata from `PARALLAX_GRPC_API_KEY`.

Python agent startup now fails and closes its listener when registration is rejected, including rejected service credentials. Shutdown unregisters using the actual registry protocol and closes the owned channel. Re-registration keeps a single lease-renewal task; registry requests have bounded deadlines.

Set client transport configuration before constructing clients:

```sh
PARALLAX_GRPC_TLS_ENABLED=true
PARALLAX_GRPC_CLIENT_TLS_CA=/run/secrets/control-plane-ca.pem
```

Supply `PARALLAX_GRPC_API_KEY` through the secret manager. A public CA can use the platform's normal trust roots by omitting the CA file. For mutual TLS, set both `PARALLAX_GRPC_CLIENT_TLS_CERT` and `PARALLAX_GRPC_CLIENT_TLS_KEY` to the client identity files. These names deliberately differ from the server certificate/key variables. Invalid or unreadable files, incomplete client identity pairs, invalid enablement values, and TLS files combined with explicit `false` are errors; they do not fall back to plaintext. Certificate hostname verification remains enabled.

An explicit gRPC channel credential argument remains authoritative. Existing constructor calls continue to work, and TypeScript wrappers may now omit that argument to use environment configuration. Explicit per-call metadata overrides the environment key and is copied without mutation. Gateway options accept `apiKey`/`metadata` in TypeScript and `api_key`/`metadata` in Python. Python pattern and execution constructors accept keyword-only `api_key` and `metadata` as well. Caller-provided metadata takes precedence over the key option.

When no TLS configuration or explicit credentials are present, the SDK retains its local insecure-channel behavior. Set TLS explicitly for production; production control planes require it. Raw generated gRPC clients remain low-level APIs: callers must supply their own channel credentials and metadata. Inbound agent listeners have their own authentication/TLS configuration and are not secured merely by configuring the outbound control-plane connection. Prefer the gateway for agents that should not expose an inbound listener.

## CLI and management SDK

Set `PARALLAX_API_URL` to the HTTPS control-plane URL and provide the account API key through `PARALLAX_API_KEY`. The CLI HTTP client sends `Authorization: ApiKey ...` for requests and execution WebSocket upgrades. Explicit `apiKey` configuration overrides the environment; `accessToken` configuration uses a Bearer session instead.

The management SDK supports a request-specific bootstrap token:

```ts
await client.auth.register(email, password, name, setupToken);
```

It sends `X-Parallax-Bootstrap-Token` only on registration; the token is not put in the JSON body or retained as a default header. Registration creates only the first administrator. Subsequent account creation uses the user-management API and license policy.

## Dashboard

First-account setup includes a password-style setup token field. Production requires the deployment's bootstrap token; nonproduction without a configured bootstrap token may leave it empty. The field is not stored in browser storage.

Thread events now use authenticated streaming fetch. Requests carry the current session token, share the normal refresh operation after an expired token, and reconnect after transient failures. HTTP 401/403 after refresh stops retries. Unmount/disconnect aborts the stream. Credentials are restricted to the configured API origin, redirects are rejected, and tokens are never added to a stream URL. SSE parsing handles fragmented UTF-8, CR/LF boundaries and multiline data, and bounds individual events to 1 MiB.

The thread stream still lacks replay after a disconnected interval. The existing unused browser-native WebSocket helper cannot set authentication headers; a future integration needs an authenticated proxy or a scoped ticket exchange. Sessions currently use browser local storage, so a future hardened browser session design should move refresh credentials to appropriately protected cookies alongside the necessary CSRF controls.

## Local verification

Run on Node 24:

```sh
pnpm --filter @parallaxai/sdk-typescript exec vitest run
pnpm --filter @parallaxai/client exec vitest run __tests__/resources/auth.test.ts
pnpm --filter @parallaxai/web-dashboard test
pnpm --filter @parallaxai/cli test
```

Python tests run with `PYTHONPATH=packages/sdk-python/src pytest packages/sdk-python/tests`. Real loopback gRPC tests exercise accepted/rejected service keys on unary and streaming calls, including TypeScript agent registration, renewal and gateway handshake. Dashboard and CLI tests use real local HTTP transport; CLI tests include an authenticated WebSocket handshake. No production service is required for these tests.
