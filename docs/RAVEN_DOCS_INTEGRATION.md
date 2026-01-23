# Parallax + Raven Docs Integration

## Overview

This document describes the changes needed in Parallax to integrate with Raven Docs as a human/AI collaboration workspace. Agents register with Parallax, request access to Raven Docs workspaces, and execute tasks with confidence-aware orchestration.

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                           RAVEN DOCS                                │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │   Agent     │  │   MCP       │  │  WebSocket  │                │
│  │  Settings   │  │  Standard   │  │   Events    │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
└─────────┼────────────────┼────────────────┼────────────────────────┘
          │                │                │
          │ Approvals      │ Tool calls     │ Real-time events
          │                │                │
┌─────────┼────────────────┼────────────────┼────────────────────────┐
│         │      PARALLAX CONTROL PLANE     │                        │
│         ▼                ▼                ▼                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │  Workspace  │  │     MCP     │  │   Event     │                │
│  │  Connector  │  │   Client    │  │  Subscriber │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                        │
│         └────────────────┼────────────────┘                        │
│                          ▼                                         │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │                    PATTERN ENGINE                          │    │
│  │                                                            │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │    │
│  │  │  Agent   │  │  Prism   │  │   MCP    │  │Execution │  │    │
│  │  │ Registry │  │ Runtime  │  │ Actions  │  │  Events  │  │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │    │
│  └───────────────────────────────────────────────────────────┘    │
│                          │                                         │
└──────────────────────────┼─────────────────────────────────────────┘
                           │
              Agent Registration (gRPC)
                           │
┌──────────────────────────┼─────────────────────────────────────────┐
│                   USER-SUPPLIED AGENTS                              │
│                          │                                          │
│    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐       │
│    │Agent A  │    │Agent B  │    │Agent C  │    │Agent D  │       │
│    └─────────┘    └─────────┘    └─────────┘    └─────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Agent Registration System

### 1.1 Capabilities

#### Core Capabilities (Predefined)

```typescript
// packages/sdk-typescript/src/capabilities.ts

export const CORE_CAPABILITIES = [
  'research',        // Web research, information gathering
  'writing',         // Content creation, documentation
  'analysis',        // Data analysis, pattern recognition
  'validation',      // Fact-checking, verification
  'coding',          // Code generation, debugging
  'summarization',   // Condensing information
  'translation',     // Language translation
  'moderation',      // Content moderation
  'extraction',      // Data extraction from documents
  'planning',        // Task breakdown, project planning
  'review',          // Code review, document review
  'synthesis',       // Combining multiple sources
] as const;

export type CoreCapability = typeof CORE_CAPABILITIES[number];

// Custom capabilities use namespace:name format
export type CustomCapability = `${string}:${string}`;

export type Capability = CoreCapability | CustomCapability;

// Validate capability format
export function isValidCapability(cap: string): cap is Capability {
  if (CORE_CAPABILITIES.includes(cap as CoreCapability)) {
    return true;
  }
  // Custom: must be namespace:name format
  return /^[a-z0-9-]+:[a-z0-9-]+$/.test(cap);
}
```

#### Permissions

```typescript
// packages/sdk-typescript/src/permissions.ts

export const PERMISSIONS = {
  // Read permissions
  'read:pages': 'Read pages and documents',
  'read:tasks': 'Read tasks and their details',
  'read:projects': 'Read projects and their structure',
  'read:memory': 'Query workspace memory/context',
  'read:comments': 'Read comments and discussions',

  // Write permissions
  'write:pages': 'Create and update pages',
  'write:tasks': 'Create and update tasks',
  'write:projects': 'Create and update projects',
  'write:memory': 'Add entries to workspace memory',
  'write:comments': 'Add comments to pages/tasks',

  // Action permissions
  'complete:tasks': 'Mark tasks as complete',
  'assign:tasks': 'Assign tasks to self or others',
  'assign:agents': 'Assign other agents to tasks',
  'delete:own': 'Delete content created by this agent',

  // Special permissions
  'execute:patterns': 'Trigger pattern executions',
  'admin:workspace': 'Full workspace administration',
} as const;

export type Permission = keyof typeof PERMISSIONS;

// Permission groups for common roles
export const PERMISSION_PRESETS = {
  readonly: ['read:pages', 'read:tasks', 'read:projects', 'read:memory'],
  contributor: [
    'read:pages', 'read:tasks', 'read:projects', 'read:memory',
    'write:pages', 'write:tasks', 'complete:tasks', 'write:memory',
  ],
  agent: [
    'read:pages', 'read:tasks', 'read:projects', 'read:memory', 'read:comments',
    'write:pages', 'write:tasks', 'complete:tasks', 'write:memory', 'write:comments',
    'assign:tasks',
  ],
  lead: [
    // All agent permissions plus:
    'write:projects', 'assign:agents', 'execute:patterns',
  ],
} as const;
```

