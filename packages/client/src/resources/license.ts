import { HttpClient } from '../http.js';
import {
  LicenseInfo,
  LicenseFeaturesResponse,
  LicenseCheckResponse,
} from '../types/license.js';

export class LicenseResource {
  constructor(private http: HttpClient) {}

  /** Get current license information */
  async info(): Promise<LicenseInfo> {
    return this.http.get<LicenseInfo>('/api/license');
  }

  /** Get available features for current license */
  async features(): Promise<LicenseFeaturesResponse> {
    return this.http.get<LicenseFeaturesResponse>('/api/license/features');
  }

  /** Check if a specific feature is available */
  async check(feature: string): Promise<LicenseCheckResponse> {
    return this.http.get<LicenseCheckResponse>(
      `/api/license/check/${encodeURIComponent(feature)}`
    );
  }
}
