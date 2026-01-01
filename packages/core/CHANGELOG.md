# @rilaykit/core

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

## 13.0.0

### Major Changes

- Fix bug

## 12.1.0

### Minor Changes

- Add three separate step tracking lists to WorkflowContext

  - `visitedSteps`: All steps where user has arrived (complete history including invisible ones)
  - `visibleVisitedSteps`: Visited steps filtered to only show currently visible steps
  - `passedSteps`: Steps that user has validated/completed by navigating forward

  This fix addresses the bug where visitedSteps contained steps that were no longer visible due to conditions, causing incorrect counts like "17/15 steps" in steppers.

## 12.0.0

### Major Changes

- Add new passedSteps

## 11.2.0

### Minor Changes

- Fix bug

## 11.1.0

### Minor Changes

- Fix bug

- Fix bug

## 11.0.0

### Major Changes

- Big refactor

## 10.0.0

### Major Changes

- Fix some bugs, add defaultStep value in Workflow

## 9.0.1

### Patch Changes

- Fix issue with isLastStep and isFirstStep

## 9.0.0

### Major Changes

- Refactor & optimization

## 8.1.0

### Minor Changes

- Add array support for conditions

## 8.0.0

### Major Changes

- Add some features

## 7.0.0

### Major Changes

- Add persistence

## 6.0.0

### Major Changes

- Major refactor

## 5.2.1

### Patch Changes

- Fix issue with onCompleteWorkflow

## 5.2.0

### Minor Changes

- Fix props in field renderer

## 5.1.0

### Minor Changes

- Add values to FieldRendererProps

## 5.0.0

### Major Changes

- Refactor packages

## 4.0.0

### Major Changes

- Major update with huges changes

## 3.0.0

### Major Changes

- Enhance TypeScript support

## 2.0.1

### Patch Changes

- Remove key prop in workflow form provider

## 2.0.0

### Major Changes

- Simplified API with module augmentation
