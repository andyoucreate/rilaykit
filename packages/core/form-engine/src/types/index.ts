import type { z } from 'zod';

// Branded types for type safety
export type FormId = string & { readonly __brand: 'FormId' };
export type PageId = string & { readonly __brand: 'PageId' };
export type ComponentId = string & { readonly __brand: 'ComponentId' };
export type FieldId = string & { readonly __brand: 'FieldId' };
export type RendererId = string & { readonly __brand: 'RendererId' };
export type PluginId = string & { readonly __brand: 'PluginId' };

// Helper functions to create branded types
export const createFormId = (id: string): FormId => id as FormId;
export const createPageId = (id: string): PageId => id as PageId;
export const createComponentId = (id: string): ComponentId => id as ComponentId;
export const createFieldId = (id: string): FieldId => id as FieldId;
export const createRendererId = (id: string): RendererId => id as RendererId;
export const createPluginId = (id: string): PluginId => id as PluginId;

// Field types
export type FieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'boolean'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'multiselect'
  | 'textarea'
  | 'date'
  | 'datetime'
  | 'time'
  | 'file'
  | 'url'
  | 'tel'
  | 'color'
  | 'range'
  | 'hidden';

// Validation result
export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly path?: (string | number)[];
}

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: ValidationError[];
  readonly warnings?: ValidationError[];
}

// Validation function type
export type ValidatorFunction<T = any> = (
  value: T,
  context: ValidationContext
) => Promise<ValidationResult> | ValidationResult;

export interface ValidationContext {
  readonly formId: FormId;
  readonly fieldId: FieldId;
  readonly formData: Record<string, any>;
  readonly metadata?: Record<string, any>;
}

// Field configuration
export interface FieldConfig {
  readonly id: FieldId;
  readonly type: FieldType;
  readonly label: string;
  readonly placeholder?: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly readonly?: boolean;
  readonly defaultValue?: any;
  readonly validation?: FieldValidationConfig;
  readonly conditional?: ConditionalConfig;
  readonly metadata?: FieldMetadata;
}

export interface FieldValidationConfig {
  readonly validator?: ValidatorFunction;
  readonly async?: boolean;
  readonly debounce?: number;
  readonly dependencies?: FieldId[];
}

export interface ConditionalConfig {
  readonly field: FieldId;
  readonly operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists';
  readonly value?: any;
  readonly logic?: 'and' | 'or';
  readonly conditions?: ConditionalConfig[];
}

export interface FieldMetadata {
  readonly customId?: string;
  readonly category?: string;
  readonly tags?: string[];
  readonly [key: string]: any;
}

// Form configuration
export interface FormConfig {
  readonly id: FormId;
  readonly name?: string;
  readonly description?: string;
  readonly fields: FieldConfig[];
  readonly groups?: GroupConfig[];
  readonly metadata?: FormMetadata;
}

export interface GroupConfig {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly fields: FieldId[];
  readonly conditional?: ConditionalConfig;
}

export interface FormMetadata {
  readonly version?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly author?: string;
  readonly tags?: string[];
  readonly [key: string]: any;
}

// Streamline configuration
export interface StreamlineConfig<TSchema extends z.ZodSchema = z.ZodSchema> {
  readonly id: FormId;
  readonly schema: TSchema;
  readonly renderer: RendererId;
  readonly plugins?: PluginId[];
  readonly flow?: FlowConfig<TSchema>;
  readonly validation?: ValidationConfig<TSchema>;
  readonly rendererProps?: Record<string, any>;
  readonly form?: FormConfig;
}

export interface ValidationConfig<TSchema extends z.ZodSchema = z.ZodSchema> {
  readonly mode?: 'onChange' | 'onBlur' | 'onSubmit';
  readonly reValidateMode?: 'onChange' | 'onBlur' | 'onSubmit';
  readonly resolver?: (schema: TSchema) => ValidatorFunction;
  readonly criteriaMode?: 'firstError' | 'all';
}

// Flow configuration types
export interface FlowConfig<TSchema extends z.ZodSchema = z.ZodSchema> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly pages: Page[];
  readonly navigation: FlowNavigationConfig;
  readonly settings: FlowSettings;
  readonly schema?: TSchema;
}

export interface FlowNavigationConfig {
  readonly startPageId: PageId;
  readonly rules: NavigationRule[];
  readonly allowBack?: boolean;
  readonly showProgress?: boolean;
}

export interface NavigationRule {
  readonly fromPageId: PageId;
  readonly toPageId: PageId;
  readonly condition?: NavigationCondition;
  readonly isDefault?: boolean;
}

export interface NavigationCondition {
  readonly field?: FieldId;
  readonly operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists';
  readonly value?: any;
  readonly logic?: 'and' | 'or';
  readonly conditions?: NavigationCondition[];
}

export interface FlowSettings {
  readonly saveProgress?: boolean;
  readonly allowExit?: boolean;
  readonly theme?: string;
  readonly timeout?: number;
}

// Page types
export interface PageConfig {
  readonly id: PageId;
  readonly type: PageType;
  readonly title: string;
  readonly description?: string;
  readonly metadata?: PageMetadata;
}

