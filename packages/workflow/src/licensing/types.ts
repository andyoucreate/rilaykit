export interface LicensePayload {
  plan: 'ARCHITECT' | 'FOUNDRY';
  company: string;
  customerId: string;
  expiry: number; // Timestamp
  iat: number; // Issued at timestamp
}

export interface LicenseResult {
  valid: boolean;
  data?: LicensePayload;
  error?: 'EXPIRED' | 'INVALID' | 'MISSING';
}
