# @rilaykit/validation-adapters

## 4.0.0

### Major Changes

- Add some features

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@8.0.0

## 3.0.0

### Major Changes

- Add comprehensive validation adapters for Joi and Yup alongside existing Zod adapter

  ## New Features

  ### 🎯 **Joi Adapter**

  - **Field Validator**: `createJoiValidator()` with sync validation support
  - **Form Validator**: `createJoiFormValidator()` with grouped field errors
  - **Utilities**: Error transformations, path formatters, presets
  - **Convenience Functions**: `createJoiStrictValidator()`, `createJoiLenientValidator()`

  ### 🎯 **Yup Adapter**

  - **Field Validator**: `createYupValidator()` with async validation support
  - **Form Validator**: `createYupFormValidator()` with grouped field errors
  - **Utilities**: Error transformations, path formatters, presets
  - **Convenience Functions**: `createYupStrictValidator()`, `createYupLenientValidator()`

  ### 🔄 **Enhanced Zod Adapter**

  - **Fixed async validation**: Added `parseMode: 'async'` option for async refinements
  - **Direct dependencies**: Zod, Joi, and Yup are now direct dependencies for better stability

  ## Usage

  ```typescript
  // Zod (enhanced)
  import { createZodValidator } from "@rilaykit/validation-adapters";
  const validator = createZodValidator(schema, { parseMode: "async" });

  // Yup (new)
  import { createYupValidator } from "@rilaykit/validation-adapters/yup";
  const validator = createYupValidator(schema, { abortEarly: false });

  // Joi (new)
  import { createJoiValidator } from "@rilaykit/validation-adapters/joi";
  const validator = createJoiValidator(schema, { allowUnknown: true });
  ```

  ## Breaking Changes

  - Validation adapters now include Zod, Joi, and Yup as direct dependencies
  - Package exports updated to include `/yup` and `/joi` sub-exports

  ## Migration

  - No code changes required for existing Zod usage
  - New adapters available immediately via dedicated imports

- Add persistence

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@7.0.0

## 3.0.0-alpha.0

### Major Changes

- Add comprehensive validation adapters for Joi and Yup alongside existing Zod adapter

  ## New Features

  ### 🎯 **Joi Adapter**

  - **Field Validator**: `createJoiValidator()` with sync validation support
  - **Form Validator**: `createJoiFormValidator()` with grouped field errors
  - **Utilities**: Error transformations, path formatters, presets
  - **Convenience Functions**: `createJoiStrictValidator()`, `createJoiLenientValidator()`

  ### 🎯 **Yup Adapter**

  - **Field Validator**: `createYupValidator()` with async validation support
  - **Form Validator**: `createYupFormValidator()` with grouped field errors
  - **Utilities**: Error transformations, path formatters, presets
  - **Convenience Functions**: `createYupStrictValidator()`, `createYupLenientValidator()`

  ### 🔄 **Enhanced Zod Adapter**

  - **Fixed async validation**: Added `parseMode: 'async'` option for async refinements
  - **Direct dependencies**: Zod, Joi, and Yup are now direct dependencies for better stability

  ## Usage

  ```typescript
  // Zod (enhanced)
  import { createZodValidator } from "@rilaykit/validation-adapters";
  const validator = createZodValidator(schema, { parseMode: "async" });

  // Yup (new)
  import { createYupValidator } from "@rilaykit/validation-adapters/yup";
  const validator = createYupValidator(schema, { abortEarly: false });

  // Joi (new)
  import { createJoiValidator } from "@rilaykit/validation-adapters/joi";
  const validator = createJoiValidator(schema, { allowUnknown: true });
  ```

  ## Breaking Changes

  - Validation adapters now include Zod, Joi, and Yup as direct dependencies
  - Package exports updated to include `/yup` and `/joi` sub-exports

  ## Migration

  - No code changes required for existing Zod usage
  - New adapters available immediately via dedicated imports

## 2.0.0

### Major Changes

- Major refactor

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@6.0.0
