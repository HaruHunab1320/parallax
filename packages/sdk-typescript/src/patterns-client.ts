import {
  ExecutePatternRequest,
  ExecutePatternResponse,
  GetPatternRequest,
  ListPatternsRequest,
  ListPatternsResponse,
  Pattern,
  PatternServiceClient,
  UploadPatternRequest,
  UploadPatternResponse,
} from "../generated/patterns";
import {
  ChannelCredentials,
  ClientOptions,
  ClientReadableStream,
  Metadata,
  ServiceError,
} from "@grpc/grpc-js";

export type PatternStreamHandlers = {
  onMessage?: (response: ExecutePatternResponse) => void;
  onError?: (error: ServiceError | Error) => void;
  onEnd?: () => void;
};

export class PatternClient {
  private client: PatternServiceClient;

  constructor(
    address: string,
    credentials: ChannelCredentials,
    options?: Partial<ClientOptions>
  ) {
    this.client = new PatternServiceClient(address, credentials, options);
  }

  execute(
    patternName: string,
    input?: { [key: string]: any },
    options?: {
      timeoutMs?: number;
      maxParallel?: number;
      cacheResults?: boolean;
      context?: Record<string, string>;
    },
    metadata?: Metadata
  ): Promise<ExecutePatternResponse> {
    const request: ExecutePatternRequest = {
      patternName,
      patternVersion: "",
      input: input || {},
      options: options
        ? {
            timeoutMs: options.timeoutMs ?? 30000,
            maxParallel: options.maxParallel ?? 0,
            cacheResults: options.cacheResults ?? false,
            context: options.context ?? {},
          }
        : undefined,
    };

    return new Promise((resolve, reject) => {
      this.client.executePattern(request, metadata || new Metadata(), (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  streamExecute(
    patternName: string,
    input?: { [key: string]: any },
    options?: {
      timeoutMs?: number;
      maxParallel?: number;
      cacheResults?: boolean;
      context?: Record<string, string>;
    },
    handlers: PatternStreamHandlers = {},
    metadata?: Metadata
  ): ClientReadableStream<ExecutePatternResponse> {
    const request: ExecutePatternRequest = {
      patternName,
      patternVersion: "",
      input: input || {},
      options: options
        ? {
            timeoutMs: options.timeoutMs ?? 30000,
            maxParallel: options.maxParallel ?? 0,
            cacheResults: options.cacheResults ?? false,
            context: options.context ?? {},
          }
        : undefined,
    };

    const stream = this.client.streamExecutePattern(request, metadata || new Metadata());
    stream.on("data", (message) => handlers.onMessage?.(message));
    stream.on("error", (error) => handlers.onError?.(error));
    stream.on("end", () => handlers.onEnd?.());
    return stream;
  }

  list(tags: string[] = [], includeScripts = false, metadata?: Metadata): Promise<ListPatternsResponse> {
    const request: ListPatternsRequest = { tags, includeScripts };
    return new Promise((resolve, reject) => {
      this.client.listPatterns(request, metadata || new Metadata(), (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  get(name: string, version = "", metadata?: Metadata): Promise<Pattern> {
    const request: GetPatternRequest = { name, version };
    return new Promise((resolve, reject) => {
      this.client.getPattern(request, metadata || new Metadata(), (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  upload(pattern: Pattern, overwrite = false, metadata?: Metadata): Promise<UploadPatternResponse> {
    const request: UploadPatternRequest = { pattern, overwrite };
    return new Promise((resolve, reject) => {
      this.client.uploadPattern(request, metadata || new Metadata(), (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }
}
