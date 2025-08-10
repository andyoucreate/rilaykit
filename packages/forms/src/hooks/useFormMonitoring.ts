import type {
  FormConfiguration,
  FormPerformanceMetrics,
  MonitoringConfig,
  PerformanceProfiler,
} from '@rilaykit/core';
import { getGlobalMonitor } from '@rilaykit/core';
import { useCallback, useEffect, useRef } from 'react';

export interface UseFormMonitoringProps {
  formConfig: FormConfiguration;
  monitoring?: MonitoringConfig;
  enabled?: boolean;
}

export interface UseFormMonitoringReturn {
  trackFormRender: (renderCount?: number) => void;
  trackFormValidation: (validationErrors: number, fieldCount?: number) => void;
  trackFormSubmission: (success: boolean, fieldCount?: number) => void;
  trackFieldChange: (fieldId: string, componentType: string) => void;
  startPerformanceTracking: (label: string) => void;
  endPerformanceTracking: (label: string) => FormPerformanceMetrics | null;
}

export function useFormMonitoring({
  formConfig,
  enabled = true,
}: UseFormMonitoringProps): UseFormMonitoringReturn {
  const monitor = getGlobalMonitor();
  const profiler = useRef<PerformanceProfiler | null>(null);
  const renderCountRef = useRef(0);
  const fieldChangeCountRef = useRef(0);

  // Initialize profiler
  useEffect(() => {
    if (monitor && enabled) {
      profiler.current = monitor.getProfiler();
    }
  }, [monitor, enabled]);

  // Track form render
  const trackFormRender = useCallback(
    (renderCount?: number) => {
      if (!monitor || !enabled) return;

      renderCountRef.current++;

      const metrics: FormPerformanceMetrics = {
        formId: formConfig.id,
        fieldCount: formConfig.allFields.length,
        timestamp: Date.now(),
        duration: 0, // Will be set by profiler if used
        renderDuration: 0,
        validationDuration: 0,
        validationErrors: 0,
        renderCount: renderCount || renderCountRef.current,
      };

      monitor.track(
        'component_render',
        `form_${formConfig.id}`,
        {
          formId: formConfig.id,
          fieldCount: formConfig.allFields.length,
          renderCount: renderCountRef.current,
        },
        metrics,
        'low'
      );
    },
    [monitor, enabled, formConfig.id, formConfig.allFields.length]
  );

  // Track form validation
  const trackFormValidation = useCallback(
    (validationErrors: number, fieldCount?: number) => {
      if (!monitor || !enabled) return;

      const validationMetrics = profiler.current?.getMetrics(`form_validation_${formConfig.id}`);

      const metrics: FormPerformanceMetrics = {
        formId: formConfig.id,
        fieldCount: fieldCount || formConfig.allFields.length,
        timestamp: Date.now(),
        duration: validationMetrics?.duration || 0,
        renderDuration: 0,
        validationDuration: validationMetrics?.duration || 0,
        validationErrors,
        renderCount: renderCountRef.current,
      };

      monitor.track(
        'form_validation',
        `form_${formConfig.id}`,
        {
          formId: formConfig.id,
          validationErrors,
          fieldCount: fieldCount || formConfig.allFields.length,
        },
        metrics,
        validationErrors > 0 ? 'medium' : 'low'
      );
    },
    [monitor, enabled, formConfig.id, formConfig.allFields.length]
  );

  // Track form submission
  const trackFormSubmission = useCallback(
    (success: boolean, fieldCount?: number) => {
      if (!monitor || !enabled) return;

      const submissionMetrics = profiler.current?.getMetrics(`form_submission_${formConfig.id}`);

      const metrics: FormPerformanceMetrics = {
        formId: formConfig.id,
        fieldCount: fieldCount || formConfig.allFields.length,
        timestamp: Date.now(),
        duration: submissionMetrics?.duration || 0,
        renderDuration: 0,
        validationDuration: 0,
        validationErrors: success ? 0 : 1,
        renderCount: renderCountRef.current,
      };

      monitor.track(
        'form_submission',
        `form_${formConfig.id}`,
        {
          formId: formConfig.id,
          success,
          fieldCount: fieldCount || formConfig.allFields.length,
          fieldChanges: fieldChangeCountRef.current,
        },
        metrics,
        success ? 'low' : 'high'
      );
    },
    [monitor, enabled, formConfig.id, formConfig.allFields.length]
  );

  // Track field change
  const trackFieldChange = useCallback(
    (fieldId: string, componentType: string) => {
      if (!monitor || !enabled) return;

      fieldChangeCountRef.current++;

      monitor.track(
        'component_update',
        `field_${fieldId}`,
        {
          formId: formConfig.id,
          fieldId,
          componentType,
          changeCount: fieldChangeCountRef.current,
        },
        undefined,
        'low'
      );
    },
    [monitor, enabled, formConfig.id]
  );

  // Start performance tracking
  const startPerformanceTracking = useCallback(
    (label: string) => {
      if (!profiler.current || !enabled) return;

      profiler.current.start(label, {
        formId: formConfig.id,
        renderCount: renderCountRef.current,
      });
    },
    [enabled, formConfig.id]
  );

  // End performance tracking
  const endPerformanceTracking = useCallback(
    (label: string): FormPerformanceMetrics | null => {
      if (!profiler.current || !enabled) return null;

      const baseMetrics = profiler.current.end(label);
      if (!baseMetrics) return null;

      const formMetrics: FormPerformanceMetrics = {
        ...baseMetrics,
        formId: formConfig.id,
        fieldCount: formConfig.allFields.length,
        renderDuration: baseMetrics.duration,
        validationDuration: 0,
        validationErrors: 0,
      };

      return formMetrics;
    },
    [enabled, formConfig.id, formConfig.allFields.length]
  );

  return {
    trackFormRender,
    trackFormValidation,
    trackFormSubmission,
    trackFieldChange,
    startPerformanceTracking,
    endPerformanceTracking,
  };
}