### 1.2 Agent Registration API

#### Proto Definition

```protobuf
// proto/agent-registration.proto

syntax = "proto3";
package parallax.registration;

service AgentRegistration {
  // Initial agent registration with Parallax
  rpc Register(RegisterRequest) returns (RegisterResponse);

  // Request access to a workspace
  rpc RequestWorkspaceAccess(WorkspaceAccessRequest) returns (WorkspaceAccessResponse);

  // Check workspace access status
  rpc GetWorkspaceAccess(GetWorkspaceAccessRequest) returns (WorkspaceAccessResponse);

  // Update agent capabilities/permissions
  rpc UpdateAgent(UpdateAgentRequest) returns (UpdateAgentResponse);

  // Heartbeat to maintain registration
  rpc Heartbeat(HeartbeatRequest) returns (HeartbeatResponse);

  // Unregister agent
  rpc Unregister(UnregisterRequest) returns (UnregisterResponse);
}

message RegisterRequest {
  string agent_id = 1;           // Unique agent identifier
  string agent_name = 2;         // Human-readable name
  repeated string capabilities = 3;
  map<string, string> metadata = 4;  // Model, version, description, etc.
}

message RegisterResponse {
  string agent_id = 1;
  string registration_token = 2;  // Used for subsequent requests
  int64 registered_at = 3;
}

message WorkspaceAccessRequest {
  string agent_id = 1;
  string registration_token = 2;
  string workspace_id = 3;
  repeated string requested_permissions = 4;
  string justification = 5;       // Why the agent needs access
}

message WorkspaceAccessResponse {
  string agent_id = 1;
  string workspace_id = 2;
  AccessStatus status = 3;
  repeated string granted_permissions = 4;
  string mcp_api_key = 5;         // Only populated when approved
  string denial_reason = 6;       // Only populated when denied
}

enum AccessStatus {
  PENDING = 0;
  APPROVED = 1;
  DENIED = 2;
  REVOKED = 3;
}

message HeartbeatRequest {
  string agent_id = 1;
  string registration_token = 2;
  AgentStatus status = 3;
  repeated string active_workspaces = 4;
}

enum AgentStatus {
  IDLE = 0;
  WORKING = 1;
  ERROR = 2;
}

message HeartbeatResponse {
  bool acknowledged = 1;
  repeated WorkspaceUpdate workspace_updates = 2;
}

message WorkspaceUpdate {
  string workspace_id = 1;
  UpdateType type = 2;
  string payload = 3;  // JSON payload for the update
}

enum UpdateType {
  PERMISSION_CHANGED = 0;
  ACCESS_REVOKED = 1;
  TASK_ASSIGNED = 2;
  PROJECT_ASSIGNED = 3;
}
```

#### TypeScript Implementation

