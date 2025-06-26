import type {
  ValidationError,
  ValidationResult,
  WorkflowContext,
  WorkflowPlugin,
} from '@streamline/core';

export interface ValidationPluginConfig {
  schema?: {
    type: 'zod' | 'yup' | 'custom';
    schema?: any;
  };
  rules: {
    required?: string[];
    email?: string[];
    phone?: string[];
    minLength?: Record<string, number>;
    maxLength?: Record<string, number>;
    pattern?: Record<string, RegExp>;
    custom?: Record<
      string,
      (value: any, context: WorkflowContext) => ValidationResult | Promise<ValidationResult>
    >;
  };
  crossFieldValidation?: Array<{
    fields: string[];
    validator: (
      values: Record<string, any>,
      context: WorkflowContext
    ) => ValidationResult | Promise<ValidationResult>;
    message: string;
  }>;
  asyncRules?: Record<
    string,
    {
      url: string;
      debounceMs?: number;
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
    }
  >;
  onValidationComplete?: (result: ValidationResult, context: WorkflowContext) => void;
}

export class ValidationPlugin implements WorkflowPlugin {
  name = 'validation';
  version = '1.0.0';
  dependencies = [];

  private config: ValidationPluginConfig;
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(config: ValidationPluginConfig) {
    this.config = config;
  }

  install(workflowBuilder: any) {
    // Add validation hooks to all steps
    const steps = workflowBuilder.getSteps();

    for (const step of steps) {
      const originalHooks = step.hooks || {};

      workflowBuilder.updateStep(step.id, {
        hooks: {
          ...originalHooks,
          onValidate: async (stepData: any, context: WorkflowContext) => {
            const result = await this.validateStep(stepData, context);

            if (this.config.onValidationComplete) {
              this.config.onValidationComplete(result, context);
            }

            return result;
          },
        },
      });
    }
  }

