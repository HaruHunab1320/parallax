# Changelog

## 0.1.0

### Initial Release

- `ParallaxClient` with 12 resource namespaces covering full Parallax REST API
- Dual authentication: API key (`plx_` prefix) and JWT Bearer tokens
- `HttpClient` with retry logic, exponential backoff, and timeout support
- `ParallaxError` with status-aware helpers (isNotFound, isEnterprise, isForbidden, etc.)

#### OSS Resources
- `patterns` — list, get, validate, execute, metrics
- `agents` — list, get, health, test, capabilityStats, updateStatus, delete, deleteStale
- `executions` — list, get, create, events, cancel, retry, stats, waitForCompletion
- `schedules` — list, get, create, update, delete, pause, resume, trigger, runs
- `license` — info, features, check
- `managedAgents` — runtimes, list, spawn, get, stop, send, logs, metrics
- `managedThreads` — list, spawn, prepare, get, stop, send, events, decisions

#### Enterprise Resources
- `triggers` — list, createWebhook, createEvent, get, update, delete, pause, resume, sendWebhook
- `auth` — register, login, refresh, forgotPassword, resetPassword, changePassword, me, logout, verify
- `users` — list, create, me, get, update, delete, createApiKey, listApiKeys, revokeApiKey
- `audit` — query, stats, userActivity, resourceHistory, failedLogins, cleanup
- `backup` — export, info, restore (merge/replace), validate
