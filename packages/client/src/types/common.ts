export interface ListParams {
  limit?: number;
  offset?: number;
}

export interface ListResponse<T> {
  count: number;
  [key: string]: T[] | number;
}

export interface TimestampedResponse {
  timestamp: string;
}
