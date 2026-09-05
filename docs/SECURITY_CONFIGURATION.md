# Control-plane security configuration

Basic HTTP authentication, account bootstrap, role authorization, and API-key restrictions are available with every license. Extra user creation still requires the `multi_user` feature. These controls protect a dedicated deployment; records do not yet carry tenant or project ownership.

## Upgrade from earlier versions

Older open-source deployments exposed APIs without authentication. The default is now `PARALLAX_AUTH_MODE=required`, independent of licensing. Existing callers must send credentials; an explicit loopback-only development mode preserves local experimentation.

- Configure `PARALLAX_GRPC_API_KEY` with a randomly generated secret of at least 32 bytes. All gRPC methods and streams require `x-parallax-api-key` metadata with that value.
- Configure `JWT_SECRET` with a randomly generated value of at least 32 bytes. Production requires it. Nonproduction without this setting uses an ephemeral random secret, so sessions do not survive restart. A previously shipped fixed development secret is no longer accepted.
- Production requires gRPC TLS. HTTP must sit behind an HTTPS reverse proxy; this change does not provide an HTTP TLS listener.
- Use `Authorization: Bearer <access-token>` or `Authorization: ApiKey <key>` for protected HTTP APIs. Execution WebSocket upgrades use the same header, and require `executions:read` in both role and key scope. Tokens in URLs are rejected. Browser-native WebSockets cannot set this header; use an authenticated proxy or add a separately scoped ticket exchange before integrating browser WebSockets.
- Access tokens recheck the account's current role/status on every request. Deletion, suspension, and demotion take effect on the next authenticated request. Already-open streams are authorized at connection time and are not continuously revalidated.
- User/account mutations and API-key management require an account session. API keys cannot mint replacement keys, change passwords, or manage users. Existing unscoped keys still inherit their current account's role; an empty scope list grants nothing. Explicit key scopes must fit the target role, and checks always intersect scopes with that role.
- Administrators can manage accounts. Users can inspect themselves, change their display name, and manage their own API keys. Self-service password changes require the current password through `/api/auth/change-password`. Roles and statuses are validated; password-reset metadata is never exposed in account responses.
- Workspace/credential and audit/backup APIs require administrator access until project ownership and narrower policies exist. Undefined API policies deny access. Trigger webhook receivers now require normal API authentication; unlike the GitHub receiver, they are not exempt based on an optional signature setting. The GitHub webhook receiver retains its mandatory signature verification.

The local startup command is explicitly:

```sh
PARALLAX_AUTH_MODE=development pnpm dev:control-plane
```

This mode is rejected when `NODE_ENV=production`. HTTP and gRPC bind to `127.0.0.1` by default; an override must be `127.0.0.1` or `::1`. Core APIs and execution streams are open to local processes in this mode. User-management routes still need an authenticated account. Do not expose these loopback listeners through a proxy or tunnel. Containers and remote runners should use required mode with credentials.

## Production setup

Provision independent random values for `JWT_SECRET`, `PARALLAX_GRPC_API_KEY`, and initial `PARALLAX_BOOTSTRAP_TOKEN` through your secret manager. Each must be at least 32 bytes/characters as checked by the service. Do not share the JWT signing key with clients.

Required transport configuration:

```sh
NODE_ENV=production
PARALLAX_AUTH_MODE=required
PARALLAX_GRPC_TLS_ENABLED=true
PARALLAX_GRPC_TLS_CERT=/run/secrets/grpc-server-cert.pem
PARALLAX_GRPC_TLS_KEY=/run/secrets/grpc-server-key.pem
```

For mutual TLS, also set `PARALLAX_GRPC_TLS_REQUIRE_CLIENT_CERT=true` and `PARALLAX_GRPC_TLS_CA=/run/secrets/grpc-client-ca.pem`. Missing, unreadable, malformed, or contradictory TLS configuration fails startup. Listener failure no longer leaves HTTP running with a silently failed gRPC service. Bind hosts can be set with `PARALLAX_HTTP_HOST` and `PARALLAX_GRPC_HOST` in required mode.

The gRPC key identifies a **trusted service**, with access to all registered gRPC methods. It is separate from database-backed HTTP API keys and does not implement end-user roles, per-agent credentials, or tenant isolation. Distribute it only to trusted platform clients; untrusted runners still need distinct identities and method/resource authorization before they can share a control plane.

## First account and password migration

`GET /api/users` without credentials returns only `{ "count": number }` for dashboard setup detection. Supplied invalid credentials are rejected rather than treated as anonymous.

When the count is zero, create the first administrator:

- `POST /api/auth/register`
- JSON body: `email`, `password`, optional `name`
- Header: `X-Parallax-Bootstrap-Token`, required in production or whenever `PARALLAX_BOOTSTRAP_TOKEN` is configured.

The token comparison occurs before password work. First-admin creation takes a PostgreSQL advisory transaction lock and rechecks the user count, so simultaneous bootstrap requests cannot both create an administrator. Registration closes after the first account; remove the bootstrap secret after setup. Nonproduction without a bootstrap secret permits first-admin registration, so provision a bootstrap secret for any reachable nonproduction deployment as well.

New passwords use asynchronous native Node.js scrypt with `N=131072`, `r=8`, `p=1`, independent random salts, and timing-safe comparisons. Valid legacy salted SHA-256 passwords migrate on successful login, including older weak passwords; incorrect passwords never migrate. Conditional updates avoid overwriting a password changed concurrently. Registration, administrative resets, and password changes enforce the password policy. The scrypt configuration follows [OWASP's password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), using [Node's asynchronous crypto API](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).

Each scrypt job uses approximately 128 MiB. Each process allows two active derivations and sixteen queued requests; excess work receives a busy response. Public authentication POSTs are limited to 30 requests per source IP per minute. These process-local limits are supplementary: deploy a shared edge rate limiter for multi-node environments. Configure proxy trust deliberately before relying on client IP identification behind a reverse proxy.

Password-reset email delivery is not integrated. `/api/auth/forgot-password` now returns `503 PASSWORD_RESET_NOT_CONFIGURED`, rather than claiming mail delivery or exposing a reset token in development. Administrators can reset an account password. Session logout remains client-side; password change does not currently revoke existing refresh tokens. Persisted sessions and refresh-token rotation/revocation remain follow-up work.

## Verification and remaining boundaries

Focused regressions cover HTTP roles/scopes/account ownership, current account state, legacy migration, open-source bootstrap, bootstrap-token enforcement, malformed inputs, and authentication throttling. Real local gRPC unary/streaming and WebSocket upgrade tests verify credential gates; TLS configuration tests verify fail-closed behavior. The disposable PostgreSQL suite also verifies concurrent first-account registration through two application instances: exactly one administrator is created and the other request receives a closed-registration response.

Related changes add [runtime-server authentication](RUNTIME_SECURITY.md), [SDK/CLI/dashboard integration](CLIENT_SECURITY_SETUP.md), and [deployment configuration checks](DEPLOYMENT_HARDENING.md). Together these still do not establish tenant isolation, per-job runtime identity, durable audit coverage, federated login, continuous stream revocation, or deployment readiness. A deployed pilot still needs operational validation and isolated worker policies appropriate to its workload.
