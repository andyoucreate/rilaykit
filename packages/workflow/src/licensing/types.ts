export interface LicensePayload {
  plan: 'ARCHITECT' | 'FOUNDRY';
  company: string;
  customerId: string;
  expiry: number; // Timestamp
  iat: number; // Issued at timestamp
}

// Compressed payload format for optimal license key size
export interface CompressedLicensePayload {
  p: number; // plan (0=architect, 1=foundry)
  c: string; // company (truncated to 8 chars)
  i: number; // customerId (numeric)
  e: number; // expiry (Unix timestamp)
  t: number; // issuedAt (Unix timestamp)
}

export interface LicenseResult {
  valid: boolean;
  data?: LicensePayload;
  error?: 'EXPIRED' | 'INVALID' | 'MISSING' | 'FORMAT_INVALID' | 'SIGNATURE_INVALID';
}

export interface LicenseHeader {
  alg: 'Ed25519';
  typ: 'rilay-license';
  ver: '1.0';
}

export type LicensePlan = 'ARCHITECT' | 'FOUNDRY';
