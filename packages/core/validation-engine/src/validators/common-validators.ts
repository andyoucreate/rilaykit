import type {
  ValidationContext,
  ValidationResult,
  ValidatorFunction,
} from '@streamline/form-engine';

/**
 * Common validation error codes
 */
export const ValidationErrorCodes = {
  REQUIRED: 'required',
  MIN_LENGTH: 'min_length',
  MAX_LENGTH: 'max_length',
  MIN_VALUE: 'min_value',
  MAX_VALUE: 'max_value',
  PATTERN: 'pattern',
  EMAIL: 'email',
  URL: 'url',
  PHONE: 'phone',
  DATE: 'date',
  TIME: 'time',
  DATETIME: 'datetime',
  NUMBER: 'number',
  INTEGER: 'integer',
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  ALPHA: 'alpha',
  ALPHANUMERIC: 'alphanumeric',
  CUSTOM: 'custom',
} as const;

/**
 * Validation messages in multiple languages
 */
export const ValidationMessages = {
  en: {
    [ValidationErrorCodes.REQUIRED]: 'This field is required',
    [ValidationErrorCodes.MIN_LENGTH]: 'Must be at least {min} characters long',
    [ValidationErrorCodes.MAX_LENGTH]: 'Must be no more than {max} characters long',
    [ValidationErrorCodes.MIN_VALUE]: 'Must be at least {min}',
    [ValidationErrorCodes.MAX_VALUE]: 'Must be no more than {max}',
    [ValidationErrorCodes.PATTERN]: 'Invalid format',
    [ValidationErrorCodes.EMAIL]: 'Must be a valid email address',
    [ValidationErrorCodes.URL]: 'Must be a valid URL',
    [ValidationErrorCodes.PHONE]: 'Must be a valid phone number',
    [ValidationErrorCodes.DATE]: 'Must be a valid date',
    [ValidationErrorCodes.TIME]: 'Must be a valid time',
    [ValidationErrorCodes.DATETIME]: 'Must be a valid date and time',
    [ValidationErrorCodes.NUMBER]: 'Must be a valid number',
    [ValidationErrorCodes.INTEGER]: 'Must be a valid integer',
    [ValidationErrorCodes.POSITIVE]: 'Must be a positive number',
    [ValidationErrorCodes.NEGATIVE]: 'Must be a negative number',
    [ValidationErrorCodes.ALPHA]: 'Must contain only letters',
    [ValidationErrorCodes.ALPHANUMERIC]: 'Must contain only letters and numbers',
    [ValidationErrorCodes.CUSTOM]: 'Invalid value',
  },
  fr: {
    [ValidationErrorCodes.REQUIRED]: 'Ce champ est requis',
    [ValidationErrorCodes.MIN_LENGTH]: 'Doit contenir au moins {min} caractères',
    [ValidationErrorCodes.MAX_LENGTH]: 'Doit contenir au maximum {max} caractères',
    [ValidationErrorCodes.MIN_VALUE]: 'Doit être au moins {min}',
    [ValidationErrorCodes.MAX_VALUE]: 'Doit être au maximum {max}',
    [ValidationErrorCodes.PATTERN]: 'Format invalide',
    [ValidationErrorCodes.EMAIL]: 'Doit être une adresse email valide',
    [ValidationErrorCodes.URL]: 'Doit être une URL valide',
    [ValidationErrorCodes.PHONE]: 'Doit être un numéro de téléphone valide',
    [ValidationErrorCodes.DATE]: 'Doit être une date valide',
    [ValidationErrorCodes.TIME]: 'Doit être une heure valide',
    [ValidationErrorCodes.DATETIME]: 'Doit être une date et heure valides',
    [ValidationErrorCodes.NUMBER]: 'Doit être un nombre valide',
    [ValidationErrorCodes.INTEGER]: 'Doit être un entier valide',
    [ValidationErrorCodes.POSITIVE]: 'Doit être un nombre positif',
    [ValidationErrorCodes.NEGATIVE]: 'Doit être un nombre négatif',
    [ValidationErrorCodes.ALPHA]: 'Doit contenir uniquement des lettres',
    [ValidationErrorCodes.ALPHANUMERIC]: 'Doit contenir uniquement des lettres et des chiffres',
    [ValidationErrorCodes.CUSTOM]: 'Valeur invalide',
  },
} as const;