  private async validateStep(
    stepData: Record<string, any>,
    context: WorkflowContext
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    try {
      // Schema validation
      if (this.config.schema) {
        const schemaResult = await this.validateWithSchema(stepData, context);
        errors.push(...schemaResult.errors);
      }

      // Built-in rules validation
      const rulesResult = await this.validateWithRules(stepData, context);
      errors.push(...rulesResult.errors);

      // Cross-field validation
      if (this.config.crossFieldValidation) {
        const crossFieldResult = await this.validateCrossField(context.allData, context);
        errors.push(...crossFieldResult.errors);
      }

      // Async validation
      if (this.config.asyncRules) {
        const asyncResult = await this.validateAsync(stepData, context);
        errors.push(...asyncResult.errors);
      }

      return {
        isValid: errors.length === 0,
        errors,
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [
          {
            code: 'VALIDATION_ERROR',
            message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  private async validateWithSchema(
    data: Record<string, any>,
    context: WorkflowContext
  ): Promise<ValidationResult> {
    if (!this.config.schema?.schema) {
      return { isValid: true, errors: [] };
    }

    try {
      switch (this.config.schema.type) {
        case 'zod': {
          const zodResult = this.config.schema.schema.safeParse(data);
          if (!zodResult.success) {
            return {
              isValid: false,
              errors: zodResult.error.errors.map((err: any) => ({
                code: err.code,
                message: err.message,
                path: err.path,
              })),
            };
          }
          break;
        }

        case 'yup':
          try {
            await this.config.schema.schema.validate(data, {
              abortEarly: false,
            });
          } catch (err: any) {
            return {
              isValid: false,
              errors: err.inner?.map((innerErr: any) => ({
                code: 'YUP_VALIDATION_ERROR',
                message: innerErr.message,
                path: innerErr.path ? [innerErr.path] : undefined,
              })) || [
                {
                  code: 'YUP_VALIDATION_ERROR',
                  message: err.message,
                },
              ],
            };
          }
          break;

        case 'custom': {
          const customResult = await this.config.schema.schema(data, context);
          if (!customResult.isValid) {
            return customResult;
          }
          break;
        }
      }

      return { isValid: true, errors: [] };
    } catch (error) {
      return {
        isValid: false,
        errors: [
          {
            code: 'SCHEMA_VALIDATION_ERROR',
            message: `Schema validation failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }

  private async validateWithRules(
    data: Record<string, any>,
    context: WorkflowContext
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // Required fields
    if (this.config.rules.required) {
      for (const field of this.config.rules.required) {
        if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
          errors.push({
            code: 'REQUIRED',
            message: `${field} is required`,
            path: [field],
          });
        }
      }
    }

    // Email validation
    if (this.config.rules.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const field of this.config.rules.email) {
        if (data[field] && !emailRegex.test(data[field])) {
          errors.push({
            code: 'INVALID_EMAIL',
            message: `${field} must be a valid email address`,
            path: [field],
          });
        }
      }
    }

    // Phone validation
    if (this.config.rules.phone) {
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      for (const field of this.config.rules.phone) {
        if (data[field] && !phoneRegex.test(data[field].replace(/\s/g, ''))) {
          errors.push({
            code: 'INVALID_PHONE',
            message: `${field} must be a valid phone number`,
            path: [field],
          });
        }
      }
    }

    // Length validation
    if (this.config.rules.minLength) {
      for (const [field, minLength] of Object.entries(this.config.rules.minLength)) {
        if (data[field] && data[field].length < minLength) {
          errors.push({
            code: 'MIN_LENGTH',
            message: `${field} must be at least ${minLength} characters long`,
            path: [field],
          });
        }
      }
    }

    if (this.config.rules.maxLength) {
      for (const [field, maxLength] of Object.entries(this.config.rules.maxLength)) {
        if (data[field] && data[field].length > maxLength) {
          errors.push({
            code: 'MAX_LENGTH',
            message: `${field} must be no more than ${maxLength} characters long`,
            path: [field],
          });
        }
      }
    }

    // Pattern validation
    if (this.config.rules.pattern) {
      for (const [field, pattern] of Object.entries(this.config.rules.pattern)) {
        if (data[field] && !pattern.test(data[field])) {
          errors.push({
            code: 'PATTERN_MISMATCH',
            message: `${field} format is invalid`,
            path: [field],
          });
        }
      }
    }

    // Custom validation rules
    if (this.config.rules.custom) {
      for (const [field, validator] of Object.entries(this.config.rules.custom)) {
        if (data[field]) {
          const result = await validator(data[field], context);
          if (!result.isValid) {
            errors.push(
              ...result.errors.map((error) => ({
                ...error,
                path: [field],
              }))
            );
          }
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  private async validateCrossField(
    allData: Record<string, any>,
    context: WorkflowContext
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    if (!this.config.crossFieldValidation) {
      return { isValid: true, errors: [] };
    }

    for (const rule of this.config.crossFieldValidation) {
      const fieldValues: Record<string, any> = {};
      let hasAllFields = true;

      for (const field of rule.fields) {
        if (allData[field] !== undefined) {
          fieldValues[field] = allData[field];
        } else {
          hasAllFields = false;
          break;
        }
      }

      if (hasAllFields) {
        const result = await rule.validator(fieldValues, context);
        if (!result.isValid) {
          errors.push({
            code: 'CROSS_FIELD_VALIDATION',
            message: rule.message,
            path: rule.fields,
          });
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  private async validateAsync(
    data: Record<string, any>,
    context: WorkflowContext
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    if (!this.config.asyncRules) {
      return { isValid: true, errors: [] };
    }

    const validationPromises = Object.entries(this.config.asyncRules).map(async ([field, rule]) => {
      if (!data[field]) return null;

      // Debounce async validation
      const debounceKey = `${field}_${context.workflowId}`;
      if (this.debounceTimers.has(debounceKey)) {
        clearTimeout(this.debounceTimers.get(debounceKey)!);
      }

      return new Promise<ValidationError | null>((resolve) => {
        const timer = setTimeout(async () => {
          try {
            const url =
              rule.method === 'GET'
                ? `${rule.url}?value=${encodeURIComponent(data[field])}`
                : rule.url;

            const response = await fetch(url, {
              method: rule.method || 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...rule.headers,
              },
              body: rule.method !== 'GET' ? JSON.stringify({ value: data[field] }) : undefined,
            });

            const result = await response.json();

            if (!result.isValid) {
              resolve({
                code: 'ASYNC_VALIDATION_ERROR',
                message: result.message || `${field} validation failed`,
                path: [field],
              });
            } else {
              resolve(null);
            }
          } catch {
            resolve({
              code: 'ASYNC_VALIDATION_ERROR',
              message: `Async validation failed for ${field}`,
              path: [field],
            });
          }
        }, rule.debounceMs || 500);

        this.debounceTimers.set(debounceKey, timer);
      });
    });

    const results = await Promise.all(validationPromises);
    errors.push(...(results.filter((result) => result !== null) as ValidationError[]));

    return { isValid: errors.length === 0, errors };
  }
}

// Factory function
export function createValidationPlugin(config: ValidationPluginConfig): ValidationPlugin {
  return new ValidationPlugin(config);
}
