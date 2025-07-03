import * as ed25519 from '@noble/ed25519';
import type { CompressedLicensePayload, LicensePayload, LicenseResult } from './types';

// Current @rilaykit/workflow version release date - Update this with each release
const RELEASE_DATE = 1751361139160;
const ED25519_PUBLIC_KEY = '8fdb6a454550326d331c3b3d1d1f8c707a371bdb6c7ea72a0a1e4ea6f1822620';

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
      if (!RilayLicenseManager.licenseKey.startsWith('ril_')) {
        return { valid: false, error: 'FORMAT_INVALID' };
      }

      // 2. Decode license
      const encodedLicense = RilayLicenseManager.licenseKey.slice(4);
      const combined = Buffer.from(encodedLicense, 'base64').toString();

      const parts = combined.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'FORMAT_INVALID' };
      }

      const [headerStr, payloadStr, signatureHex] = parts;

      // 3. Verify signature using @noble/ed25519
      const message = `${headerStr}.${payloadStr}`;
      const messageBytes = new TextEncoder().encode(message);
      const hexMatches = signatureHex.match(/.{2}/g);
      if (!hexMatches) {
        return { valid: false, error: 'INVALID' };
      }
      const signature = new Uint8Array(hexMatches.map((byte) => Number.parseInt(byte, 16)));
      const publicKeyBytes = RilayLicenseManager.hexToBytes(ED25519_PUBLIC_KEY);

      const isValid = await ed25519.verify(signature, messageBytes, publicKeyBytes);

      if (!isValid) {
        return { valid: false, error: 'SIGNATURE_INVALID' };
      }

      // 4. Parse and validate payload
      const payloadJson = Buffer.from(
        payloadStr.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      ).toString();
      const compressedPayload = JSON.parse(payloadJson) as CompressedLicensePayload;

      // Check expiry
      const now = Math.floor(Date.now() / 1000);
      if (compressedPayload.e < now) {
        return {
          valid: false,
          error: 'EXPIRED',
          data: RilayLicenseManager.decompressPayload(compressedPayload),
        };
      }

      // Check version compatibility
      if (RELEASE_DATE > compressedPayload.e * 1000) {
        return {
          valid: false,
          error: 'EXPIRED',
          data: RilayLicenseManager.decompressPayload(compressedPayload),
        };
      }

      // Validate payload structure
      if (
        compressedPayload.p === undefined ||
        !compressedPayload.c ||
        !compressedPayload.i ||
        !compressedPayload.e ||
        !compressedPayload.t
      ) {
        return { valid: false, error: 'INVALID' };
      }

      const fullPayload = RilayLicenseManager.decompressPayload(compressedPayload);
      return { valid: true, data: fullPayload };
    } catch {
      return { valid: false, error: 'INVALID' };
    }
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