/**
 * Common regex patterns
 */
export const ValidationPatterns = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  PHONE: /^[\+]?[1-9][\d]{0,15}$/,
  ALPHA: /^[a-zA-Z]+$/,
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
  DATE: /^\d{4}-\d{2}-\d{2}$/,
  TIME: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
  DATETIME: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
} as const;

/**
 * Helper function to format validation messages
 */
function formatMessage(template: string, params: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key]?.toString() || match;
  });
}

/**
 * Helper function to get validation message
 */
function getMessage(
  code: string,
  _context: ValidationContext,
  params: Record<string, any> = {}
): string {
  // Default to English since language is not in ValidationContext
  const language = 'en';
  const messages =
    ValidationMessages[language as keyof typeof ValidationMessages] || ValidationMessages.en;
  const template =
    messages[code as keyof typeof messages] ||
    ValidationMessages.en[code as keyof typeof ValidationMessages.en];
  return formatMessage(template, params);
}

/**
 * Required field validator
 */
export const required: ValidatorFunction = (
  value: any,
  context: ValidationContext
): ValidationResult => {
  const isEmpty =
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' && Object.keys(value).length === 0);

  if (isEmpty) {
    return {
      isValid: false,
      errors: [
        {
          code: ValidationErrorCodes.REQUIRED,
          message: getMessage(ValidationErrorCodes.REQUIRED, context),
        },
      ],
    };
  }

  return { isValid: true, errors: [] };
};

/**
 * Minimum length validator
 */
export const minLength =
  (min: number): ValidatorFunction =>
  (value: any, context: ValidationContext): ValidationResult => {
    if (value === null || value === undefined) {
      return { isValid: true, errors: [] };
    }

    const length =
      typeof value === 'string' ? value.length : Array.isArray(value) ? value.length : 0;

    if (length < min) {
      return {
        isValid: false,
        errors: [
          {
            code: ValidationErrorCodes.MIN_LENGTH,
            message: getMessage(ValidationErrorCodes.MIN_LENGTH, context, { min }),
          },
        ],
      };
    }

    return { isValid: true, errors: [] };
  };

/**
 * Maximum length validator
 */
export const maxLength =
  (max: number): ValidatorFunction =>
  (value: any, context: ValidationContext): ValidationResult => {
    if (value === null || value === undefined) {
      return { isValid: true, errors: [] };
    }

    const length =
      typeof value === 'string' ? value.length : Array.isArray(value) ? value.length : 0;

    if (length > max) {
      return {
        isValid: false,
        errors: [
          {
            code: ValidationErrorCodes.MAX_LENGTH,
            message: getMessage(ValidationErrorCodes.MAX_LENGTH, context, { max }),
          },
        ],
      };
    }

    return { isValid: true, errors: [] };
  };

/**
 * Minimum value validator
 */
export const minValue =
  (min: number): ValidatorFunction =>
  (value: any, context: ValidationContext): ValidationResult => {
    if (value === null || value === undefined || value === '') {
      return { isValid: true, errors: [] };
    }

    const numValue = Number(value);
    if (Number.isNaN(numValue) || numValue < min) {
      return {
        isValid: false,
        errors: [
          {
            code: ValidationErrorCodes.MIN_VALUE,
            message: getMessage(ValidationErrorCodes.MIN_VALUE, context, { min }),
          },
        ],
      };
    }

    return { isValid: true, errors: [] };
  };

/**
 * Maximum value validator
 */
export const maxValue =
  (max: number): ValidatorFunction =>
  (value: any, context: ValidationContext): ValidationResult => {
    if (value === null || value === undefined || value === '') {
      return { isValid: true, errors: [] };
    }

    const numValue = Number(value);
    if (Number.isNaN(numValue) || numValue > max) {
      return {
        isValid: false,
        errors: [
          {
            code: ValidationErrorCodes.MAX_VALUE,
            message: getMessage(ValidationErrorCodes.MAX_VALUE, context, { max }),
          },
        ],
      };
    }

    return { isValid: true, errors: [] };
  };

/**
 * Pattern validator
 */
