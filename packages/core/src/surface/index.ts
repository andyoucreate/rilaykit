import {
  type ActionNode,
  type ConditionDescriptor,
  type ConditionsDescriptor,
  type FieldNode,
  type JsonValue,
  RuntimeExecutionError,
  type RuntimeGraph,
  type RuntimeStep,
  type ValidationDescriptor,
} from '@rilaykit/schema';

export type SurfaceValues = Record<string, unknown>;
export type SurfaceErrors = Record<string, string[]>;
export type SurfaceStatus = 'idle' | 'validating' | 'dispatching';

export interface SurfaceFieldState {
  readonly id: string;
  readonly value: unknown;
  readonly errors: string[];
  readonly touched: boolean;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly required: boolean;
  readonly readonly: boolean;
}

export interface SurfaceSnapshot {
  readonly surfaceId: string;
  readonly mode: RuntimeGraph['mode'];
  readonly currentStepId: string;
  readonly currentStepIndex: number;
  readonly values: SurfaceValues;
  readonly errors: SurfaceErrors;
  readonly touched: Record<string, boolean>;
  readonly visibleFields: Record<string, boolean>;
  readonly status: SurfaceStatus;
}

export interface SurfaceValidationContext {
  readonly field: FieldNode;
  readonly values: SurfaceValues;
  readonly snapshot: SurfaceSnapshot;
}

export type SurfaceValidationResult = string | undefined | null | readonly string[];

export type SurfaceValidationHandler = (
  value: unknown,
  descriptor: ValidationDescriptor,
  context: SurfaceValidationContext
) => SurfaceValidationResult | Promise<SurfaceValidationResult>;

export interface SurfaceActionContext {
  readonly action: ActionNode;
  readonly snapshot: SurfaceSnapshot;
  readonly runtime: SurfaceRuntime;
}

export type SurfaceActionHandler = (context: SurfaceActionContext) => void | Promise<void>;

export interface CreateSurfaceRuntimeOptions {
  readonly initialValues?: SurfaceValues;
  readonly validationHandlers?: Record<string, SurfaceValidationHandler>;
  readonly actionHandlers?: Record<string, SurfaceActionHandler>;
}

export type SurfaceRuntimeSubscriber = (snapshot: SurfaceSnapshot) => void;

export interface SurfaceRuntime {
  readonly graph: RuntimeGraph;
  getSnapshot(): SurfaceSnapshot;
  subscribe(subscriber: SurfaceRuntimeSubscriber): () => void;
  setFieldValue(fieldId: string, value: unknown): void;
  getFieldState(fieldId: string): SurfaceFieldState;
  validateField(fieldId: string): Promise<boolean>;
  validateStep(stepId?: string): Promise<boolean>;
  goNext(): Promise<boolean>;
  goPrevious(): Promise<boolean>;
  goToStep(stepId: string): Promise<boolean>;
  dispatchAction(actionId: string): Promise<void>;
}

export function createSurfaceRuntime(
  graph: RuntimeGraph,
  options: CreateSurfaceRuntimeOptions = {}
): SurfaceRuntime {
  return new SurfaceRuntimeImpl(graph, options);
}

class SurfaceRuntimeImpl implements SurfaceRuntime {
  readonly graph: RuntimeGraph;

  private readonly validationHandlers: Record<string, SurfaceValidationHandler>;
  private readonly actionHandlers: Record<string, SurfaceActionHandler>;
  private readonly subscribers = new Set<SurfaceRuntimeSubscriber>();
  private values: SurfaceValues;
  private errors: SurfaceErrors = {};
  private touched: Record<string, boolean> = {};
  private currentStepIndex = 0;
  private status: SurfaceStatus = 'idle';

  constructor(graph: RuntimeGraph, options: CreateSurfaceRuntimeOptions) {
    this.graph = graph;
    this.values = { ...(options.initialValues ?? {}) };
    this.validationHandlers = options.validationHandlers ?? {};
    this.actionHandlers = options.actionHandlers ?? {};
  }

  getSnapshot(): SurfaceSnapshot {
    const currentStep = this.getCurrentStep();

    return {
      surfaceId: this.graph.surfaceId,
      mode: this.graph.mode,
      currentStepId: currentStep.id,
      currentStepIndex: this.currentStepIndex,
      values: { ...this.values },
      errors: cloneErrors(this.errors),
      touched: { ...this.touched },
      visibleFields: this.getVisibleFields(),
      status: this.status,
    };
  }

