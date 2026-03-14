export interface LicenseInfo {
  type: string;
  features: string[];
  valid?: boolean;
  expiresAt?: string;
  [key: string]: unknown;
}

export interface LicenseFeaturesResponse {
  type: string;
  features: string[];
  isEnterprise: boolean;
  isEnterprisePlus: boolean;
}

export interface LicenseCheckResponse {
  feature: string;
  available: boolean;
  licenseType: string;
  upgradeUrl: string | null;
}