```typescript
// packages/control-plane/src/registration/agent-registration.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { EtcdRegistry } from '../registry';
import { DatabaseService } from '../db/database.service';

export interface RegisteredAgent {
  id: string;
  name: string;
  capabilities: string[];
  metadata: Record<string, any>;
  registeredAt: Date;
  lastHeartbeat: Date;
  status: 'idle' | 'working' | 'error' | 'offline';
  workspaceAccess: WorkspaceAccess[];
}

export interface WorkspaceAccess {
  workspaceId: string;
  workspaceName: string;
  status: 'pending' | 'approved' | 'denied' | 'revoked';
  requestedPermissions: string[];
  grantedPermissions: string[];
  mcpApiKey?: string;  // Encrypted, only for approved
  requestedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

@Injectable()
export class AgentRegistrationService {
  private readonly logger = new Logger(AgentRegistrationService.name);

  constructor(
    private readonly registry: EtcdRegistry,
    private readonly database: DatabaseService,
  ) {}

  async registerAgent(request: RegisterRequest): Promise<RegisteredAgent> {
    // Validate capabilities
    for (const cap of request.capabilities) {
      if (!isValidCapability(cap)) {
        throw new Error(`Invalid capability: ${cap}`);
      }
    }

    const agent: RegisteredAgent = {
      id: request.agentId,
      name: request.agentName,
      capabilities: request.capabilities,
      metadata: request.metadata,
      registeredAt: new Date(),
      lastHeartbeat: new Date(),
      status: 'idle',
      workspaceAccess: [],
    };

    // Store in database
    await this.database.agents.upsert(agent);

    // Register in etcd for discovery
    await this.registry.registerAgent({
      id: agent.id,
      name: agent.name,
      capabilities: agent.capabilities,
      endpoint: request.metadata.endpoint,
    });

    this.logger.log(`Agent registered: ${agent.id} (${agent.name})`);
    return agent;
  }

  async requestWorkspaceAccess(
    agentId: string,
    workspaceId: string,
    requestedPermissions: string[],
    justification?: string,
  ): Promise<WorkspaceAccess> {
    const agent = await this.database.agents.findById(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const access: WorkspaceAccess = {
      workspaceId,
      workspaceName: '', // Will be filled by Raven Docs
      status: 'pending',
      requestedPermissions,
      grantedPermissions: [],
      requestedAt: new Date(),
    };

    // Store pending request
    await this.database.workspaceAccessRequests.create({
      agentId,
      ...access,
      justification,
    });

    // Notify Raven Docs of pending request (webhook)
    await this.notifyWorkspace(workspaceId, 'agent_access_requested', {
      agentId,
      agentName: agent.name,
      capabilities: agent.capabilities,
      requestedPermissions,
      justification,
    });

    return access;
  }

  async approveWorkspaceAccess(
    agentId: string,
    workspaceId: string,
    grantedPermissions: string[],
    mcpApiKey: string,
    approvedBy: string,
  ): Promise<WorkspaceAccess> {
    const request = await this.database.workspaceAccessRequests.find({
      agentId,
      workspaceId,
    });

    if (!request) {
      throw new Error('Access request not found');
    }

    const access: WorkspaceAccess = {
      ...request,
      status: 'approved',
      grantedPermissions,
      mcpApiKey: await this.encryptApiKey(mcpApiKey),
      resolvedAt: new Date(),
      resolvedBy: approvedBy,
    };

    await this.database.workspaceAccessRequests.update(access);

    // Notify the agent
    await this.notifyAgent(agentId, 'workspace_access_approved', {
      workspaceId,
      grantedPermissions,
    });

    return access;
  }

  async getAgentsByCapability(capabilities: string[]): Promise<RegisteredAgent[]> {
    return this.database.agents.findByCapabilities(capabilities);
  }

  async getWorkspaceAgents(workspaceId: string): Promise<RegisteredAgent[]> {
    return this.database.agents.findByWorkspace(workspaceId);
  }
}
```

### 1.3 Updated SDK Agent Base Class