  subscribe(subscriber: SurfaceRuntimeSubscriber): () => void {
    this.subscribers.add(subscriber);

    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  setFieldValue(fieldId: string, value: unknown): void {
    this.assertFieldExists(fieldId);
    this.values = { ...this.values, [fieldId]: value };
    this.touched = { ...this.touched, [fieldId]: true };
    this.errors = omitKey(this.errors, fieldId);
    this.emit();
  }

  getFieldState(fieldId: string): SurfaceFieldState {
    const field = this.assertFieldExists(fieldId);

    return {
      id: fieldId,
      value: this.values[fieldId],
      errors: this.errors[fieldId] ?? [],
      touched: this.touched[fieldId] ?? false,
      visible: this.evaluateConditionSet(field.conditions, 'visible', true),
      disabled: this.evaluateConditionSet(field.conditions, 'disabled', false),
      required: this.evaluateConditionSet(field.conditions, 'required', false),
      readonly: this.evaluateConditionSet(field.conditions, 'readonly', false),
    };
  }

  async validateField(fieldId: string): Promise<boolean> {
    const field = this.assertFieldExists(fieldId);

    if (!this.getFieldState(fieldId).visible) {
      this.errors = omitKey(this.errors, fieldId);
      this.emit();
      return true;
    }

    const validationErrors: string[] = [];

    this.status = 'validating';
    this.emit();

    for (const descriptor of field.validation ?? []) {
      const handler = this.validationHandlers[descriptor.type];
      if (!handler) {
        continue;
      }

      const result = await handler(this.values[fieldId], descriptor, {
        field,
        values: { ...this.values },
        snapshot: this.getSnapshot(),
      });
      validationErrors.push(...normalizeValidationResult(result));
    }

    this.status = 'idle';
    this.errors =
      validationErrors.length > 0
        ? { ...this.errors, [fieldId]: validationErrors }
        : omitKey(this.errors, fieldId);
    this.emit();

    return validationErrors.length === 0;
  }

  async validateStep(stepId = this.getCurrentStep().id): Promise<boolean> {
    const step = this.getStepById(stepId);
    const fields = getStepFields(step);
    const results = await Promise.all(fields.map((field) => this.validateField(field.id)));

    return results.every(Boolean);
  }

  async goNext(): Promise<boolean> {
    const currentStepValid = await this.validateStep();
    if (!currentStepValid) {
      return false;
    }

    const nextIndex = this.findNextVisibleStepIndex(this.currentStepIndex + 1);
    if (nextIndex === undefined) {
      return false;
    }

    this.currentStepIndex = nextIndex;
    this.emit();
    return true;
  }

  async goPrevious(): Promise<boolean> {
    const previousIndex = this.findPreviousVisibleStepIndex(this.currentStepIndex - 1);
    if (previousIndex === undefined) {
      return false;
    }

    this.currentStepIndex = previousIndex;
    this.emit();
    return true;
  }

  async goToStep(stepId: string): Promise<boolean> {
    const nextIndex = this.graph.steps.findIndex((step) => step.id === stepId);
    if (nextIndex === -1 || !this.isStepVisible(this.graph.steps[nextIndex])) {
      return false;
    }

    this.currentStepIndex = nextIndex;
    this.emit();
    return true;
  }

  async dispatchAction(actionId: string): Promise<void> {
    const action = this.graph.indexes.actions[actionId];
    if (!action) {
      throw new RuntimeExecutionError(`Unknown action "${actionId}"`, {
        path: ['actions', actionId],
      });
    }

    if (action.type === 'next') {
      await this.goNext();
      return;
    }

    if (action.type === 'previous') {
      await this.goPrevious();
      return;
    }

    if (!action.handler) {
      return;
    }

    const handler = this.actionHandlers[action.handler];
    if (!handler) {
      throw new RuntimeExecutionError(`Missing action handler "${action.handler}"`, {
        path: ['actions', actionId, 'handler'],
      });
    }

    this.status = 'dispatching';
    this.emit();

    try {
      await handler({
        action,
        snapshot: this.getSnapshot(),
        runtime: this,
      });
    } finally {
      this.status = 'idle';
      this.emit();
    }
  }

  private assertFieldExists(fieldId: string): FieldNode {
    const field = this.graph.indexes.fields[fieldId];
    if (!field) {
      throw new RuntimeExecutionError(`Unknown field "${fieldId}"`, {
        path: ['fields', fieldId],
      });
    }
    return field;
  }

  private getCurrentStep(): RuntimeStep {
    return this.graph.steps[this.currentStepIndex] ?? this.graph.steps[0];
  }

  private getStepById(stepId: string): RuntimeStep {
    const step = this.graph.steps.find((candidate) => candidate.id === stepId);
    if (!step) {
      throw new RuntimeExecutionError(`Unknown step "${stepId}"`, {
        path: ['steps', stepId],
      });
    }
    return step;
  }

  private getVisibleFields(): Record<string, boolean> {
    return Object.fromEntries(
      Object.keys(this.graph.indexes.fields).map((fieldId) => [
        fieldId,
        this.getFieldState(fieldId).visible,
      ])
    );
  }

  private evaluateConditionSet(
    conditions: ConditionsDescriptor | undefined,
    key: keyof ConditionsDescriptor,
    fallback: boolean
  ): boolean {
    const condition = conditions?.[key];
    return condition ? evaluateCondition(condition, this.values) : fallback;
  }

  private isStepVisible(step: RuntimeStep): boolean {
    return this.evaluateConditionSet(step.conditions, 'visible', true);
  }

  private findNextVisibleStepIndex(startIndex: number): number | undefined {
    const nextIndex = this.graph.steps.findIndex(
      (step, index) => index >= startIndex && this.isStepVisible(step)
    );

    return nextIndex === -1 ? undefined : nextIndex;
  }

  private findPreviousVisibleStepIndex(startIndex: number): number | undefined {
    for (let index = startIndex; index >= 0; index -= 1) {
      if (this.isStepVisible(this.graph.steps[index])) {
        return index;
      }
    }

    return undefined;
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const subscriber of this.subscribers) {
      subscriber(snapshot);
    }
  }
}

