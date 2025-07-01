import type { LicensePayload, LicenseResult } from './types';

// Current @rilay/workflow version release date - Update this with each release
const RELEASE_DATE = 1751361139160;

// biome-ignore lint/complexity/noStaticOnlyClass: Singleton license manager
export class RilayLicenseManager {
  private static licenseKey = '';
  private static licenseResult: LicenseResult | null = null;
  private static isInitialized = false;

  /**
   * Initialize with a license key
   */
  static setLicenseKey(licenseKey?: string): void {
    RilayLicenseManager.licenseKey = licenseKey || '';
    RilayLicenseManager.licenseResult = RilayLicenseManager.validateLicense();
    RilayLicenseManager.isInitialized = true;
  }

  /**
   * Simple JWT validation
   */
  private static validateLicense(): LicenseResult {
    if (!RilayLicenseManager.licenseKey) {
      return { valid: false, error: 'MISSING' };
    }

    try {
      // Basic JWT format check
      const parts = RilayLicenseManager.licenseKey.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'INVALID' };
      }

      // Decode payload
      const payload = RilayLicenseManager.decodeJWTPart(parts[1]) as LicensePayload;
      if (!payload) {
        return { valid: false, error: 'INVALID' };
      }

      // Basic payload validation
      if (!payload.plan || !payload.company || !payload.expiry || !payload.iat) {
        return { valid: false, error: 'INVALID' };
      }

      // Basic signature validation (simplified for synchronous operation)
      if (!RilayLicenseManager.validateSignatureFormat(parts[2])) {
        return { valid: false, error: 'INVALID' };
      }

      // Check expiration
      if (Date.now() > payload.expiry) {
        return { valid: false, error: 'EXPIRED', data: payload };
      }

      // Check version compatibility
      if (RELEASE_DATE > payload.expiry) {
        return { valid: false, error: 'EXPIRED', data: payload };
      }

      return { valid: true, data: payload };
    } catch {
      return { valid: false, error: 'INVALID' };
    }
  }

  /**
   * Decode JWT part (base64url)
   */
  private static decodeJWTPart(part: string): any {
    try {
      const paddedPart = part + '='.repeat((4 - (part.length % 4)) % 4);
      const decoded = atob(paddedPart.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  /**
   * Simple signature format validation
   */
  private static validateSignatureFormat(signature: string): boolean {
    // Basic signature checks
    return signature.length > 40 && /^[A-Za-z0-9_-]+$/.test(signature);
  }

  /**
   * Get license validation result
   */
  static getLicenseResult(): LicenseResult {
    if (!RilayLicenseManager.isInitialized) {
      return { valid: false, error: 'MISSING' };
    }
    return RilayLicenseManager.licenseResult || { valid: false, error: 'MISSING' };
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

    switch (result.error) {
      case 'MISSING':
        return 'Rilay Workflow - For Trial Use Only';
      case 'EXPIRED':
        return 'Rilay Workflow - License Expired';
      case 'INVALID':
        return 'Rilay Workflow - Invalid License';
      default:
        return '';
    }
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
    };

    const message = messages[result.error || 'MISSING'];
    console.warn(`%c${message}`, 'color: #f59e0b; font-weight: bold;');
  }

  /**
   * Get license info
   */
  static getLicenseInfo(): { plan?: string; company?: string; expiryDate?: string } {
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