```typescript
// packages/sdk-typescript/src/agent-base.ts (updated)

import { Capability, isValidCapability } from './capabilities';
import { Permission } from './permissions';

export interface AgentConfig {
  id: string;
  name: string;
  capabilities: Capability[];
  metadata?: {
    description?: string;
    version?: string;
    model?: string;
    author?: string;
    [key: string]: any;
  };
}

export interface WorkspaceConnection {
  workspaceId: string;
  mcpApiKey: string;
  grantedPermissions: Permission[];
  mcpEndpoint: string;
}

export abstract class ParallaxAgent {
  public readonly id: string;
  public readonly name: string;
  public readonly capabilities: Capability[];
  public readonly metadata: Record<string, any>;

  protected workspaces: Map<string, WorkspaceConnection> = new Map();
  protected registrationToken?: string;

  constructor(config: AgentConfig) {
    // Validate capabilities
    if (!config.capabilities || config.capabilities.length === 0) {
      throw new Error('Agent must declare at least one capability');
    }

    for (const cap of config.capabilities) {
      if (!isValidCapability(cap)) {
        throw new Error(`Invalid capability: ${cap}`);
      }
    }

    this.id = config.id;
    this.name = config.name;
    this.capabilities = config.capabilities;
    this.metadata = config.metadata || {};
  }

  /**
   * Register with Parallax control plane
   */
  async register(controlPlaneEndpoint: string): Promise<void> {
    // ... registration logic
  }

  /**
   * Request access to a Raven Docs workspace
   */
  async requestWorkspaceAccess(
    workspaceId: string,
    requestedPermissions: Permission[],
    justification?: string,
  ): Promise<'pending' | 'approved' | 'denied'> {
    // ... access request logic
  }

  /**
   * Check if agent has permission in workspace
   */
  hasPermission(workspaceId: string, permission: Permission): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;
    return workspace.grantedPermissions.includes(permission);
  }

  /**
   * Get MCP client for a workspace
   */
  getMcpClient(workspaceId: string): McpClient | null {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return null;
    return new McpClient(workspace.mcpEndpoint, workspace.mcpApiKey);
  }

  /**
   * Main analysis method - must be implemented
   */
  abstract analyze(task: string, data?: any): Promise<AgentResponse>;

  /**
   * Called when assigned to a task
   */
  async onTaskAssigned(task: Task, workspace: WorkspaceConnection): Promise<void> {
    // Override in subclass for custom behavior
  }

  /**
   * Called when assigned to a project
   */
  async onProjectAssigned(project: Project, workspace: WorkspaceConnection): Promise<void> {
    // Override in subclass for custom behavior
  }
}
```

---

## Part 2: MCP Integration

### 2.1 MCP Client for Patterns

```typescript
// packages/control-plane/src/mcp/mcp-client.ts

import { Logger } from '@nestjs/common';

export interface McpToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface McpToolResult {
  success: boolean;
  result?: any;
  error?: string;
  approvalRequired?: {
    token: string;
    expiresAt: Date;
    reason: string;
  };
}

export class McpClient {
  private readonly logger = new Logger(McpClient.name);

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
  ) {}

  async callTool(tool: McpToolCall): Promise<McpToolResult> {
    const response = await fetch(`${this.endpoint}/call_tool`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: tool.name,
        arguments: tool.arguments,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const result = await response.json();

    // Check for approval required
    if (result.error === 'APPROVAL_REQUIRED') {
      return {
        success: false,
        approvalRequired: {
          token: result.approvalToken,
          expiresAt: new Date(result.expiresAt),
          reason: result.reason,
        },
      };
    }

    return { success: true, result };
  }

  async listTools(): Promise<string[]> {
    const response = await fetch(`${this.endpoint}/list_tools`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    return data.tools.map((t: any) => t.name);
  }

  async queryMemory(query: string): Promise<any[]> {
    return this.callTool({
      name: 'memory_query',
      arguments: { query },
    }).then(r => r.result?.memories || []);
  }

  async getTask(taskId: string): Promise<any> {
    return this.callTool({
      name: 'task_get',
      arguments: { id: taskId },
    }).then(r => r.result);
  }

  async updateTask(taskId: string, updates: Record<string, any>): Promise<any> {
    return this.callTool({
      name: 'task_update',
      arguments: { id: taskId, ...updates },
    });
  }

  async createPage(title: string, content: string, spaceId?: string): Promise<any> {
    return this.callTool({
      name: 'page_create',
      arguments: { title, content, spaceId },
    });
  }
}
```

### 2.2 MCP Actions in Prism Patterns

