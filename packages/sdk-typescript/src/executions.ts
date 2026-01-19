import {
  Execution,
  ExecutionServiceClient,
  StreamExecutionRequest,
  StreamExecutionResponse,
  GetExecutionRequest,
  ListExecutionsRequest,
  ListExecutionsResponse,
} from "../generated/executions";
import {
  ChannelCredentials,
  ClientOptions,
  ClientReadableStream,
  Metadata,
  ServiceError,
} from "@grpc/grpc-js";

export type ExecutionStreamEvent = {
  type: string;
  execution?: Execution;
  eventTime?: Date;
  eventData?: Record<string, any>;
};

export type ExecutionStreamHandlers = {
  onEvent?: (event: ExecutionStreamEvent) => void;
  onError?: (error: ServiceError) => void;
  onEnd?: () => void;
};

export class ExecutionClient {
  private client: ExecutionServiceClient;

  constructor(
    address: string,
    credentials: ChannelCredentials,
    options?: Partial<ClientOptions>
  ) {
    this.client = new ExecutionServiceClient(address, credentials, options);
  }

  get(executionId: string, metadata?: Metadata): Promise<Execution | undefined> {
    return new Promise((resolve, reject) => {
      const request: GetExecutionRequest = { executionId };
      this.client.getExecution(request, metadata || new Metadata(), (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response.execution);
      });
    });
  }

  list(limit = 100, offset = 0, status = "", metadata?: Metadata): Promise<ListExecutionsResponse> {
    return new Promise((resolve, reject) => {
      const request: ListExecutionsRequest = { limit, offset, status };
      this.client.listExecutions(request, metadata || new Metadata(), (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  streamEvents(
    executionId: string,
    handlers: ExecutionStreamHandlers = {},
    metadata?: Metadata
  ): ClientReadableStream<StreamExecutionResponse> {
    const request: StreamExecutionRequest = { executionId };
    const stream = this.client.streamExecution(request, metadata || new Metadata());

    stream.on("data", (message: StreamExecutionResponse) => {
      handlers.onEvent?.(toExecutionStreamEvent(message));
    });
    stream.on("error", (error: ServiceError) => handlers.onError?.(error));
    stream.on("end", () => handlers.onEnd?.());

    return stream;
  }
}

export function toExecutionStreamEvent(message: StreamExecutionResponse): ExecutionStreamEvent {
  return {
    type: message.eventType,
    execution: message.execution,
    eventTime: message.eventTime,
    eventData: message.eventData || undefined,
  };
}
