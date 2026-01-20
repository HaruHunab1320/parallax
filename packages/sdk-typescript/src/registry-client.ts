import {
  AgentRegistration,
  GetAgentRequest,
  ListAgentsRequest,
  ListAgentsResponse,
  RegisterRequest,
  RegisterResponse,
  RegistryClient,
  RenewRequest,
  WatchEvent,
  WatchRequest,
} from "../generated/registry";
import {
  ChannelCredentials,
  ClientOptions,
  ClientReadableStream,
  Metadata,
  ServiceError,
} from "@grpc/grpc-js";

export type RegistryWatchHandlers = {
  onEvent?: (event: WatchEvent) => void;
  onError?: (error: ServiceError | Error) => void;
  onEnd?: () => void;
};

export class RegistryServiceClient {
  private client: RegistryClient;

  constructor(
    address: string,
    credentials: ChannelCredentials,
    options?: Partial<ClientOptions>
  ) {
    this.client = new RegistryClient(address, credentials, options);
  }

  register(agent: AgentRegistration, autoRenew = true, metadata?: Metadata): Promise<RegisterResponse> {
    const request: RegisterRequest = { agent, autoRenew };
    return new Promise((resolve, reject) => {
      this.client.register(
        request,
        metadata || new Metadata(),
        (error: ServiceError | null, response: RegisterResponse) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  unregister(agent: AgentRegistration, metadata?: Metadata): Promise<RegisterResponse> {
    return new Promise((resolve, reject) => {
      this.client.unregister(
        agent,
        metadata || new Metadata(),
        (error: ServiceError | null, response: RegisterResponse) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  renew(leaseId: string, ttlSeconds = 60, metadata?: Metadata): Promise<RegisterResponse> {
    const request: RenewRequest = {
      leaseId,
      ttl: { seconds: ttlSeconds, nanos: 0 },
    };
    return new Promise((resolve, reject) => {
      this.client.renew(
        request,
        metadata || new Metadata(),
        (error: ServiceError | null, response: RegisterResponse) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  list(
    capabilities: string[] = [],
    labels: Record<string, string> = {},
    limit = 100,
    continuationToken = "",
    metadata?: Metadata
  ): Promise<ListAgentsResponse> {
    const request: ListAgentsRequest = {
      capabilities,
      labels,
      limit,
      continuationToken,
    };
    return new Promise((resolve, reject) => {
      this.client.listAgents(
        request,
        metadata || new Metadata(),
        (error: ServiceError | null, response: ListAgentsResponse) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  get(agentId: string, metadata?: Metadata): Promise<AgentRegistration> {
    const request: GetAgentRequest = { agentId };
    return new Promise((resolve, reject) => {
      this.client.getAgent(
        request,
        metadata || new Metadata(),
        (error: ServiceError | null, response: AgentRegistration) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  watch(
    capabilities: string[] = [],
    includeInitial = true,
    handlers: RegistryWatchHandlers = {},
    metadata?: Metadata
  ): ClientReadableStream<WatchEvent> {
    const request: WatchRequest = { capabilities, includeInitial };
    const stream = this.client.watch(request, metadata || new Metadata());
    stream.on("data", (event: WatchEvent) => handlers.onEvent?.(event));
    stream.on("error", (error: ServiceError) => handlers.onError?.(error));
    stream.on("end", () => handlers.onEnd?.());
    return stream;
  }
}
