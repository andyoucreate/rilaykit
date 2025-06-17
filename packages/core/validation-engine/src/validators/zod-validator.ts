import type {
  ValidationContext,
  ValidationResult,
  ValidatorFunction,
} from '@streamline/form-engine';
import { z } from 'zod';

/**
 * Zod validation error mapper
 */
function mapZodError(error: z.ZodError): ValidationResult {
  const errors = error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path,
  }));

  return {
    isValid: false,
    errors,
  };
}

/**
 * Create a validator from a Zod schema
 */
export function createZodValidator<T>(schema: z.ZodSchema<T>): ValidatorFunction {
  return (value: any, _context: ValidationContext): ValidationResult => {
    try {
      schema.parse(value);
      return {
        isValid: true,
        errors: [],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return mapZodError(error);
      }

      // Handle unexpected errors
      return {
        isValid: false,
        errors: [
          {
            code: 'unknown_error',
            message: error instanceof Error ? error.message : 'Unknown validation error',
          },
        ],
      };
    }
  };
}

/**
 * Create an async validator from a Zod schema
 */
export function createAsyncZodValidator<T>(schema: z.ZodSchema<T>): ValidatorFunction {
  return async (value: any, _context: ValidationContext): Promise<ValidationResult> => {
    try {
      await schema.parseAsync(value);
      return {
        isValid: true,
        errors: [],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return mapZodError(error);
      }

      // Handle unexpected errors
      return {
        isValid: false,
        errors: [
          {
            code: 'unknown_error',
            message: error instanceof Error ? error.message : 'Unknown validation error',
          },
        ],
      };
    }
  };
}

/**
 * Validate a partial object against a Zod schema
 */
export function createPartialZodValidator<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): ValidatorFunction {
  const partialSchema = schema.partial();

  return (value: any, _context: ValidationContext): ValidationResult => {
    try {
      partialSchema.parse(value);
      return {
        isValid: true,
        errors: [],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return mapZodError(error);
      }

      return {
        isValid: false,
        errors: [
          {
            code: 'unknown_error',
            message: error instanceof Error ? error.message : 'Unknown validation error',
          },
        ],
      };
    }
  };
}

/**
 * Create a validator for a specific field from a Zod object schema
 */
export function createFieldZodValidator<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  fieldName: keyof T
): ValidatorFunction {
  const fieldSchema = schema.shape[fieldName];

  if (!fieldSchema) {
    throw new Error(`Field "${String(fieldName)}" not found in schema`);
  }

  return createZodValidator(fieldSchema);
}

/**
 * Zod schema resolver for form validation
 */
export function zodResolver<T extends z.ZodSchema>(schema: T): (formData: any) => ValidationResult {
  return (formData: any): ValidationResult => {
    try {
      schema.parse(formData);
      return {
        isValid: true,
        errors: [],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return mapZodError(error);
      }

      return {
        isValid: false,
        errors: [
          {
            code: 'unknown_error',
            message: error instanceof Error ? error.message : 'Unknown validation error',
          },
        ],
      };
    }
  };
}

/**
 * Create a validator that transforms the value before validation
 */
export function createTransformZodValidator<T, U>(
  schema: z.ZodSchema<U>,
  transform: (value: T) => U
): ValidatorFunction {
  return (value: T, _context: ValidationContext): ValidationResult => {
    try {
      const transformedValue = transform(value);
      schema.parse(transformedValue);
      return {
        isValid: true,
        errors: [],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return mapZodError(error);
      }

      return {
        isValid: false,
        errors: [
          {
            code: 'transform_error',
            message: error instanceof Error ? error.message : 'Transformation failed',
          },
        ],
      };
    }
  };
}

/**
 * Common Zod validators
 */
export const ZodValidators = {
  string: () => createZodValidator(z.string()),
  number: () => createZodValidator(z.number()),
  boolean: () => createZodValidator(z.boolean()),
  email: () => createZodValidator(z.string().email()),
  url: () => createZodValidator(z.string().url()),
  uuid: () => createZodValidator(z.string().uuid()),
  date: () => createZodValidator(z.date()),
  array: <T>(itemSchema: z.ZodSchema<T>) => createZodValidator(z.array(itemSchema)),
  object: <T extends z.ZodRawShape>(shape: T) => createZodValidator(z.object(shape)),
  optional: <T>(schema: z.ZodSchema<T>) => createZodValidator(schema.optional()),
  nullable: <T>(schema: z.ZodSchema<T>) => createZodValidator(schema.nullable()),
  min: (min: number) => createZodValidator(z.string().min(min)),
  max: (max: number) => createZodValidator(z.string().max(max)),
  minNumber: (min: number) => createZodValidator(z.number().min(min)),
  maxNumber: (max: number) => createZodValidator(z.number().max(max)),
  regex: (pattern: RegExp) => createZodValidator(z.string().regex(pattern)),
  enum: <T extends [string, ...string[]]>(values: T) => createZodValidator(z.enum(values)),
} as const;

/**
 * Utility to create a validator from a Zod schema with custom error messages
 */
export function createZodValidatorWithMessages<T>(
  schema: z.ZodSchema<T>,
  errorMap?: z.ZodErrorMap
): ValidatorFunction {
  return (value: any, _context: ValidationContext): ValidationResult => {
    try {
      schema.parse(value);
      return {
        isValid: true,
        errors: [],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        if (errorMap) {
          const customError = new z.ZodError(
            error.issues.map((issue) => ({
              ...issue,
              message: errorMap(issue, { data: value, defaultError: issue.message }).message,
            }))
          );
          return mapZodError(customError);
        }
        return mapZodError(error);
      }

      return {
        isValid: false,
        errors: [
          {
            code: 'unknown_error',
            message: error instanceof Error ? error.message : 'Unknown validation error',
          },
        ],
      };
    }
  };
}

/**
 * Create a conditional Zod validator
 */
export function createConditionalZodValidator<T>(
  condition: (value: any, context: ValidationContext) => boolean,
  schema: z.ZodSchema<T>
): ValidatorFunction {
  return async (value: any, context: ValidationContext): Promise<ValidationResult> => {
    if (!condition(value, context)) {
      return {
        isValid: true,
        errors: [],
      };
    }

    const validator = createZodValidator(schema);
    return await validator(value, context);
  };
}