export const pattern =
  (regex: RegExp, message?: string): ValidatorFunction =>
  (value: any, context: ValidationContext): ValidationResult => {
    if (value === null || value === undefined || value === '') {
      return { isValid: true, errors: [] };
    }

    if (!regex.test(String(value))) {
      return {
        isValid: false,
        errors: [
          {
            code: ValidationErrorCodes.PATTERN,
            message: message || getMessage(ValidationErrorCodes.PATTERN, context),
          },
        ],
      };
    }

    return { isValid: true, errors: [] };
  };

/**
 * Email validator
 */
export const email: ValidatorFunction = (
  value: any,
  context: ValidationContext
): ValidationResult => {
  if (value === null || value === undefined || value === '') {
    return { isValid: true, errors: [] };
  }

  if (!ValidationPatterns.EMAIL.test(String(value))) {
    return {
      isValid: false,
      errors: [
        {
          code: ValidationErrorCodes.EMAIL,
          message: getMessage(ValidationErrorCodes.EMAIL, context),
        },
      ],
    };
  }

  return { isValid: true, errors: [] };
};

/**
 * URL validator
 */
export const url: ValidatorFunction = (
  value: any,
  context: ValidationContext
): ValidationResult => {
  if (value === null || value === undefined || value === '') {
    return { isValid: true, errors: [] };
  }

  if (!ValidationPatterns.URL.test(String(value))) {
    return {
      isValid: false,
      errors: [
        {
          code: ValidationErrorCodes.URL,
          message: getMessage(ValidationErrorCodes.URL, context),
        },
      ],
    };
  }

  return { isValid: true, errors: [] };
};

/**
 * Phone number validator
 */
export const phone: ValidatorFunction = (
  value: any,
  context: ValidationContext
): ValidationResult => {
  if (value === null || value === undefined || value === '') {
    return { isValid: true, errors: [] };
  }

  if (!ValidationPatterns.PHONE.test(String(value))) {
    return {
      isValid: false,
      errors: [
        {
          code: ValidationErrorCodes.PHONE,
          message: getMessage(ValidationErrorCodes.PHONE, context),
        },
      ],
    };
  }

  return { isValid: true, errors: [] };
};

/**
 * Number validator
 */
export const number: ValidatorFunction = (
  value: any,
  context: ValidationContext
): ValidationResult => {
  if (value === null || value === undefined || value === '') {
    return { isValid: true, errors: [] };
  }

  if (Number.isNaN(Number(value))) {
    return {
      isValid: false,
      errors: [
        {
          code: ValidationErrorCodes.NUMBER,
          message: getMessage(ValidationErrorCodes.NUMBER, context),
        },
      ],
    };
  }

  return { isValid: true, errors: [] };
};

/**
 * Integer validator
 */
export const integer: ValidatorFunction = (
  value: any,
  context: ValidationContext
): ValidationResult => {
  if (value === null || value === undefined || value === '') {
    return { isValid: true, errors: [] };
  }

  const numValue = Number(value);
  if (Number.isNaN(numValue) || !Number.isInteger(numValue)) {
    return {
      isValid: false,
      errors: [
        {
          code: ValidationErrorCodes.INTEGER,
          message: getMessage(ValidationErrorCodes.INTEGER, context),
        },
      ],
    };
  }

  return { isValid: true, errors: [] };
};

/**
 * Positive number validator
 */
export const positive: ValidatorFunction = (
  value: any,
  context: ValidationContext
): ValidationResult => {
  if (value === null || value === undefined || value === '') {
    return { isValid: true, errors: [] };
  }

  const numValue = Number(value);
  if (Number.isNaN(numValue) || numValue <= 0) {
    return {
      isValid: false,
      errors: [
        {
          code: ValidationErrorCodes.POSITIVE,
          message: getMessage(ValidationErrorCodes.POSITIVE, context),
        },
      ],
    };
  }

  return { isValid: true, errors: [] };
};

/**
 * Negative number validator
 */
export const negative: ValidatorFunction = (
  value: any,
  context: ValidationContext
): ValidationResult => {
  if (value === null || value === undefined || value === '') {
    return { isValid: true, errors: [] };
  }

  const numValue = Number(value);
  if (Number.isNaN(numValue) || numValue >= 0) {
    return {
      isValid: false,
      errors: [
        {
          code: ValidationErrorCodes.NEGATIVE,
          message: getMessage(ValidationErrorCodes.NEGATIVE, context),
        },
      ],
    };
  }

  return { isValid: true, errors: [] };
};

