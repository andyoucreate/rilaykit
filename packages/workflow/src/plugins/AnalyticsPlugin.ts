import type { WorkflowAnalytics, WorkflowContext, WorkflowPlugin } from '@rilaykit/core';

export interface AnalyticsPluginConfig {
  providers: {
    googleAnalytics?: {
      trackingId: string;
      customDimensions?: Record<string, string>;
    };
    mixpanel?: {
      token: string;
      options?: any;
    };
    amplitude?: {
      apiKey: string;
      options?: any;
    };
    custom?: {
      endpoint: string;
      headers?: Record<string, string>;
    };
  };
  eventMapping?: {
    workflowStart?: string;
    workflowComplete?: string;
    stepStart?: string;
    stepComplete?: string;
    stepSkip?: string;
    validationError?: string;
  };
  includeUserContext?: boolean;
  includeFormData?: boolean;
  enablePerformanceTracking?: boolean;
}

export class AnalyticsPlugin implements WorkflowPlugin {
  name = 'analytics';
  version = '1.0.0';

  private config: AnalyticsPluginConfig;
  private performanceData = new Map<string, number>();

  constructor(config: AnalyticsPluginConfig) {
    this.config = config;
  }

  install(workflowBuilder: any) {
    const analytics: WorkflowAnalytics = {
      onWorkflowStart: (workflowId, context) => {
        this.track('workflow_start', {
          workflow_id: workflowId,
          total_steps: context.totalSteps,
          ...this.getContextData(context),
        });

        if (this.config.enablePerformanceTracking) {
          this.performanceData.set(`workflow_${workflowId}`, Date.now());
        }
      },

      onWorkflowComplete: (workflowId, duration, data) => {
        this.track('workflow_complete', {
          workflow_id: workflowId,
          duration_ms: duration,
          form_data_keys: this.config.includeFormData ? Object.keys(data) : undefined,
          ...(this.config.includeFormData ? { form_data: data } : {}),
        });
      },

      onWorkflowAbandon: (workflowId, currentStep, data) => {
        this.track('workflow_abandon', {
          workflow_id: workflowId,
          abandoned_at_step: currentStep,
          completion_percentage: this.calculateCompletionPercentage(data),
        });
      },

      onStepStart: (stepId, timestamp, context) => {
        this.track('step_start', {
          step_id: stepId,
          step_index: context.currentStepIndex,
          workflow_id: context.workflowId,
          ...this.getContextData(context),
        });

        if (this.config.enablePerformanceTracking) {
          this.performanceData.set(`step_${stepId}`, timestamp);
        }
      },

      onStepComplete: (stepId, duration, data, context) => {
        this.track('step_complete', {
          step_id: stepId,
          step_index: context.currentStepIndex,
          workflow_id: context.workflowId,
          duration_ms: duration,
          field_count: Object.keys(data).length,
          ...this.getContextData(context),
        });
      },

      onStepSkip: (stepId, reason, context) => {
        this.track('step_skip', {
          step_id: stepId,
          step_index: context.currentStepIndex,
          workflow_id: context.workflowId,
          skip_reason: reason,
          ...this.getContextData(context),
        });
      },

      onValidationError: (stepId, errors, context) => {
        this.track('validation_error', {
          step_id: stepId,
          step_index: context.currentStepIndex,
          workflow_id: context.workflowId,
          error_count: errors.length,
          error_codes: errors.map((e) => e.code),
          ...this.getContextData(context),
        });
      },

      onError: (error, context) => {
        this.track('workflow_error', {
          workflow_id: context.workflowId,
          step_id: context.currentStepIndex,
          error_message: error.message,
          error_name: error.name,
          ...this.getContextData(context),
        });
      },
    };

    // Apply analytics to workflow builder
    workflowBuilder.setAnalytics(analytics);
  }

  private track(eventName: string, properties: Record<string, any>) {
    const mappedEventName =
      this.config.eventMapping?.[eventName as keyof typeof this.config.eventMapping] || eventName;

    // Add timestamp
    const enrichedProperties = {
      ...properties,
      timestamp: Date.now(),
      plugin_version: this.version,
    };

    // Track to all configured providers
    for (const [provider, config] of Object.entries(this.config.providers)) {
      switch (provider) {
        case 'googleAnalytics':
          this.trackGoogleAnalytics(mappedEventName, enrichedProperties, config as any);
          break;
        case 'mixpanel':
          this.trackMixpanel(mappedEventName, enrichedProperties);
          break;
        case 'amplitude':
          this.trackAmplitude(mappedEventName, enrichedProperties);
          break;
        case 'custom':
          this.trackCustom(mappedEventName, enrichedProperties, config as any);
          break;
      }
    }
  }

  private trackGoogleAnalytics(eventName: string, properties: Record<string, any>, config: any) {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', eventName, {
        ...properties,
        custom_map: config.customDimensions,
      });
    }
  }

  private trackMixpanel(eventName: string, properties: Record<string, any>) {
    if (typeof window !== 'undefined' && (window as any).mixpanel) {
      (window as any).mixpanel.track(eventName, properties);
    }
  }

  private trackAmplitude(eventName: string, properties: Record<string, any>) {
    if (typeof window !== 'undefined' && (window as any).amplitude) {
      (window as any).amplitude.getInstance().logEvent(eventName, properties);
    }
  }

  private async trackCustom(eventName: string, properties: Record<string, any>, config: any) {
    try {
      await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify({
          event: eventName,
          properties,
        }),
      });
    } catch (error) {
      console.error('Custom analytics tracking failed:', error);
    }
  }

  private getContextData(context: WorkflowContext): Record<string, any> {
    if (!this.config.includeUserContext) return {};

    return {
      user_id: context.user?.id,
      is_first_step: context.isFirstStep,
      is_last_step: context.isLastStep,
      visited_steps_count: context.visitedSteps.size,
      browser_info:
        typeof window !== 'undefined'
          ? {
              user_agent: navigator.userAgent,
              language: navigator.language,
              platform: navigator.platform,
            }
          : undefined,
    };
  }

  private calculateCompletionPercentage(data: Record<string, any>): number {
    const totalFields = Object.keys(data).length;
    const completedFields = Object.values(data).filter(
      (value) => value !== null && value !== undefined && value !== ''
    ).length;

    return totalFields > 0 ? (completedFields / totalFields) * 100 : 0;
  }
}

// Factory function for easy plugin creation
export function createAnalyticsPlugin(config: AnalyticsPluginConfig): AnalyticsPlugin {
  return new AnalyticsPlugin(config);
}
