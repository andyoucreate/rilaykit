import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  FieldId,
  FlowState,
  FormId,
  FormMetadata,
  FormState,
  PageId,
  PluginId,
  RendererId,
  ValidationError,
  ValidationResult,
} from '../types';

// Builder state types
export interface BuilderState {
  readonly id: string;
  readonly type: 'form' | 'flow' | 'schema';
  config: any;
  isDirty: boolean;
  lastSaved: Date | null;
}

// Plugin state types
export interface PluginState {
  readonly id: PluginId;
  readonly installed: boolean;
  enabled: boolean;
  config: Record<string, any>;
  readonly version: string;
}

// Renderer state types
export interface RendererState {
  readonly id: RendererId;
  readonly loaded: boolean;
  config: Record<string, any>;
}

// Form actions interface
export interface FormActions {
  // Form lifecycle
  initializeForm: (formId: FormId, schema: any, metadata?: FormMetadata) => void;
  destroyForm: (formId: FormId) => void;
  resetForm: (formId: FormId) => void;

  // Field operations
  updateField: (formId: FormId, fieldId: FieldId, value: any) => void;
  setFieldTouched: (formId: FormId, fieldId: FieldId, touched?: boolean) => void;
  setFieldError: (formId: FormId, fieldId: FieldId, errors: ValidationError[]) => void;
  clearFieldError: (formId: FormId, fieldId: FieldId) => void;

  // Form operations
  setFormSubmitting: (formId: FormId, isSubmitting: boolean) => void;
  setFormValidating: (formId: FormId, isValidating: boolean) => void;
  setFormErrors: (formId: FormId, errors: Record<string, ValidationError[]>) => void;
  clearFormErrors: (formId: FormId) => void;

  // Validation
  validateField: (formId: FormId, fieldId: FieldId) => Promise<ValidationResult>;
  validateForm: (formId: FormId) => Promise<ValidationResult>;

  // Submission
  submit: (formId: FormId) => Promise<any>;
}

// Flow actions interface
export interface FlowActions {
  initializeFlow: (flowId: string, startPageId: PageId) => void;
  setCurrentPage: (flowId: string, pageId: PageId) => void;
  addToHistory: (flowId: string, pageId: PageId) => void;
  updateFlowData: (flowId: string, data: Record<string, any>) => void;
  completeFlow: (flowId: string) => void;
  destroyFlow: (flowId: string) => void;
}

// Builder actions interface
export interface BuilderActions {
  createBuilder: (id: string, type: 'form' | 'flow' | 'schema') => void;
  updateBuilderConfig: (id: string, config: any) => void;
  saveBuilder: (id: string) => void;
  destroyBuilder: (id: string) => void;
}

// Plugin actions interface
export interface PluginActions {
  installPlugin: (pluginId: PluginId, version: string, config?: Record<string, any>) => void;
  uninstallPlugin: (pluginId: PluginId) => void;
  enablePlugin: (pluginId: PluginId) => void;
  disablePlugin: (pluginId: PluginId) => void;
  updatePluginConfig: (pluginId: PluginId, config: Record<string, any>) => void;
}

// Renderer actions interface
export interface RendererActions {
  registerRenderer: (rendererId: RendererId, config?: Record<string, any>) => void;
  unregisterRenderer: (rendererId: RendererId) => void;
  setActiveRenderer: (rendererId: RendererId) => void;
  updateRendererConfig: (rendererId: RendererId, config: Record<string, any>) => void;
}

// Main store interface
export interface StreamlineStore {
  // Form state
  forms: Map<FormId, FormState>;
  activeForm: FormId | null;

  // Flow state
  flows: Map<string, FlowState>;

  // Builder state
  builders: Map<string, BuilderState>;

  // Plugin state
  plugins: Map<PluginId, PluginState>;

  // Renderer state
  renderers: Map<RendererId, RendererState>;
  activeRenderer: RendererId;

  // Actions
  actions: {
    forms: FormActions;
    flows: FlowActions;
    builders: BuilderActions;
    plugins: PluginActions;
    renderers: RendererActions;
  };
}

