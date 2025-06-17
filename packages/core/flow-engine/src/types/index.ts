import { ConditionalConfig, FieldId, PageId, ValidationResult } from '@streamline/form-engine';
import type { z } from 'zod';

// Re-export types from form-engine for internal use
// Flow runtime context
export interface FlowContext {
  readonly currentPageId: PageId;
  readonly totalPages: number;
  readonly canGoBack: boolean;
  readonly canGoNext: boolean;
  readonly progress?: number;
  readonly metadata?: Record<string, any>;
}

// Flow runtime engine interface
export interface FlowRuntimeEngine {
  getCurrentPage(): Page | undefined;
  canGoNext(): boolean;
  canGoBack(): boolean;
  goNext(): Promise<boolean>;
  goBack(): boolean;
  updateData(pageData: Record<string, any>): void;
  getData(): Record<string, any>;
  getProgress(): number;
  reset(): void;
}

// Navigation evaluation
export interface NavigationEvaluator {
  evaluateCondition(
    condition: NavigationCondition | undefined,
    data: Record<string, any>
  ): boolean;
  getNextPageId(
    currentPageId: PageId,
    rules: NavigationRule[],
    data: Record<string, any>
  ): PageId | null;
}

// Flow state
export interface FlowState {
  readonly id: string;
  currentPageId: PageId;
  readonly history: PageId[];
  data: Record<string, any>;
  completed: boolean;
  readonly startTime: Date;
  endTime?: Date;
  readonly metadata?: FlowMetadata;
}

export interface FlowMetadata {
  readonly version?: string;
  readonly sessionId?: string;
  readonly userId?: string;
  readonly [key: string]: any;
}

// Flow-specific types that might be defined in form-engine but used here
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

export interface ConfigurableFieldConfig {
  readonly id: FieldId;
  readonly type: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly customId?: string;
  readonly validation?: FieldValidationConfig;
  readonly conditional?: ConditionalConfig;
  readonly metadata?: FieldMetadata;
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

export interface FieldValidationConfig {
  readonly validator?: (value: any) => Promise<ValidationResult> | ValidationResult;
  readonly async?: boolean;
  readonly debounce?: number;
  readonly dependencies?: FieldId[];
}

export interface FieldMetadata {
  readonly customId?: string;
  readonly category?: string;
  readonly tags?: string[];
  readonly [key: string]: any;
} 