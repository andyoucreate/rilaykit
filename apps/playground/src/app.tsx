import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { InspectorPanel } from '@/components/shared/inspector-panel';
import { HomePage } from '@/pages/home';
import { SimpleFormPage } from '@/pages/forms/simple-form';
import { ConditionalFieldsPage } from '@/pages/forms/conditional-fields';
import { FieldEffectsPage } from '@/pages/forms/field-effects';
import { RepeatableFieldsPage } from '@/pages/forms/repeatable-fields';
import { CrossFieldValidationPage } from '@/pages/forms/cross-field-validation';
import { MultiStepOnboardingPage } from '@/pages/workflows/multi-step-onboarding';
import { ConditionalStepsPage } from '@/pages/workflows/conditional-steps';

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
            <Route path="/forms/cross-validation" element={<CrossFieldValidationPage />} />
            <Route path="/workflows/onboarding" element={<MultiStepOnboardingPage />} />
            <Route path="/workflows/conditional" element={<ConditionalStepsPage />} />
          </Routes>
        </main>
        <InspectorPanel />
      </div>
    </BrowserRouter>
  );
}
