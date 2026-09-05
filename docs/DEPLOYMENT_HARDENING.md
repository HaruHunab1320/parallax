# Deployment and database validation hardening

This change makes the checked-in deployment configuration enforce the control-plane and runtime authentication contracts. It does not deploy an environment, provision credentials, issue certificates, migrate a live database, or establish enterprise readiness.

## Toolchain and release gates

The supported application runtime is Node.js 24 LTS (`24.20.0` in `.nvmrc`, CI, and the control-plane, dashboard, and Kubernetes runtime Dockerfiles). Docker builds install pnpm `10.11.0` and Turbo `2.5.5`, matching the repository's package manager and resolved Turbo version, instead of downloading the latest tools. Private PEM/key files and local secret directories are excluded from the Docker context.

Image builds call the CI workflow for the same source revision and wait for its lint, typecheck, build, unit, database, deployment-configuration, and dependency-audit jobs. Production dependencies with high or critical advisories fail the audit job; the JSON inventory is retained even when the gate fails. The existing dependency inventory is not clean. The workspace audit includes applications, demonstrations, and docs, so its counts are not a deployed-image vulnerability count. No automatic dependency upgrades or exceptions are introduced here.

Automatic deployment checks out the successful image build's commit and uses that SHA for images and manifests. Partial manual image builds do not automatically deploy. A manual deployment must name a full commit SHA and find all three previously published images. Helm now uses `--atomic`; the standalone runtime rollout remains a separate operation and is not rolled back automatically with the Helm release.

## Provisioned configuration

The GCP example expects these independently provisioned Kubernetes Secrets in namespace `parallax`:

| Secret | Keys and purpose |
| --- | --- |
| `parallax-secrets` | `DATABASE_URL`, `JWT_SECRET`, `PARALLAX_GRPC_API_KEY`, `PARALLAX_RUNTIME_API_KEY` |
| `parallax-secrets` during initial setup | `PARALLAX_BOOTSTRAP_TOKEN`; remove this key after creating the first administrator |
| `parallax-secrets` when licensed | `PARALLAX_LICENSE_KEY` |
| `parallax-grpc-tls` | `tls.crt`, `tls.key` for the control-plane gRPC listener |
| `parallax-http-tls` | `tls.crt`, `tls.key` for the HTTPS ingress |

Generate independent authentication secrets of at least 32 bytes and distribute only the appropriate service key to each trusted client. The deployment preflight validates required key presence/length and checks TLS parsing, key matching, and certificate validity without logging secret values. The bootstrap token is optional for an existing deployment; an empty deployment still requires it for initial registration. Certificate issuance, hostname coverage, renewal, and trust distribution remain operator responsibilities.

Configure the actual ingress hostname and certificate instead of using the `parallax.local` example. `controlPlane.existingSecret` and `controlPlane.grpcTls.existingSecret` are mandatory. HTTP ingress requires TLS, the direct plaintext REST LoadBalancer is rejected, and the gRPC LoadBalancer is disabled by default. Mutual gRPC TLS is available through `controlPlane.grpcTls.requireClientCert`; provision the client CA using `grpcTls.caKey` in the TLS Secret. Invalid or unreadable TLS files fail service startup.

Database credentials and JWT signing secrets are no longer rendered into the control-plane ConfigMap. If using chart-managed PostgreSQL, add `DATABASE_PASSWORD` to the existing Secret and ensure its value matches the encoded password in `DATABASE_URL`. The chart does not generate or rotate credentials. An embedded license credential was removed from the GCP values file; rotate/reissue that previously committed credential through its issuer rather than reusing it from repository history.

The Kubernetes runtime receives `PARALLAX_RUNTIME_API_KEY` from the same Secret, binds explicitly using `RUNTIME_HOST=0.0.0.0`, and uses the minimal unauthenticated `/health` endpoint for probes. `/api/health` requires authentication. Runtime HTTP is intended for a controlled private network or a TLS-terminating proxy; the key provides service authentication, not encryption or per-job identity.

The control-plane Compose stack now requires explicit authentication secrets and a directory containing gRPC TLS files (`PARALLAX_GRPC_TLS_DIR`). Its published API, gRPC, and metrics ports bind to loopback. An HTTPS reverse proxy is still required for remotely exposed HTTP. The older infrastructure-only Compose examples are development aids, not hardened production stacks.

See [security configuration](SECURITY_CONFIGURATION.md) for HTTP/gRPC client headers, initial administrator registration, password migration, and remaining identity boundaries.

## Safe database test execution

Run from the repository root with Docker available:

```sh
pnpm test:db:isolated
```

The runner starts new PostgreSQL 16 and etcd containers under random names with loopback-only random ports. It does not reuse the project's existing containers, the fixed `parallax_test` database, `.env` database credentials, or existing published database ports. Vitest creates a new `parallax_test_<random-id>` database, applies every Prisma migration, and drops only that database at teardown. The runner removes only the containers it created. Setup, migration, and cleanup errors fail the run.

For dedicated CI infrastructure managed elsewhere, set `TEST_DATABASE_ADMIN_URL` explicitly and run `pnpm --filter @parallaxai/control-plane test:db`. The supplied account must be allowed to create and drop databases; still use isolated test infrastructure. `DATABASE_URL` alone is deliberately insufficient. Each invocation always generates its own database name.

The database configuration replaces the base test include/exclude lists instead of concatenating them. This restores the previously excluded database suite. Full HTTP tests run the actual server in a separate TSX process with ephemeral ports and persisted account fixtures; process teardown owns its listeners and background intervals. Execution tests now require the exact missing-agent failure and verify its persisted state and execution ID. They no longer accept either success or failure as a passing outcome.

Validated locally on Node.js 24.20.0:

- All 55 database/repository/HTTP tests across six files pass against disposable infrastructure, with every migration applied to a fresh database.
- Concurrent first-account registration through two application instances yields exactly one administrator and one closed-registration response.
- Concurrent terminal transitions admit one winner; late completion/recovery cannot overwrite the stored terminal state, and orphan queries require an explicit owner.
- `node scripts/validate-deployment.mjs` passes: the GCP chart renders and lints; Secret references and TLS mounts exist; six unsafe configurations fail rendering.

These checks do not verify a live GKE rollout, workload identity, real certificate trust, backups/restoration, multi-node failover, container-image scanning, or successful LLM work through a remote runtime. Those remain required before an exposed enterprise pilot.
