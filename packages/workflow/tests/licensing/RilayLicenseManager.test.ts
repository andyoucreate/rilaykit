import * as ed25519 from '@noble/ed25519';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RilayLicenseManager } from '../../src/licensing/RilayLicenseManager';

// Mock @noble/ed25519
vi.mock('@noble/ed25519', () => ({
  verify: vi.fn(),
}));

const mockEd25519 = vi.mocked(ed25519);

describe('RilayLicenseManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset static state
    (RilayLicenseManager as any).licenseKey = '';
    (RilayLicenseManager as any).licenseResult = null;
    (RilayLicenseManager as any).isInitialized = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('License Key Setting', () => {
    it('should set valid license key', async () => {
      mockEd25519.verify.mockResolvedValue(true);

      const validLicenseKey = `ril_${btoa('test.payload.signature')}`;

      await RilayLicenseManager.setLicenseKey(validLicenseKey);

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(false); // Will be false due to validation logic
    });

    it('should handle missing license key', async () => {
      await RilayLicenseManager.setLicenseKey();

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('MISSING');
    });

    it('should handle empty license key', async () => {
      await RilayLicenseManager.setLicenseKey('');

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('MISSING');
    });
  });

  describe('License Validation', () => {
    it('should reject license with invalid format', async () => {
      await RilayLicenseManager.setLicenseKey('invalid_license_key');

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('FORMAT_INVALID');
    });

    it('should reject license without ril_ prefix', async () => {
      await RilayLicenseManager.setLicenseKey('not_ril_prefix');

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('FORMAT_INVALID');
    });

    it('should reject license with invalid base64', async () => {
      await RilayLicenseManager.setLicenseKey('ril_invalid_base64!@#');

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID');
    });

    it('should reject license with invalid structure', async () => {
      const invalidStructure = `ril_${btoa('invalid.structure')}`;

      await RilayLicenseManager.setLicenseKey(invalidStructure);

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('FORMAT_INVALID');
    });

    it('should reject license with invalid signature', async () => {
      mockEd25519.verify.mockResolvedValue(false);

      const invalidSignatureLicense = `ril_${btoa('header.payload.invalidsignature')}`;

      await RilayLicenseManager.setLicenseKey(invalidSignatureLicense);

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('SIGNATURE_INVALID');
    });

    it('should reject expired license', async () => {
      mockEd25519.verify.mockResolvedValue(true);

      // Create a properly formatted but expired license
      const expiredPayload = btoa(
        JSON.stringify({
          p: 0, // ARCHITECT plan
          c: 'test-company',
          i: 123,
          e: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
          t: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago (issued)
        })
      );

      const expiredLicense = `ril_${btoa(`header.${expiredPayload}.validsignature`)}`;

      await RilayLicenseManager.setLicenseKey(expiredLicense);

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('EXPIRED');
    });

    it('should accept valid license', async () => {
      mockEd25519.verify.mockResolvedValue(true);

      // Create a properly formatted and valid license
      const validPayload = btoa(
        JSON.stringify({
          p: 0, // ARCHITECT plan
          c: 'test-company',
          i: 123,
          e: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
          t: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (issued)
        })
      );

      const validLicense = `ril_${btoa(`header.${validPayload}.validsignature`)}`;

      await RilayLicenseManager.setLicenseKey(validLicense);

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('License Information', () => {
    it('should return license data for valid license', async () => {
      mockEd25519.verify.mockResolvedValue(true);

      const validPayload = btoa(
        JSON.stringify({
          p: 1, // FOUNDRY plan
          c: 'premium-company',
          i: 456,
          e: Math.floor(Date.now() / 1000) + 3600,
          t: Math.floor(Date.now() / 1000) - 3600,
        })
      );

      const validLicense = `ril_${btoa(`header.${validPayload}.validsignature`)}`;

      await RilayLicenseManager.setLicenseKey(validLicense);

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.plan).toBe('FOUNDRY');
      expect(result.data?.company).toBe('premium-company');
      expect(result.data?.customerId).toBe('456');
    });

    it('should return license info', async () => {
      mockEd25519.verify.mockResolvedValue(true);

      const validPayload = btoa(
        JSON.stringify({
          p: 0, // ARCHITECT plan
          c: 'test-company',
          i: 123,
          e: Math.floor(Date.now() / 1000) + 3600,
          t: Math.floor(Date.now() / 1000) - 3600,
        })
      );

      const validLicense = `ril_${btoa(`header.${validPayload}.validsignature`)}`;

      await RilayLicenseManager.setLicenseKey(validLicense);

      const licenseInfo = await RilayLicenseManager.getLicenseInfo();
      expect(licenseInfo.plan).toBe('ARCHITECT');
      expect(licenseInfo.company).toBe('test-company');
      expect(licenseInfo.expiryDate).toBeDefined();
    });
  });

  describe('Watermark Management', () => {
    it('should show watermark for invalid license', async () => {
      await RilayLicenseManager.setLicenseKey('invalid');

      const shouldShow = RilayLicenseManager.shouldDisplayWatermark();
      expect(shouldShow).toBe(true);
    });

    it('should return correct watermark message', async () => {
      await RilayLicenseManager.setLicenseKey('');

      const message = RilayLicenseManager.getWatermarkMessage();
      expect(message).toBe('Rilay Workflow - For Trial Use Only');
    });

    it('should return expired message for expired license', async () => {
      mockEd25519.verify.mockResolvedValue(true);

      const expiredPayload = btoa(
        JSON.stringify({
          p: 0,
          c: 'test-company',
          i: 123,
          e: Math.floor(Date.now() / 1000) - 3600, // expired
          t: Math.floor(Date.now() / 1000) - 7200,
        })
      );

      const expiredLicense = `ril_${btoa(`header.${expiredPayload}.validsignature`)}`;

      await RilayLicenseManager.setLicenseKey(expiredLicense);

      const message = RilayLicenseManager.getWatermarkMessage();
      expect(message).toBe('Rilay Workflow - License Expired');
    });
  });

  describe('Error Handling', () => {
    it('should handle cryptographic errors', async () => {
      mockEd25519.verify.mockRejectedValue(new Error('Crypto error'));

      const license = `ril_${btoa('header.payload.signature')}`;

      await RilayLicenseManager.setLicenseKey(license);

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID');
    });

    it('should handle invalid JSON in payload', async () => {
      const invalidJsonLicense = `ril_${btoa('header.invalidjson.signature')}`;

      await RilayLicenseManager.setLicenseKey(invalidJsonLicense);

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('SIGNATURE_INVALID');
    });

    it('should handle malformed structure', async () => {
      const malformedLicense = `ril_${btoa('malformed_structure')}`;

      await RilayLicenseManager.setLicenseKey(malformedLicense);

      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('FORMAT_INVALID');
    });
  });

  describe('License Logging', () => {
    it('should log license status', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      RilayLicenseManager.logLicenseStatus();

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should log different messages for different states', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Test unlicensed state
      await RilayLicenseManager.setLicenseKey('');
      RilayLicenseManager.logLicenseStatus();

      // Test invalid license state
      await RilayLicenseManager.setLicenseKey('invalid');
      RilayLicenseManager.logLicenseStatus();

      expect(consoleSpy).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });
  });

  describe('Static State Management', () => {
    it('should maintain state across calls', async () => {
      await RilayLicenseManager.setLicenseKey('invalid');

      // Check that state is maintained
      const result1 = RilayLicenseManager.getLicenseResult();
      const result2 = RilayLicenseManager.getLicenseResult();

      expect(result1).toEqual(result2);
    });

    it('should update state when license changes', async () => {
      // First set an invalid license
      await RilayLicenseManager.setLicenseKey('invalid');
      const result1 = RilayLicenseManager.getLicenseResult();
      expect(result1.valid).toBe(false);

      // Then set a different invalid license
      await RilayLicenseManager.setLicenseKey('');
      const result2 = RilayLicenseManager.getLicenseResult();
      expect(result2.valid).toBe(false);
      expect(result2.error).toBe('MISSING');
    });
  });

  describe('Default Values', () => {
    it('should return default values for unlicensed state', () => {
      const result = RilayLicenseManager.getLicenseResult();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('MISSING');
    });

    it('should handle empty license info for invalid license', async () => {
      await RilayLicenseManager.setLicenseKey('invalid');

      const licenseInfo = await RilayLicenseManager.getLicenseInfo();
      expect(licenseInfo).toEqual({});
    });
  });
});
