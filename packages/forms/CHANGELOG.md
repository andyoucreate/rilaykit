# @rilaykit/forms

## 15.0.0

### Major Changes

- Implement Zustand-based state management for forms and workflows

  **BREAKING CHANGES:**

  - Forms now use Zustand store for state management instead of React Context
  - Workflows now use Zustand store for state management
  - New hooks for accessing store state: `useFormStore`, `useWorkflowStore`
  - Improved performance with fine-grained subscriptions and selector-based re-renders
  - Better isolation of component re-renders

  **Migration:**

  - Replace direct context access with new Zustand-based hooks
  - Update custom components that rely on form/workflow context internals

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@14.0.0

## 14.0.0

### Major Changes

- Fix bug

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@13.0.0

## 13.0.0

### Major Changes

- Fix bug

## 12.0.0

### Major Changes

- Fix bug

## 11.2.2

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@12.1.0

## 11.2.1

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@12.0.0

## 11.2.0

### Minor Changes

- Fix bug

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@11.2.0

## 11.1.0

### Minor Changes

- Fix bug

- Fix bug

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@11.1.0

## 11.0.0

### Major Changes

- Big refactor

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@11.0.0

## 10.0.0

### Major Changes

- Fix some bugs, add defaultStep value in Workflow

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@10.0.0

## 9.0.1

### Patch Changes

- Fix issue with isLastStep and isFirstStep

- Updated dependencies []:
  - @rilaykit/core@9.0.1

## 9.0.0

### Major Changes

- Refactor & optimization

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@9.0.0

## 8.0.1

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@8.1.0

## 8.0.0

### Major Changes

- Add some features

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@8.0.0

## 7.0.0

### Major Changes

- Add persistence

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@7.0.0

## 6.0.0

### Major Changes

- Major refactor

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@6.0.0

## 5.2.1

### Patch Changes

- Fix issue with onCompleteWorkflow

- Updated dependencies []:
  - @rilaykit/core@5.2.1

## 5.2.0

### Minor Changes

- Fix props in field renderer

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@5.2.0

## 5.1.0

### Minor Changes

- Add values to FieldRendererProps

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@5.1.0

## 5.0.0

### Major Changes

- Refactor packages

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@5.0.0

## 4.0.0

### Major Changes

- Major update with huges changes

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@4.0.0

## 3.0.0

### Major Changes

- Enhance TypeScript support

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@3.0.0

## 2.0.1

### Patch Changes

- Remove key prop in workflow form provider

- Updated dependencies []:
  - @rilaykit/core@2.0.1

## 2.0.0

### Major Changes

- Simplified API with module augmentation

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@2.0.0
