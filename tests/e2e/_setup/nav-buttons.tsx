import {
  NextButton as BaseNextButton,
  PrevButton as BasePrevButton,
  SkipButton as BaseSkipButton,
} from '../../../packages/workflow/tests/_helpers/nav-buttons';

// =================================================================
// SHARED FLOW NAV BUTTONS FOR E2E TESTS
// Thin wrappers over the workflow package test helpers, binding the
// historical e2e test ids (next-btn / prev-btn / skip-btn).
// =================================================================

export function NextButton() {
  return <BaseNextButton testId="next-btn" />;
}

export function PrevButton() {
  return <BasePrevButton testId="prev-btn" />;
}

export function SkipButton() {
  return <BaseSkipButton testId="skip-btn" />;
}
