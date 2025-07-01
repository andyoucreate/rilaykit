import * as ed25519 from '@noble/ed25519';
import type { CompressedLicensePayload, LicensePayload, LicenseResult } from './types';

// Current @rilay/workflow version release date - Update this with each release
const RELEASE_DATE = 1751361139160;
const ED25519_PUBLIC_KEY = 'your-ed25519-public-key-here';

/**
 * Enhanced Rilay License Manager with Ed25519 cryptographic validation
 * Uses @noble/ed25519 for secure and fast signature verification
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Singleton license manager
export class RilayLicenseManager {
  private static licenseKey = '';
  private static licenseResult: LicenseResult | null = null;
  private static isInitialized = false;

  /**
   * Initialize with a license key and Ed25519 public key
   */
  static async setLicenseKey(licenseKey?: string): Promise<void> {
    RilayLicenseManager.licenseKey = licenseKey || '';

    if (RilayLicenseManager.licenseKey) {
      RilayLicenseManager.licenseResult = await RilayLicenseManager.validateLicense();
    } else {
      RilayLicenseManager.licenseResult = { valid: false, error: 'MISSING' };
    }

    RilayLicenseManager.isInitialized = true;
  }

  /**
   * Validate license using Ed25519 signature verification
   */
  private static async validateLicense(): Promise<LicenseResult> {
    if (!RilayLicenseManager.licenseKey) {
      return { valid: false, error: 'MISSING' };
    }

    try {
      // 1. Format validation
      if (!RilayLicenseManager.validateFormat(RilayLicenseManager.licenseKey)) {
        return { valid: false, error: 'FORMAT_INVALID' };
      }

      // 2. Extract components
      const decoded = RilayLicenseManager.base64UrlDecode(RilayLicenseManager.licenseKey.slice(4));
      const parts = decoded.split('.');

      if (parts.length !== 3) {
        return { valid: false, error: 'FORMAT_INVALID' };
      }

      const [headerStr, payloadStr, signature] = parts;

      // 3. Verify signature using @noble/ed25519
      const message = `${headerStr}.${payloadStr}`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = RilayLicenseManager.hexToBytes(signature);
      const publicKeyBytes = RilayLicenseManager.hexToBytes(ED25519_PUBLIC_KEY);

      const isValid = await ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);

      if (!isValid) {
        return { valid: false, error: 'SIGNATURE_INVALID' };
      }

      // 4. Validate payload
      const compressedPayload = JSON.parse(
        RilayLicenseManager.base64UrlDecode(payloadStr)
      ) as CompressedLicensePayload;
      const validationResult = RilayLicenseManager.validatePayload(compressedPayload);

      if (!validationResult.valid) {
        return validationResult;
      }

      const fullPayload = RilayLicenseManager.decompressPayload(compressedPayload);
      return { valid: true, data: fullPayload };
    } catch (_error) {
      return { valid: false, error: 'INVALID' };
    }
  }

  /**
   * Validate license key format
   */
  private static validateFormat(licenseKey: string): boolean {
    return (
      licenseKey.startsWith('ril_') &&
      licenseKey.length > 20 &&
      /^ril_[A-Za-z0-9_-]+$/.test(licenseKey)
    );
  }

  /**
   * Extract payload from license key
   */
  static extractPayload(licenseKey: string): CompressedLicensePayload | null {
    try {
      if (!RilayLicenseManager.validateFormat(licenseKey)) return null;

      const decoded = RilayLicenseManager.base64UrlDecode(licenseKey.slice(4));
      const parts = decoded.split('.');

      if (parts.length !== 3) return null;

      return JSON.parse(RilayLicenseManager.base64UrlDecode(parts[1])) as CompressedLicensePayload;
    } catch {
      return null;
    }
  }

  /**
   * Validate payload content and expiration
   */
  private static validatePayload(payload: CompressedLicensePayload): LicenseResult {
    const now = Math.floor(Date.now() / 1000);

    if (payload.e <= now) {
      return {
        valid: false,
        error: 'EXPIRED',
        data: RilayLicenseManager.decompressPayload(payload),
      };
    }

    if (RELEASE_DATE > payload.e * 1000) {
      return {
        valid: false,
        error: 'EXPIRED',
        data: RilayLicenseManager.decompressPayload(payload),
      };
    }

    if (!payload.p || !payload.c || !payload.i || !payload.e || !payload.t) {
      return { valid: false, error: 'INVALID' };
    }

    return { valid: true };
  }

  /**
   * Convert compressed payload to full payload
   */
  private static decompressPayload(compressed: CompressedLicensePayload): LicensePayload {
    // Map all plan numbers to valid LicensePayload plan types
    const planMap: Record<number, 'ARCHITECT' | 'FOUNDRY'> = {
      0: 'ARCHITECT',
      1: 'FOUNDRY',
    };

    return {
      plan: planMap[compressed.p] || 'ARCHITECT',
      company: compressed.c,
      customerId: compressed.i.toString(),
      expiry: compressed.e * 1000,
      iat: compressed.t * 1000,
    };
  }

  /**
   * Convert hex string to Uint8Array
   */
  private static hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = Number.parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }

  /**
   * Decode base64url string
   */
  private static base64UrlDecode(str: string): string {
    const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
    return atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  }

  /**
   * Get license validation result
   */
  static getLicenseResult(): LicenseResult {
    if (!RilayLicenseManager.isInitialized) {
      return { valid: false, error: 'MISSING' };
    }

    if (!RilayLicenseManager.licenseResult) {
      return { valid: false, error: 'MISSING' };
    }

    return RilayLicenseManager.licenseResult;
  }

  /**
   * Check if watermark should be displayed
   */
  static shouldDisplayWatermark(): boolean {
    // Always return false during SSR
    if (typeof window === 'undefined') {
      return false;
    }

    const result = RilayLicenseManager.getLicenseResult();

    return !result.valid;
  }

  /**
   * Get watermark message
   */
  static getWatermarkMessage(): string {
    const result = RilayLicenseManager.getLicenseResult();

    const messages = {
      MISSING: 'Rilay Workflow - For Trial Use Only',
      EXPIRED: 'Rilay Workflow - License Expired',
      INVALID: 'Rilay Workflow - Invalid License',
      FORMAT_INVALID: 'Rilay Workflow - Invalid License Format',
      SIGNATURE_INVALID: 'Rilay Workflow - Invalid License Signature',
    };

    return messages[result.error || 'MISSING'] || '';
  }

  /**
   * Display license status in console
   */
  static logLicenseStatus(): void {
    const result = RilayLicenseManager.getLicenseResult();

    if (result.valid) {
      return;
    }

    const messages = {
      MISSING: '🔧 Rilay Workflow - Trial Mode. Purchase a license at https://rilay.io/pricing',
      EXPIRED: '⚠️ Rilay Workflow - License Expired. Please renew your license.',
      INVALID: '❌ Rilay Workflow - Invalid License. Please check your license key.',
      FORMAT_INVALID: '❌ Rilay Workflow - Invalid License Format. Please check your license key.',
      SIGNATURE_INVALID:
        '❌ Rilay Workflow - Invalid License Signature. Please check your license key.',
    };

    const message = messages[result.error || 'MISSING'];
    console.warn(`%c${message}`, 'color: #f59e0b; font-weight: bold;');
  }

  /**
   * Get license info
   */
  static async getLicenseInfo(): Promise<{ plan?: string; company?: string; expiryDate?: string }> {
    const result = RilayLicenseManager.getLicenseResult();

    if (!result.valid || !result.data) {
      return {};
    }

    return {
      plan: result.data.plan,
      company: result.data.company,
      expiryDate: new Date(result.data.expiry).toLocaleDateString(),
    };
  }
}
