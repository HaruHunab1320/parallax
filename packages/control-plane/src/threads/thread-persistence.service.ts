import type { ThreadEvent, ThreadHandle } from '@parallaxai/runtime-interface';
import type { Logger } from 'pino';
import type { AgentRuntimeService } from '../agent-runtime';
import type { ThreadRepository } from '../db/repositories';

export interface RuntimeThreadProjection {
  runtime: string;
  thread: ThreadHandle;
  event: ThreadEvent;
}

export class ThreadPersistenceService {
  constructor(
    private readonly repository: ThreadRepository,
    private readonly logger: Logger
  ) {}

  async syncThread(thread: ThreadHandle, runtimeName?: string): Promise<void> {
    await this.repository.upsert(thread, runtimeName);
  }

  async projectRuntimeEvent(payload: RuntimeThreadProjection): Promise<void> {
    await this.repository.recordRuntimeProjection(
      payload.thread,
      payload.event,
      payload.runtime
    );
  }

  async recoverFromRuntimes(
    agentRuntimeService: AgentRuntimeService
  ): Promise<number> {
    const threads = await agentRuntimeService.listThreads();

    for (const thread of threads) {
      await this.repository.upsert(thread, thread.runtime);
    }

    this.logger.info(
      { recoveredThreads: threads.length },
      'Recovered runtime-backed threads into persistence'
    );
    return threads.length;
  }
}