```typescript
// packages/control-plane/src/pattern-engine/mcp-actions.ts

export interface McpAction {
  tool: string;
  args: Record<string, any>;
  onApprovalRequired?: 'wait' | 'skip' | 'fail';
}

export class McpActionExecutor {
  constructor(
    private readonly mcpClient: McpClient,
    private readonly logger: Logger,
  ) {}

  async execute(action: McpAction, context: ExecutionContext): Promise<any> {
    // Resolve any variable references in args
    const resolvedArgs = this.resolveArgs(action.args, context);

    this.logger.debug(`Executing MCP action: ${action.tool}`, resolvedArgs);

    const result = await this.mcpClient.callTool({
      name: action.tool,
      arguments: resolvedArgs,
    });

    if (result.approvalRequired) {
      switch (action.onApprovalRequired || 'fail') {
        case 'wait':
          return this.waitForApproval(result.approvalRequired, context);
        case 'skip':
          return { skipped: true, reason: 'approval_required' };
        case 'fail':
        default:
          throw new Error(`Approval required: ${result.approvalRequired.reason}`);
      }
    }

    if (!result.success) {
      throw new Error(`MCP action failed: ${result.error}`);
    }

    return result.result;
  }

  private resolveArgs(args: Record<string, any>, context: ExecutionContext): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        // Resolve reference from context
        resolved[key] = context.resolve(value);
      } else if (typeof value === 'object' && value !== null) {
        resolved[key] = this.resolveArgs(value, context);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  private async waitForApproval(
    approval: { token: string; expiresAt: Date },
    context: ExecutionContext,
  ): Promise<any> {
    // Emit event that approval is needed
    context.emit('approval_required', {
      token: approval.token,
      expiresAt: approval.expiresAt,
    });

    // Poll for approval (or use WebSocket)
    // This would be implementation-specific
    throw new Error('Approval waiting not yet implemented');
  }
}
```

### 2.3 YAML Schema with MCP Support

```yaml
# Extended YAML schema with MCP actions

name: TaskExecutor
version: 1.0.0
description: Execute a task from Raven Docs

# Workspace connection required
workspace:
  required: true
  permissions:
    - read:tasks
    - write:tasks
    - complete:tasks
    - read:memory
    - write:pages

input:
  taskId: string

# Steps can include MCP actions
steps:
  - name: fetch-task
    mcp:
      tool: task_get
      args:
        id: $input.taskId
    output: task

  - name: get-context
    mcp:
      tool: memory_query
      args:
        query: $task.title
    output: context

  - name: analyze
    agents:
      capabilities: [$task.requiredCapabilities]
    input:
      task: $task
      context: $context
    output: analysis

  - name: write-result
    mcp:
      tool: page_create
      args:
        title: "Task Result: ${task.title}"
        content: $analysis.result
      onApprovalRequired: wait
    output: page

  - name: complete-task
    mcp:
      tool: task_complete
      args:
        id: $input.taskId
        result:
          pageId: $page.id
          summary: $analysis.summary

output:
  task: $task
  analysis: $analysis
  page: $page

confidence: $analysis.confidence
```

---

## Part 3: Event System

### 3.1 Event Subscriptions

```typescript
// packages/control-plane/src/events/workspace-events.ts

export interface WorkspaceEventSubscription {
  workspaceId: string;
  agentId: string;
  eventTypes: WorkspaceEventType[];
  filter?: {
    projectIds?: string[];
    taskIds?: string[];
  };
}

export type WorkspaceEventType =
  | 'task.created'
  | 'task.updated'
  | 'task.assigned'
  | 'task.completed'
  | 'project.created'
  | 'project.updated'
  | 'page.created'
  | 'page.updated'
  | 'comment.created';

export class WorkspaceEventManager {
  private subscriptions: Map<string, WorkspaceEventSubscription[]> = new Map();
  private wsConnections: Map<string, WebSocket> = new Map();

  async subscribe(subscription: WorkspaceEventSubscription): Promise<void> {
    const { workspaceId } = subscription;

    if (!this.subscriptions.has(workspaceId)) {
      this.subscriptions.set(workspaceId, []);
      await this.connectToWorkspace(workspaceId);
    }

    this.subscriptions.get(workspaceId)!.push(subscription);
  }

  async unsubscribe(workspaceId: string, agentId: string): Promise<void> {
    const subs = this.subscriptions.get(workspaceId);
    if (subs) {
      const filtered = subs.filter(s => s.agentId !== agentId);
      if (filtered.length === 0) {
        await this.disconnectFromWorkspace(workspaceId);
        this.subscriptions.delete(workspaceId);
      } else {
        this.subscriptions.set(workspaceId, filtered);
      }
    }
  }

  private async connectToWorkspace(workspaceId: string): Promise<void> {
    // Connect to Raven Docs WebSocket for this workspace
    const ws = new WebSocket(`wss://raven-docs/ws?workspace=${workspaceId}`);

    ws.on('message', (data) => {
      const event = JSON.parse(data.toString());
      this.handleWorkspaceEvent(workspaceId, event);
    });

    this.wsConnections.set(workspaceId, ws);
  }

  private handleWorkspaceEvent(workspaceId: string, event: any): void {
    const subs = this.subscriptions.get(workspaceId) || [];

    for (const sub of subs) {
      if (this.matchesSubscription(event, sub)) {
        this.notifyAgent(sub.agentId, event);
      }
    }
  }

  private matchesSubscription(event: any, sub: WorkspaceEventSubscription): boolean {
    // Check event type
    if (!sub.eventTypes.includes(event.type)) {
      return false;
    }

    // Check filters
    if (sub.filter?.projectIds && event.projectId) {
      if (!sub.filter.projectIds.includes(event.projectId)) {
        return false;
      }
    }

    if (sub.filter?.taskIds && event.taskId) {
      if (!sub.filter.taskIds.includes(event.taskId)) {
        return false;
      }
    }

    return true;
  }

  private notifyAgent(agentId: string, event: any): void {
    // Send event to agent via their registered endpoint
    // or queue it for their next heartbeat
  }
}
```

### 3.2 Agent Event Handlers

```typescript
// packages/sdk-typescript/src/event-handler.ts

