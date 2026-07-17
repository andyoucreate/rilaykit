import { AppSidebar } from '@/components/layout/app-sidebar';
import { InspectorPanel } from '@/components/shared/inspector-panel';
import { AgentAssistantPage } from '@/pages/agent/assistant';
import { AgentManifestPage } from '@/pages/agent/manifest';
import { ConditionalFieldsPage } from '@/pages/forms/conditional-fields';
import { CrossFieldValidationPage } from '@/pages/forms/cross-field-validation';
import { FieldEffectsPage } from '@/pages/forms/field-effects';
import { InvoiceFanoutPage } from '@/pages/forms/invoice-fanout';
import { RepeatableFieldsPage } from '@/pages/forms/repeatable-fields';
import { ServerDrivenFormPage } from '@/pages/forms/server-driven-form';
import { SimpleFormPage } from '@/pages/forms/simple-form';
import { HomePage } from '@/pages/home';
import { ConditionalStepsPage } from '@/pages/workflows/conditional-steps';
import { MultiStepOnboardingPage } from '@/pages/workflows/multi-step-onboarding';
import { SpecialValuesPage } from '@/pages/workflows/special-values';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

export function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen">
        <AppSidebar />
        <main className="ml-64 flex-1 p-8 pb-24">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/forms/simple" element={<SimpleFormPage />} />
            <Route path="/forms/conditional" element={<ConditionalFieldsPage />} />
            <Route path="/forms/effects" element={<FieldEffectsPage />} />
            <Route path="/forms/repeatable" element={<RepeatableFieldsPage />} />
            <Route path="/forms/invoice-fanout" element={<InvoiceFanoutPage />} />
            <Route path="/forms/cross-validation" element={<CrossFieldValidationPage />} />
            <Route path="/forms/server-driven" element={<ServerDrivenFormPage />} />
            <Route path="/workflows/onboarding" element={<MultiStepOnboardingPage />} />
            <Route path="/workflows/conditional" element={<ConditionalStepsPage />} />
            <Route path="/workflows/special-values" element={<SpecialValuesPage />} />
            <Route path="/agent/assistant" element={<AgentAssistantPage />} />
            <Route path="/agent/manifest" element={<AgentManifestPage />} />
          </Routes>
        </main>
        <InspectorPanel />
      </div>
    </BrowserRouter>
  );
}
