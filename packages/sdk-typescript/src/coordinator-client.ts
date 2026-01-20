import {
  CoordinateRequest,
  CoordinateResponse,
  CoordinatorClient,
  GetHistoryRequest,
  GetHistoryResponse,
} from "../generated/coordinator";
import {
  ChannelCredentials,
  ClientOptions,
  ClientReadableStream,
  Metadata,
  ServiceError,
} from "@grpc/grpc-js";

export type CoordinatorStreamHandlers = {
  onMessage?: (response: CoordinateResponse) => void;
  onError?: (error: ServiceError | Error) => void;
  onEnd?: () => void;
};

export class CoordinatorServiceClient {
  private client: CoordinatorClient;

  constructor(
    address: string,
    credentials: ChannelCredentials,
    options?: Partial<ClientOptions>
  ) {
    this.client = new CoordinatorClient(address, credentials, options);
  }

  coordinate(request: CoordinateRequest, metadata?: Metadata): Promise<CoordinateResponse> {
    return new Promise((resolve, reject) => {
      this.client.coordinate(
        request,
        metadata || new Metadata(),
        (error: ServiceError | null, response: CoordinateResponse) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  streamCoordinate(
    request: CoordinateRequest,
    handlers: CoordinatorStreamHandlers = {},
    metadata?: Metadata
  ): ClientReadableStream<CoordinateResponse> {
    const stream = this.client.streamCoordinate(request, metadata || new Metadata());
    stream.on("data", (message: CoordinateResponse) => handlers.onMessage?.(message));
    stream.on("error", (error: ServiceError) => handlers.onError?.(error));
    stream.on("end", () => handlers.onEnd?.());
    return stream;
  }

  getHistory(
    taskId = "",
    limit = 50,
    sinceTimestamp = 0,
    metadata?: Metadata
  ): Promise<GetHistoryResponse> {
    const request: GetHistoryRequest = { taskId, limit, sinceTimestamp };
    return new Promise((resolve, reject) => {
      this.client.getHistory(
        request,
        metadata || new Metadata(),
        (error: ServiceError | null, response: GetHistoryResponse) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }
}