export interface WorkspaceEvent {
  type: string;
  workspaceId: string;
  timestamp: Date;
  data: any;
}

export interface TaskAssignedEvent extends WorkspaceEvent {
  type: 'task.assigned';
  data: {
    taskId: string;
    taskTitle: string;
    assignedTo: string;  // Agent ID
    assignedBy: string;  // User ID
    projectId?: string;
    dueDate?: Date;
    priority?: string;
  };
}

export interface ProjectAssignedEvent extends WorkspaceEvent {
  type: 'project.assigned';
  data: {
    projectId: string;
    projectName: string;
    assignedTo: string;
    role: 'member' | 'lead';
  };
}

export abstract class ParallaxAgent {
  // ... existing code ...

  /**
   * Handle incoming workspace events
   */
  async handleEvent(event: WorkspaceEvent): Promise<void> {
    switch (event.type) {
      case 'task.assigned':
        if (event.data.assignedTo === this.id) {
          await this.onTaskAssigned(event.data, this.workspaces.get(event.workspaceId)!);
        }
        break;
      case 'project.assigned':
        if (event.data.assignedTo === this.id) {
          await this.onProjectAssigned(event.data, this.workspaces.get(event.workspaceId)!);
        }
        break;
      default:
        await this.onWorkspaceEvent(event);
    }
  }

  /**
   * Override for custom event handling
   */
  protected async onWorkspaceEvent(event: WorkspaceEvent): Promise<void> {
    // Default: no-op
  }
}
```

---

## Part 4: Database Schema Updates

```sql
-- migrations/add_agent_tables.sql

-- Registered agents
CREATE TABLE agents (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  capabilities TEXT[] NOT NULL,
  metadata JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'offline',
  endpoint VARCHAR(500),
  registered_at TIMESTAMP DEFAULT NOW(),
  last_heartbeat TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Workspace access requests/grants
CREATE TABLE workspace_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) REFERENCES agents(id),
  workspace_id VARCHAR(255) NOT NULL,
  workspace_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  requested_permissions TEXT[] NOT NULL,
  granted_permissions TEXT[] DEFAULT '{}',
  mcp_api_key_encrypted TEXT,
  justification TEXT,
  requested_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(agent_id, workspace_id)
);

-- Agent assignments to projects/tasks
CREATE TABLE agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) REFERENCES agents(id),
  workspace_id VARCHAR(255) NOT NULL,
  assignment_type VARCHAR(50) NOT NULL, -- 'project' or 'task'
  assignment_id VARCHAR(255) NOT NULL,  -- Project or task ID
  role VARCHAR(50) DEFAULT 'member',
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by VARCHAR(255),
  unassigned_at TIMESTAMP,

  UNIQUE(agent_id, assignment_type, assignment_id)
);

