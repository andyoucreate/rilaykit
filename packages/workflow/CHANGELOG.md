# @rilaykit/workflow

## 13.1.3

### Patch Changes

- Updated dependencies []:
  - @rilaykit/forms@14.0.0
  - @rilaykit/core@13.0.0

## 13.1.2

### Patch Changes

- Updated dependencies []:
  - @rilaykit/forms@13.0.0

## 13.1.1

### Patch Changes

- Updated dependencies []:
  - @rilaykit/forms@12.0.0

## 13.1.0

### Minor Changes

- Add three separate step tracking lists to WorkflowContext

  - `visitedSteps`: All steps where user has arrived (complete history including invisible ones)
  - `visibleVisitedSteps`: Visited steps filtered to only show currently visible steps
  - `passedSteps`: Steps that user has validated/completed by navigating forward

  This fix addresses the bug where visitedSteps contained steps that were no longer visible due to conditions, causing incorrect counts like "17/15 steps" in steppers.

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@12.1.0
  - @rilaykit/forms@11.2.2

## 13.0.0

### Major Changes

- Add new passedSteps

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@12.0.0
  - @rilaykit/forms@11.2.1

## 12.2.0

### Minor Changes

- Fix bug

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@11.2.0
  - @rilaykit/forms@11.2.0

## 12.1.0

### Minor Changes

- Fix bug

- Fix bug

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@11.1.0
  - @rilaykit/forms@11.1.0

## 12.0.0

### Major Changes

- Big refactor

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@11.0.0
  - @rilaykit/forms@11.0.0

## 11.0.0

### Major Changes

- Fix bug

## 10.0.0

### Major Changes

- Fix some bugs, add defaultStep value in Workflow

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@10.0.0
  - @rilaykit/forms@10.0.0

## 9.0.1

### Patch Changes

- Fix issue with isLastStep and isFirstStep

- Updated dependencies []:
  - @rilaykit/core@9.0.1
  - @rilaykit/forms@9.0.1

## 9.0.0

### Major Changes

- Refactor & optimization

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@9.0.0
  - @rilaykit/forms@9.0.0

## 8.1.1

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@8.1.0
  - @rilaykit/forms@8.0.1

## 8.1.0

### Minor Changes

- Fix issue with WorkflowBody

## 8.0.0

### Major Changes

- Add some features

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@8.0.0
  - @rilaykit/forms@8.0.0

## 7.2.0

### Minor Changes

- Fix persistence bug

## 7.1.0

### Minor Changes

- Fix persistence bug

## 7.0.0

### Major Changes

- Add persistence

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@7.0.0
  - @rilaykit/forms@7.0.0

## 6.0.0

### Major Changes

- Major refactor

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@6.0.0
  - @rilaykit/forms@6.0.0

## 5.2.1

### Patch Changes

- Fix issue with onCompleteWorkflow

- Updated dependencies []:
  - @rilaykit/core@5.2.1
  - @rilaykit/forms@5.2.1

## 5.2.0

### Minor Changes

- Fix props in field renderer

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@5.2.0
  - @rilaykit/forms@5.2.0

## 5.1.0

### Minor Changes

- Add values to FieldRendererProps

### Patch Changes

- Updated dependencies []:
  - @rilaykit/forms@5.1.0
  - @rilaykit/core@5.1.0

## 5.0.0

### Major Changes

- Refactor packages

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@5.0.0
  - @rilaykit/forms@5.0.0

## 4.0.0

### Major Changes

- Major update with huges changes

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@4.0.0
  - @rilaykit/forms@4.0.0

## 3.0.0

### Major Changes

- Enhance TypeScript support

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@3.0.0
  - @rilaykit/forms@3.0.0

## 2.0.1

### Patch Changes

- Remove key prop in workflow form provider

- Updated dependencies []:
  - @rilaykit/core@2.0.1
  - @rilaykit/forms@2.0.1

## 2.0.0

### Major Changes

- Simplified API with module augmentation

### Patch Changes

- Updated dependencies []:
  - @rilaykit/core@2.0.0
  - @rilaykit/forms@2.0.0
