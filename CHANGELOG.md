# Changelog

Notable changes to the Parallax monorepo. Published packages will also carry
per-package changelogs once release automation (Changesets) lands; see
[docs/PRODUCTION_READINESS_PLAN.md](docs/PRODUCTION_READINESS_PLAN.md).

## Unreleased

### Breaking

- **Authentication is required on every interface** (from the September 4
  hardening, `9be347c`). REST, the execution WebSocket, every gRPC method and
  stream, and runtime HTTP/WebSocket APIs reject unauthenticated callers.
  Production gRPC requires TLS. Provision `JWT_SECRET`,
  `PARALLAX_GRPC_API_KEY`, `PARALLAX_RUNTIME_API_KEY` and, for an empty
  deployment, `PARALLAX_BOOTSTRAP_TOKEN`; give gateway agents and SDK clients
  the gRPC key. See [docs/DEPLOYMENT_HARDENING.md](docs/DEPLOYMENT_HARDENING.md)
  and [docs/CLIENT_SECURITY_SETUP.md](docs/CLIENT_SECURITY_SETUP.md).
- **Remote Docker and Kubernetes threads return HTTP 501** until their thread
  contract is implemented. Local and gateway threads are unaffected.
- **Local threads default to the `standard` approval preset** instead of
  `autonomous`.
- **The license key previously committed to the Helm values is revoked.**
  Reissue a license if you were using it.

### Security

- User management enforces self/admin boundaries; passwords use scrypt with
  migration of legacy hashes on login.
- Verification fails closed: unknown oracles, missing or failing reviewers
  and nonzero commands can no longer count as passing.
- Cancellation stops work and suppresses late results.
- License keys can be revoked by fingerprint
  (`PARALLAX_LICENSE_REVOKED_SHA256`) and must use canonical encoding.
- `@parallaxai/security` verifies mTLS certificates with `node:crypto`; it
  previously rejected certificates it had issued.

### Fixed

- Gateway agent tasks dispatched through `GatewayRuntimeAdapter.send()` now
  carry their description (it was always undefined).
- Certificate-generation log lines in `@parallaxai/security` keep their
  fields.

### Changed

- Dependencies upgraded across the workspace; the production audit gate
  passes with three documented exceptions
  ([docs/DEPENDENCY_AUDIT.md](docs/DEPENDENCY_AUDIT.md)).
- Node 24, pnpm 10.11.0, Turbo 2.5.5 and Biome 2.4.10 are pinned.
  `pnpm verify` runs the full check suite, and CI runs it on Linux and macOS
  for every pull request and push to `main`.
- Image builds (`build.yml`) and GKE deploys (`deploy.yml`) run only when
  dispatched by hand. Parallax is not hosted right now, so merges to `main`
  build and deploy nothing.