/**
 * Alpha characters only validator
 */
export const alpha: ValidatorFunction = (
  value: any,
  context: ValidationContext
): ValidationResult => {
  if (value === null || value === undefined || value === '') {
    return { isValid: true, errors: [] };
  }

  if (!ValidationPatterns.ALPHA.test(String(value))) {
    return {
      isValid: false,
      errors: [
        {
          code: ValidationErrorCodes.ALPHA,
          message: getMessage(ValidationErrorCodes.ALPHA, context),
        },
      ],
    };
  }

  return { isValid: true, errors: [] };
};

/**
 * Alphanumeric characters only validator
 */
export const alphanumeric: ValidatorFunction = (
  value: any,
  context: ValidationContext
): ValidationResult => {
  if (value === null || value === undefined || value === '') {
    return { isValid: true, errors: [] };
  }

  if (!ValidationPatterns.ALPHANUMERIC.test(String(value))) {
    return {
      isValid: false,
      errors: [
        {
          code: ValidationErrorCodes.ALPHANUMERIC,
          message: getMessage(ValidationErrorCodes.ALPHANUMERIC, context),
        },
      ],
    };
  }

  return { isValid: true, errors: [] };
};

/**
 * Date validator
 */
export const date: ValidatorFunction = (
  value: any,
  context: ValidationContext
): ValidationResult => {
  if (value === null || value === undefined || value === '') {
    return { isValid: true, errors: [] };
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return {
      isValid: false,
      errors: [
        {
          code: ValidationErrorCodes.DATE,
          message: getMessage(ValidationErrorCodes.DATE, context),
        },
      ],
    };
  }

  return { isValid: true, errors: [] };
};

/**
 * Custom validator function creator
 */
export const custom =
  (validatorFn: (value: any) => boolean, message?: string): ValidatorFunction =>
  (value: any, context: ValidationContext): ValidationResult => {
    if (value === null || value === undefined || value === '') {
      return { isValid: true, errors: [] };
    }

    if (!validatorFn(value)) {
      return {
        isValid: false,
        errors: [
          {
            code: ValidationErrorCodes.CUSTOM,
            message: message || getMessage(ValidationErrorCodes.CUSTOM, context),
          },
        ],
      };
    }

    return { isValid: true, errors: [] };
  };

/**
 * Compose multiple validators (sync only)
 */
export const compose =
  (...validators: ValidatorFunction[]): ValidatorFunction =>
  (value: any, context: ValidationContext): ValidationResult => {
    const errors: any[] = [];
    const warnings: any[] = [];

    for (const validator of validators) {
      const result = validator(value, context);

      // Handle both sync and async results
      if (result instanceof Promise) {
        throw new Error('Async validators are not supported in compose. Use composeAsync instead.');
      }

      if (!result.isValid) {
        errors.push(...result.errors);
      }
      if (result.warnings) {
        warnings.push(...result.warnings);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  };

/**
 * Compose multiple validators with async support
 */
export const composeAsync =
  (...validators: ValidatorFunction[]): ValidatorFunction =>
  async (value: any, context: ValidationContext): Promise<ValidationResult> => {
    const errors: any[] = [];
    const warnings: any[] = [];

    for (const validator of validators) {
      const result = await validator(value, context);

      if (!result.isValid) {
        errors.push(...result.errors);
      }
      if (result.warnings) {
        warnings.push(...result.warnings);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  };

/**
 * Conditional validator - only validate if condition is met
 */
export const when =
  (
    condition: (value: any, context: ValidationContext) => boolean,
    validator: ValidatorFunction
  ): ValidatorFunction =>
  async (value: any, context: ValidationContext): Promise<ValidationResult> => {
    if (!condition(value, context)) {
      return { isValid: true, errors: [] };
    }
    return await validator(value, context);
  };

/**
 * Collection of all common validators
 */
export const Validators = {
  required,
  minLength,
  maxLength,
  minValue,
  maxValue,
  pattern,
  email,
  url,
  phone,
  number,
  integer,
  positive,
  negative,
  alpha,
  alphanumeric,
  date,
  custom,
  compose,
  composeAsync,
  when,
} as const;
