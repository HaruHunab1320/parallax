# Runtime security and supported execution contracts

Runtime HTTP APIs and WebSocket upgrades require a service credential by default.
Set `PARALLAX_RUNTIME_API_KEY` to the same random secret (at least 32 bytes) in the
control plane and its runtime. Provision it through your secret manager; do not put
it in a pattern, agent environment, URL, browser application or source control.
The control-plane `RuntimeClient` sends it in `x-parallax-runtime-key` on HTTP and
WebSocket requests. A client can provide `apiKey` explicitly when different
runtimes use different credentials. Configure the matching `apiKey` in the
`RuntimeServer` options for programmatic servers.

This key identifies a trusted control plane with full authority over that runtime.
It does not provide tenant isolation or end-user authorization. Deploy a runtime
within one customer/security boundary. Runtime servers currently expose HTTP;
protect remote connections with TLS termination or an authenticated encrypted
network, restrict ingress to the control plane, and keep the service off the public
internet. The client supports HTTPS/WSS, rejects mismatched HTTP/WebSocket hosts or
transport security, and refuses HTTP redirects so credentials are not forwarded to
another origin. Do not put the runtime key in frontend code. Browser applications
should use authenticated control-plane APIs and its event stream.

All runtime CLIs bind to `127.0.0.1` by default. Set `RUNTIME_HOST=0.0.0.0` explicitly
for a container/private service and configure the required key. Missing or invalid
keys fail startup before the runtime or Kubernetes controller initializes.
`GET /health` is a public, minimal process probe. `GET /api/health` contains runtime
details and requires authentication, as do every other HTTP route and WebSocket
path, including terminal streams.

For an explicitly unauthenticated local development setup, set
`PARALLAX_RUNTIME_AUTH_MODE=development` in both runtime and control plane and use
loopback runtime URLs. This mode fails startup with `NODE_ENV=production` or a
non-loopback listener/URL. `NODE_ENV=test` alone does not disable authentication.

## Capabilities

The authenticated `GET /api/capabilities` endpoint describes the runtime transport.
The control plane checks it before allocating a remote thread.

| Runtime HTTP transport | Agents | Threads with lifecycle events | Execution cleanup |
| --- | --- | --- | --- |
| Local | Yes | Yes | Yes |
| Docker | Yes | No | Yes |
| Kubernetes | Yes | No | Yes |

Docker has no thread implementation. Kubernetes has internal experimental thread
methods, but the remote lifecycle event bridge and preparation/policy parity are
incomplete. Both return HTTP 501 for `/api/threads` and its subroutes instead of
accepting work that cannot satisfy the control plane's thread contract. Use local
threads or an appropriate gateway agent for thread workflows. A legacy runtime
without the capabilities endpoint cannot accept threads through the updated client.

Local threads honor `preparation.approvalPreset`, then the top-level preset, then
`PARALLAX_APPROVAL_PRESET`, with `standard` as the default. Explicit `autonomous`
remains available. Unknown presets and requests for presets on unsupported custom
adapters are rejected. Docker/Kubernetes agent creation rejects approval presets
because those transports cannot enforce them. Local thread policy fields are also
rejected until their enforcement is implemented; this includes workspace confinement.
Operator configuration should not claim these controls are effective.

Local context files require a prepared workspace path. Absolute paths, traversal
outside the workspace and existing symlinks in context paths are rejected before
writing any file. The runtime does not provision repositories and rejects a
repository-only workspace request. These checks protect preparation from common
path escapes; they are not a filesystem sandbox. Local agents run as the host user
and inherit the host's CLI credentials by default. An approval preset is a CLI
behavior setting, not an OS security boundary. Use isolated workers for untrusted
repositories, policies that require confinement, or separation between customers.

## Cleanup and upgrades

`DELETE /api/executions/:executionId/resources` first stops workers associated with
that execution, then deletes its shared authentication resource. A stop or resource
deletion failure fails the request; the control plane also propagates it. A missing
underlying resource is idempotent, but a missing HTTP endpoint is an error.
Kubernetes stop waits for the agent's observed pods to terminate before reporting
success; a timeout remains an error that requires reconciliation.

Authentication resource names now incorporate a hash of the complete execution ID
instead of its first eight characters. This prevents different executions with
the same prefix from sharing or deleting each other's credentials. Drain existing
executions before upgrading the control plane, runtime and Kubernetes controller
together. After confirming all old workers have stopped, remove obsolete resources
with the old `parallax-auth-<eight-character-prefix>` names using your normal
operations process; the new runtime deliberately does not guess their ownership.

Runtime worker inventories and local thread projections remain in memory. This
change does not add durable workflow replay, fencing, tenant isolation, or a
production isolated command-verification worker.
