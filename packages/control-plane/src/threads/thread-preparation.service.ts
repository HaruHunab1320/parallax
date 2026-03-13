import { Logger } from 'pino';
import {
  SpawnThreadInput,
  ThreadPreparationSpec,
  ThreadWorkspaceRef,
} from '@parallaxai/runtime-interface';
import { MemoryContextService } from './memory-context.service';
import { WorkspaceConfig, WorkspaceService } from '../workspace';

export class ThreadPreparationService {
  private workspaceService?: WorkspaceService;

  constructor(
    private readonly memoryContextService: MemoryContextService,
    private readonly logger: Logger
  ) {}

  setWorkspaceService(workspaceService: WorkspaceService): void {
    this.workspaceService = workspaceService;
  }

  async prepare(input: SpawnThreadInput): Promise<{
    preparation?: ThreadPreparationSpec;
    metadata?: Record<string, unknown>;
  }> {
    const workspace = await this.resolveWorkspace(input);
    const memoryContext = await this.memoryContextService.buildThreadMemory({
      executionId: input.executionId,
      role: input.role,
      objective: input.objective,
      workspace,
    });

    const preparation: ThreadPreparationSpec = {
      workspace,
      env: input.preparation?.env ?? input.env,
      contextFiles:
        memoryContext.preparation?.contextFiles ??
        input.preparation?.contextFiles ??
        input.contextFiles,
      approvalPreset: input.preparation?.approvalPreset ?? input.approvalPreset,
    };

    this.logger.debug(
      {
        executionId: input.executionId,
        role: input.role,
        hasWorkspace: !!preparation.workspace,
        workspaceId: preparation.workspace?.workspaceId,
      },
      'Prepared thread inputs'
    );

    return {
      preparation,
      metadata: {
        ...(input.metadata || {}),
        ...(memoryContext.metadata || {}),
      },
    };
  }

  async prepareSpawnInput(input: SpawnThreadInput): Promise<SpawnThreadInput> {
    const prepared = await this.prepare(input);
    const preparedInput: SpawnThreadInput = {
      ...input,
      preparation: prepared.preparation,
      metadata: prepared.metadata,
    };

    this.logger.debug(
      {
        executionId: preparedInput.executionId,
        role: preparedInput.role,
        hasPreparation: !!preparedInput.preparation,
      },
      'Prepared thread spawn input'
    );

    return preparedInput;
  }

  private async resolveWorkspace(input: SpawnThreadInput): Promise<ThreadWorkspaceRef | undefined> {
    const workspace = input.preparation?.workspace ?? input.workspace;
    if (!workspace) {
      return undefined;
    }

    if (workspace.path || workspace.workspaceId || !workspace.repo || !this.workspaceService) {
      return workspace;
    }

    const workspaceConfig: WorkspaceConfig = {
      repo: workspace.repo,
      provider: 'github',
      branchStrategy: 'feature_branch',
      baseBranch: workspace.branch || 'main',
      execution: {
        id: input.executionId,
        patternName: 'thread-preparation',
      },
      task: {
        id: `thread-${input.executionId.slice(0, 8)}`,
        role: input.role || 'thread',
        slug: this.slugify(input.name || input.role || 'thread'),
      },
    };

    const provisioned = await this.workspaceService.provision(workspaceConfig);
    const resolvedWorkspace: ThreadWorkspaceRef = {
      workspaceId: provisioned.id,
      path: provisioned.path,
      repo: provisioned.repo,
      branch: provisioned.branch.name,
    };

    this.logger.info(
      {
        executionId: input.executionId,
        workspaceId: provisioned.id,
        repo: provisioned.repo,
        branch: provisioned.branch.name,
      },
      'Provisioned workspace during thread preparation'
    );

    return resolvedWorkspace;
  }

  private slugify(value: string): string {
    return (
      value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'thread'
    );
  }
}