// Form actions implementation
const createFormActions = (set: any, get: () => StreamlineStore): FormActions => ({
  initializeForm: (formId, schema, metadata) => {
    set((state: StreamlineStore) => {
      const formState: FormState = {
        id: formId,
        schema,
        data: {},
        errors: {},
        touched: new Set(),
        dirty: new Set(),
        isSubmitting: false,
        isValidating: false,
        lastValidation: null,
        metadata: metadata || {
          version: '1.0.0',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      state.forms.set(formId, formState);
      if (!state.activeForm) {
        state.activeForm = formId;
      }
    });
  },

  destroyForm: (formId) => {
    set((state: StreamlineStore) => {
      state.forms.delete(formId);
      if (state.activeForm === formId) {
        const remainingForms = Array.from(state.forms.keys());
        state.activeForm = remainingForms.length > 0 ? remainingForms[0] : null;
      }
    });
  },

  resetForm: (formId) => {
    set((state: StreamlineStore) => {
      const form = state.forms.get(formId);
      if (form) {
        form.data = {};
        form.errors = {};
        form.touched.clear();
        form.dirty.clear();
        form.isSubmitting = false;
        form.isValidating = false;
        form.lastValidation = null;
      }
    });
  },

  updateField: (formId, fieldId, value) => {
    set((state: StreamlineStore) => {
      const form = state.forms.get(formId);
      if (form) {
        const previousValue = form.data[fieldId];
        form.data[fieldId] = value;

        if (previousValue !== value) {
          form.dirty.add(fieldId);
        }
      }
    });
  },

  setFieldTouched: (formId, fieldId, touched = true) => {
    set((state: StreamlineStore) => {
      const form = state.forms.get(formId);
      if (form) {
        if (touched) {
          form.touched.add(fieldId);
        } else {
          form.touched.delete(fieldId);
        }
      }
    });
  },

  setFieldError: (formId, fieldId, errors) => {
    set((state: StreamlineStore) => {
      const form = state.forms.get(formId);
      if (form) {
        form.errors[fieldId] = errors;
      }
    });
  },

  clearFieldError: (formId, fieldId) => {
    set((state: StreamlineStore) => {
      const form = state.forms.get(formId);
      if (form) {
        delete form.errors[fieldId];
      }
    });
  },

  setFormSubmitting: (formId, isSubmitting) => {
    set((state: StreamlineStore) => {
      const form = state.forms.get(formId);
      if (form) {
        form.isSubmitting = isSubmitting;
      }
    });
  },

  setFormValidating: (formId, isValidating) => {
    set((state: StreamlineStore) => {
      const form = state.forms.get(formId);
      if (form) {
        form.isValidating = isValidating;
        if (isValidating) {
          form.lastValidation = new Date();
        }
      }
    });
  },

  setFormErrors: (formId, errors) => {
    set((state: StreamlineStore) => {
      const form = state.forms.get(formId);
      if (form) {
        form.errors = errors;
      }
    });
  },

  clearFormErrors: (formId) => {
    set((state: StreamlineStore) => {
      const form = state.forms.get(formId);
      if (form) {
        form.errors = {};
      }
    });
  },

  validateField: async (_formId, _fieldId) => {
    // TODO: Implement field validation logic
    return { isValid: true, errors: [] };
  },

  validateForm: async (_formId) => {
    // TODO: Implement form validation logic
    return { isValid: true, errors: [] };
  },

  submit: async (formId) => {
    const state = get();
    const form = state.forms.get(formId);
    if (!form) {
      throw new Error(`Form ${formId} not found`);
    }

    // TODO: Implement form submission logic
    return form.data;
  },
});

// Flow actions implementation
const createFlowActions = (set: any, _get: () => StreamlineStore): FlowActions => ({
  initializeFlow: (flowId, startPageId) => {
    set((state: StreamlineStore) => {
      const flowState: FlowState = {
        id: flowId,
        currentPageId: startPageId,
        history: [],
        data: {},
        completed: false,
        startTime: new Date(),
      };

      state.flows.set(flowId, flowState);
    });
  },

  setCurrentPage: (flowId, pageId) => {
    set((state: StreamlineStore) => {
      const flow = state.flows.get(flowId);
      if (flow) {
        flow.currentPageId = pageId;
      }
    });
  },

  addToHistory: (flowId, pageId) => {
    set((state: StreamlineStore) => {
      const flow = state.flows.get(flowId);
      if (flow) {
        flow.history.push(pageId);
      }
    });
  },

  updateFlowData: (flowId, data) => {
    set((state: StreamlineStore) => {
      const flow = state.flows.get(flowId);
      if (flow) {
        flow.data = { ...flow.data, ...data };
      }
    });
  },

  completeFlow: (flowId) => {
    set((state: StreamlineStore) => {
      const flow = state.flows.get(flowId);
      if (flow) {
        flow.completed = true;
        flow.endTime = new Date();
      }
    });
  },

  destroyFlow: (flowId) => {
    set((state: StreamlineStore) => {
      state.flows.delete(flowId);
    });
  },
});

// Builder actions implementation
const createBuilderActions = (set: any, _get: () => StreamlineStore): BuilderActions => ({
  createBuilder: (id, type) => {
    set((state: StreamlineStore) => {
      const builderState: BuilderState = {
        id,
        type,
        config: {},
        isDirty: false,
        lastSaved: null,
      };

      state.builders.set(id, builderState);
    });
  },

  updateBuilderConfig: (id, config) => {
    set((state: StreamlineStore) => {
      const builder = state.builders.get(id);
      if (builder) {
        builder.config = { ...builder.config, ...config };
        builder.isDirty = true;
      }
    });
  },

  saveBuilder: (id) => {
    set((state: StreamlineStore) => {
      const builder = state.builders.get(id);
      if (builder) {
        builder.isDirty = false;
        builder.lastSaved = new Date();
      }
    });
  },

  destroyBuilder: (id) => {
    set((state: StreamlineStore) => {
      state.builders.delete(id);
    });
  },
});

// Plugin actions implementation
const createPluginActions = (set: any, _get: () => StreamlineStore): PluginActions => ({
  installPlugin: (pluginId, version, config = {}) => {
    set((state: StreamlineStore) => {
      const pluginState: PluginState = {
        id: pluginId,
        installed: true,
        enabled: true,
        config,
        version,
      };

      state.plugins.set(pluginId, pluginState);
    });
  },

  uninstallPlugin: (pluginId) => {
    set((state: StreamlineStore) => {
      state.plugins.delete(pluginId);
    });
  },

  enablePlugin: (pluginId) => {
    set((state: StreamlineStore) => {
      const plugin = state.plugins.get(pluginId);
      if (plugin) {
        plugin.enabled = true;
      }
    });
  },

  disablePlugin: (pluginId) => {
    set((state: StreamlineStore) => {
      const plugin = state.plugins.get(pluginId);
      if (plugin) {
        plugin.enabled = false;
      }
    });
  },

  updatePluginConfig: (pluginId, config) => {
    set((state: StreamlineStore) => {
      const plugin = state.plugins.get(pluginId);
      if (plugin) {
        plugin.config = { ...plugin.config, ...config };
      }
    });
  },
});

// Renderer actions implementation
const createRendererActions = (set: any, _get: () => StreamlineStore): RendererActions => ({
  registerRenderer: (rendererId, config = {}) => {
    set((state: StreamlineStore) => {
      const rendererState: RendererState = {
        id: rendererId,
        loaded: true,
        config,
      };

      state.renderers.set(rendererId, rendererState);
    });
  },

  unregisterRenderer: (rendererId) => {
    set((state: StreamlineStore) => {
      state.renderers.delete(rendererId);
      if (state.activeRenderer === rendererId) {
        const remainingRenderers = Array.from(state.renderers.keys());
        state.activeRenderer =
          remainingRenderers.length > 0 ? remainingRenderers[0] : ('base' as RendererId);
      }
    });
  },

  setActiveRenderer: (rendererId) => {
    set((state: StreamlineStore) => {
      if (state.renderers.has(rendererId)) {
        state.activeRenderer = rendererId;
      }
    });
  },

  updateRendererConfig: (rendererId, config) => {
    set((state: StreamlineStore) => {
      const renderer = state.renderers.get(rendererId);
      if (renderer) {
        renderer.config = { ...renderer.config, ...config };
      }
    });
  },
});

// Store creation
export const useStreamlineStore = create<StreamlineStore>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        // Initial state
        forms: new Map(),
        activeForm: null,
        flows: new Map(),
        builders: new Map(),
        plugins: new Map(),
        renderers: new Map(),
        activeRenderer: 'base' as RendererId,

        // Actions
        actions: {
          forms: createFormActions(set, get),
          flows: createFlowActions(set, get),
          builders: createBuilderActions(set, get),
          plugins: createPluginActions(set, get),
          renderers: createRendererActions(set, get),
        },
      }))
    ),
    { name: 'streamline-store' }
  )
);

