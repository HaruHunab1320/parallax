import { type ParallaxClientConfig, validateConfig } from './config.js';
import { HttpClient } from './http.js';
import {
  AgentsResource,
  AuditResource,
  AuthResource,
  BackupResource,
  ExecutionsResource,
  LicenseResource,
  ManagedAgentsResource,
  ManagedThreadsResource,
  PatternsResource,
  SchedulesResource,
  TriggersResource,
  UsersResource,
} from './resources/index.js';

export class ParallaxClient {
  /** Pattern management — list, execute, upload, CRUD */
  readonly patterns: PatternsResource;

  /** Agent management — list, health check, test, delete */
  readonly agents: AgentsResource;

  /** Execution management — create, list, cancel, stats */
  readonly executions: ExecutionsResource;

  /** Schedule management — create, pause, resume, trigger (Enterprise) */
  readonly schedules: SchedulesResource;

  /** License information — features, checks */
  readonly license: LicenseResource;

  /** Managed agent runtimes — spawn, stop, send messages */
  readonly managedAgents: ManagedAgentsResource;

  /** Managed threads — spawn, stop, send input, shared decisions */
  readonly managedThreads: ManagedThreadsResource;

  /** Trigger management — webhook and event triggers (Enterprise) */
  readonly triggers: TriggersResource;

  /** Authentication — register, login, token refresh (Enterprise) */
  readonly auth: AuthResource;

  /** User management — CRUD, API keys (Enterprise) */
  readonly users: UsersResource;

  /** Audit logs — query, stats, cleanup (Enterprise, admin only) */
  readonly audit: AuditResource;

  /** Backup & restore — export, import, validate (Enterprise, admin only) */
  readonly backup: BackupResource;

  private readonly http: HttpClient;

  constructor(config: ParallaxClientConfig) {
    validateConfig(config);
    this.http = new HttpClient(config);

    this.patterns = new PatternsResource(this.http);
    this.agents = new AgentsResource(this.http);
    this.executions = new ExecutionsResource(this.http);
    this.schedules = new SchedulesResource(this.http);
    this.license = new LicenseResource(this.http);
    this.managedAgents = new ManagedAgentsResource(this.http);
    this.managedThreads = new ManagedThreadsResource(this.http);
    this.triggers = new TriggersResource(this.http);
    this.auth = new AuthResource(this.http, config);
    this.users = new UsersResource(this.http);
    this.audit = new AuditResource(this.http);
    this.backup = new BackupResource(this.http);
  }

  /** Update the access token (e.g. after login or token refresh) */
  setAccessToken(token: string): void {
    this.http.setAccessToken(token);
  }
}