-- Event subscriptions
CREATE TABLE agent_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) REFERENCES agents(id),
  workspace_id VARCHAR(255) NOT NULL,
  event_types TEXT[] NOT NULL,
  filter JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(agent_id, workspace_id)
);

-- Indexes
CREATE INDEX idx_agents_capabilities ON agents USING GIN(capabilities);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_workspace_access_status ON workspace_access(status);
CREATE INDEX idx_workspace_access_workspace ON workspace_access(workspace_id);
CREATE INDEX idx_agent_assignments_workspace ON agent_assignments(workspace_id);
CREATE INDEX idx_agent_assignments_agent ON agent_assignments(agent_id);
```

---

## Part 5: API Endpoints

### REST API for Raven Docs Integration

```typescript
// packages/control-plane/src/api/agents.controller.ts

@Controller('api/agents')
export class AgentsController {

  // Called by Raven Docs to approve/deny access
  @Post(':agentId/workspaces/:workspaceId/approve')
  async approveAccess(
    @Param('agentId') agentId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() body: {
      grantedPermissions: string[];
      mcpApiKey: string;
      approvedBy: string;
    },
  ) {
    return this.registrationService.approveWorkspaceAccess(
      agentId,
      workspaceId,
      body.grantedPermissions,
      body.mcpApiKey,
      body.approvedBy,
    );
  }

  @Post(':agentId/workspaces/:workspaceId/deny')
  async denyAccess(
    @Param('agentId') agentId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() body: { reason: string; deniedBy: string },
  ) {
    return this.registrationService.denyWorkspaceAccess(
      agentId,
      workspaceId,
      body.reason,
      body.deniedBy,
    );
  }

  @Post(':agentId/workspaces/:workspaceId/revoke')
  async revokeAccess(
    @Param('agentId') agentId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() body: { reason: string; revokedBy: string },
  ) {
    return this.registrationService.revokeWorkspaceAccess(
      agentId,
      workspaceId,
      body.reason,
      body.revokedBy,
    );
  }

  // Get agents available for a workspace
  @Get('available')
  async getAvailableAgents(
    @Query('workspaceId') workspaceId: string,
    @Query('capabilities') capabilities?: string,
  ) {
    const caps = capabilities?.split(',') || [];
    return this.registrationService.getAvailableAgents(workspaceId, caps);
  }

  // Get agents assigned to a workspace
  @Get('workspace/:workspaceId')
  async getWorkspaceAgents(
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.registrationService.getWorkspaceAgents(workspaceId);
  }

  // Assign agent to project/task
  @Post(':agentId/assign')
  async assignAgent(
    @Param('agentId') agentId: string,
    @Body() body: {
      workspaceId: string;
      type: 'project' | 'task';
      targetId: string;
      role?: string;
      assignedBy: string;
    },
  ) {
    return this.registrationService.assignAgent(
      agentId,
      body.workspaceId,
      body.type,
      body.targetId,
      body.role,
      body.assignedBy,
    );
  }

  // Unassign agent
  @Delete(':agentId/assign/:assignmentId')
  async unassignAgent(
    @Param('agentId') agentId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.registrationService.unassignAgent(agentId, assignmentId);
  }
}
```

---

## Implementation Phases

### Phase 1: Agent Registration (Week 1-2)
- [ ] Capabilities and permissions types
- [ ] Agent registration gRPC service
- [ ] Database schema for agents
- [ ] Updated SDK base class
- [ ] Basic REST API for Raven Docs

### Phase 2: Workspace Access (Week 2-3)
- [ ] Workspace access request flow
- [ ] MCP API key management
- [ ] Approval/denial webhooks
- [ ] Permission checking middleware

### Phase 3: MCP Integration (Week 3-4)
- [ ] MCP client implementation
- [ ] MCP actions in pattern engine
- [ ] YAML schema extensions
- [ ] Approval handling

### Phase 4: Event System (Week 4-5)
- [ ] WebSocket connection to Raven Docs
- [ ] Event subscription management
- [ ] Agent notification system
- [ ] Task/project assignment handlers

### Phase 5: Testing & Polish (Week 5-6)
- [ ] Integration tests with Raven Docs
- [ ] Example agents and patterns
- [ ] Documentation
- [ ] Error handling and edge cases