export type PageType = 'configurable' | 'pre-developed';

export interface ConfigurablePage extends PageConfig {
  readonly type: 'configurable';
  readonly fields: ConfigurableFieldConfig[];
  readonly layout?: LayoutConfig;
  readonly validation?: PageValidationConfig;
}

export interface PreDevelopedPage extends PageConfig {
  readonly type: 'pre-developed';
  readonly componentId: string;
  readonly props?: Record<string, any>;
  readonly schema?: z.ZodSchema;
}

export type Page = ConfigurablePage | PreDevelopedPage;

export interface ConfigurableFieldConfig extends FieldConfig {
  readonly customId?: string;
  readonly textConfig?: TextFieldConfig;
  readonly numberConfig?: NumberFieldConfig;
  readonly selectConfig?: SelectFieldConfig;
  readonly dateConfig?: DateFieldConfig;
}

export interface TextFieldConfig {
  readonly maxLength?: number;
  readonly minLength?: number;
  readonly pattern?: string;
  readonly multiline?: boolean;
}

export interface NumberFieldConfig {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly format?: 'integer' | 'decimal' | 'currency' | 'percentage';
}

export interface SelectFieldConfig {
  readonly options: SelectOption[];
  readonly multiple?: boolean;
  readonly searchable?: boolean;
}

export interface SelectOption {
  readonly value: string | number;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface DateFieldConfig {
  readonly format?: string;
  readonly minDate?: Date;
  readonly maxDate?: Date;
  readonly includeTime?: boolean;
}

export interface LayoutConfig {
  readonly columns?: number;
  readonly gap?: string;
  readonly direction?: 'row' | 'column';
}

export interface PageValidationConfig {
  readonly mode?: 'onChange' | 'onBlur' | 'onSubmit';
  readonly stopOnFirstError?: boolean;
}

export interface PageMetadata {
  readonly category?: string;
  readonly tags?: string[];
  readonly [key: string]: any;
}

// Event system types
export interface StreamlineEvents<TData = any> {
  // Form lifecycle events
  'form:initialize': { formId: FormId; schema: z.ZodSchema };
  'form:submit': { formId: FormId; data: TData };
  'form:reset': { formId: FormId };
  'form:destroy': { formId: FormId };

  // Field events
  'field:change': { formId: FormId; fieldId: FieldId; value: any; previousValue: any };
  'field:focus': { formId: FormId; fieldId: FieldId };
  'field:blur': { formId: FormId; fieldId: FieldId };
  'field:validate': { formId: FormId; fieldId: FieldId; result: ValidationResult };

  // Flow events
  'flow:start': { formId: FormId; flowId: string };
  'flow:step-change': { formId: FormId; from: PageId; to: PageId };
  'flow:complete': { formId: FormId; data: TData };
  'flow:abort': { formId: FormId; reason: string };

  // Builder events
  'builder:component-add': { builderId: string; component: ComponentConfig };
  'builder:component-remove': { builderId: string; componentId: ComponentId };
  'builder:component-update': {
    builderId: string;
    componentId: ComponentId;
    changes: Partial<ComponentConfig>;
  };
  'builder:save': { builderId: string; config: FormConfig };
  'builder:preview': { builderId: string; config: FormConfig };

  // Plugin events
  'plugin:install': { pluginId: PluginId; version: string };
  'plugin:uninstall': { pluginId: PluginId };
  'plugin:error': { pluginId: PluginId; error: Error };
}

export interface ComponentConfig {
  readonly id: ComponentId;
  readonly type: string;
  readonly props: Record<string, any>;
  readonly children?: ComponentConfig[];
}

// Event subscription types
export type UnsubscribeFunction = () => void;

export interface EventSubscriptionOptions {
  readonly once?: boolean;
  readonly priority?: number;
}

export interface EventHistoryEntry {
  readonly timestamp: number;
  readonly event: string;
  readonly payload: any;
  readonly duration?: number;
}

// State types
export interface FormState {
  readonly id: FormId;
  readonly schema: z.ZodSchema;
  data: Record<string, any>;
  errors: Record<string, ValidationError[]>;
  readonly touched: Set<FieldId>;
  readonly dirty: Set<FieldId>;
  isSubmitting: boolean;
  isValidating: boolean;
  lastValidation: Date | null;
  readonly metadata: FormMetadata;
}

export interface FlowState {
  readonly id: string;
  currentPageId: PageId;
  readonly history: PageId[];
  data: Record<string, any>;
  completed: boolean;
  readonly startTime: Date;
  endTime?: Date;
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type InferSchemaType<T> = T extends z.ZodSchema<infer U> ? U : never;

export type InferFieldType<T> = T extends z.ZodString
  ? TextFieldConfig
  : T extends z.ZodNumber
    ? NumberFieldConfig
    : T extends z.ZodBoolean
      ? { readonly type: 'checkbox' }
      : T extends z.ZodEnum<any>
        ? SelectFieldConfig
        : T extends z.ZodArray<infer U>
          ? { readonly type: 'array'; readonly itemType: InferFieldType<U> }
          : T extends z.ZodObject<any>
            ? { readonly type: 'object'; readonly fields: Record<string, FieldConfig> }
            : { readonly type: 'generic' };
