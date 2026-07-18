import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { AgentKycPage } from './agent/agentic-kyc';
import { AgentAssistantPage } from './agent/assistant';
import { AgentManifestPage } from './agent/manifest';
import { AgentMultiTurnPage } from './agent/multi-turn';
import { ConditionalFieldsPage } from './forms/conditional-fields';
import { CrossFieldValidationPage } from './forms/cross-field-validation';
import { FieldEffectsPage } from './forms/field-effects';
import { InvoiceFanoutPage } from './forms/invoice-fanout';
import { RepeatableFieldsPage } from './forms/repeatable-fields';
import { ServerDrivenFormPage } from './forms/server-driven-form';
import { SimpleFormPage } from './forms/simple-form';
import { HomePage } from './home';
import { ConditionalStepsPage } from './workflows/conditional-steps';
import { MultiStepOnboardingPage } from './workflows/multi-step-onboarding';
import { SpecialValuesPage } from './workflows/special-values';

/**
 * Every demo page must MOUNT without crashing — a page that throws at render
 * breaks the demo in front of whoever we're showing it to (this is exactly how
 * the empty-value `<SelectItem>` crash in the agentic-KYC schema was caught).
 * Rendering each page component through the real library (its own
 * FormProvider/Catalog/Flow) asserts it paints its heading and nothing throws.
 */
const PAGES: Array<readonly [string, ComponentType]> = [
  ['Home', HomePage],
  ['Simple Form', SimpleFormPage],
  ['Conditional Fields', ConditionalFieldsPage],
  ['Field Effects', FieldEffectsPage],
  ['Repeatable Fields', RepeatableFieldsPage],
  ['Global-watch Fan-out', InvoiceFanoutPage],
  ['Cross-field Validation', CrossFieldValidationPage],
  ['Server-Driven Form', ServerDrivenFormPage],
  ['Multi-step Onboarding', MultiStepOnboardingPage],
  ['Conditional Steps', ConditionalStepsPage],
  ['Special Values', SpecialValuesPage],
  ['Agent UI', AgentAssistantPage],
  ['Agentic KYC', AgentKycPage],
  ['Multi-turn', AgentMultiTurnPage],
  ['Manifest', AgentManifestPage],
];

describe('playground pages smoke — every demo mounts without crashing', () => {
  // jsdom has no ResizeObserver (a native browser API some shadcn primitives
  // touch); shim it so a page using one renders here the way it does in a real
  // browser. Not a page defect — the demo works in the browser.
  beforeAll(() => {
    if (!('ResizeObserver' in globalThis)) {
      (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  it.each(PAGES)('%s renders its heading', (_label, Page) => {
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    );
    // A heading proves the page's chrome (PageHeader / home hero) painted.
    expect(screen.getAllByRole('heading').length).toBeGreaterThan(0);
  });
});