// Selectors for optimized subscriptions
export const selectFormById = (formId: FormId) => (state: StreamlineStore) =>
  state.forms.get(formId);

export const selectFormData = (formId: FormId) => (state: StreamlineStore) =>
  state.forms.get(formId)?.data || {};

export const selectFormErrors = (formId: FormId) => (state: StreamlineStore) =>
  state.forms.get(formId)?.errors || {};

export const selectFieldValue = (formId: FormId, fieldId: FieldId) => (state: StreamlineStore) =>
  state.forms.get(formId)?.data[fieldId];

export const selectFieldError = (formId: FormId, fieldId: FieldId) => (state: StreamlineStore) =>
  state.forms.get(formId)?.errors[fieldId];

export const selectFieldTouched = (formId: FormId, fieldId: FieldId) => (state: StreamlineStore) =>
  state.forms.get(formId)?.touched.has(fieldId) || false;

export const selectFieldDirty = (formId: FormId, fieldId: FieldId) => (state: StreamlineStore) =>
  state.forms.get(formId)?.dirty.has(fieldId) || false;

export const selectFlowById = (flowId: string) => (state: StreamlineStore) =>
  state.flows.get(flowId);

export const selectActiveRenderer = (state: StreamlineStore) => state.activeRenderer;

export const selectPluginById = (pluginId: PluginId) => (state: StreamlineStore) =>
  state.plugins.get(pluginId);

export const selectEnabledPlugins = (state: StreamlineStore) =>
  Array.from(state.plugins.values()).filter((plugin) => plugin.enabled);