function getStepFields(step: RuntimeStep): FieldNode[] {
  return step.nodes.flatMap((node) => {
    if (node.kind === 'field') {
      return [node];
    }

    if (node.kind === 'group') {
      return getStepFields({ ...step, nodes: node.nodes });
    }

    return [];
  });
}

function evaluateCondition(condition: ConditionDescriptor, values: SurfaceValues): boolean {
  const fieldValue = getFieldValue(values, condition.field);

  switch (condition.operator) {
    case 'equals':
      return fieldValue === condition.value;
    case 'notEquals':
      return fieldValue !== condition.value;
    case 'greaterThan':
      return (
        typeof fieldValue === 'number' &&
        typeof condition.value === 'number' &&
        fieldValue > condition.value
      );
    case 'lessThan':
      return (
        typeof fieldValue === 'number' &&
        typeof condition.value === 'number' &&
        fieldValue < condition.value
      );
    case 'greaterThanOrEqual':
      return (
        typeof fieldValue === 'number' &&
        typeof condition.value === 'number' &&
        fieldValue >= condition.value
      );
    case 'lessThanOrEqual':
      return (
        typeof fieldValue === 'number' &&
        typeof condition.value === 'number' &&
        fieldValue <= condition.value
      );
    case 'contains':
      return containsValue(fieldValue, condition.value);
    case 'notContains':
      return !containsValue(fieldValue, condition.value);
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(fieldValue as JsonValue);
    case 'notIn':
      return Array.isArray(condition.value) && !condition.value.includes(fieldValue as JsonValue);
    case 'matches':
      return (
        typeof fieldValue === 'string' &&
        typeof condition.value === 'string' &&
        new RegExp(condition.value).test(fieldValue)
      );
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;
    case 'notExists':
      return fieldValue === undefined || fieldValue === null;
    default: {
      const exhaustive: never = condition.operator;
      throw new Error(`Unhandled condition operator: ${exhaustive}`);
    }
  }
}

function containsValue(fieldValue: unknown, expectedValue: unknown): boolean {
  if (typeof fieldValue === 'string' && typeof expectedValue === 'string') {
    return fieldValue.includes(expectedValue);
  }

  if (Array.isArray(fieldValue)) {
    return fieldValue.includes(expectedValue);
  }

  return false;
}

function getFieldValue(values: SurfaceValues, fieldPath: string): unknown {
  if (fieldPath in values) {
    return values[fieldPath];
  }

  return fieldPath.split('.').reduce<unknown>((value, part) => {
    if (value && typeof value === 'object' && part in value) {
      return (value as Record<string, unknown>)[part];
    }

    return undefined;
  }, values);
}

function normalizeValidationResult(result: SurfaceValidationResult): string[] {
  if (typeof result === 'string') {
    return [result];
  }

  if (Array.isArray(result)) {
    return [...result];
  }

  return [];
}

function cloneErrors(errors: SurfaceErrors): SurfaceErrors {
  return Object.fromEntries(
    Object.entries(errors).map(([fieldId, fieldErrors]) => [fieldId, [...fieldErrors]])
  );
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _omitted, ...rest } = record;
  return rest;
}
