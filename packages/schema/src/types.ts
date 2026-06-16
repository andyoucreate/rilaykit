export type SurfaceMode = 'screen' | 'flow';
export type SurfaceNodeKind = 'field' | 'content' | 'action' | 'group' | 'slot';
export type JsonObject = Record<string, unknown>;

export interface BaseSurfaceSchema {
  readonly version: 2;
  readonly kind: 'surface';
  readonly mode: SurfaceMode;
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly metadata?: JsonObject;
}

export interface ScreenSurfaceSchema extends BaseSurfaceSchema {
  readonly mode: 'screen';
  readonly nodes: SurfaceNode[];
}

export interface FlowSurfaceSchema extends BaseSurfaceSchema {
  readonly mode: 'flow';
  readonly steps: SurfaceStep[];
}

export type SurfaceSchema = ScreenSurfaceSchema | FlowSurfaceSchema;

export interface SurfaceStep {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly metadata?: JsonObject;
  readonly conditions?: ConditionsDescriptor;
  readonly nodes: SurfaceNode[];
}

export type SurfaceNode = FieldNode | ContentNode | ActionNode | GroupNode | SlotNode;

export interface BaseNode {
  readonly kind: SurfaceNodeKind;
  readonly type: string;
  readonly props?: JsonObject;
  readonly conditions?: ConditionsDescriptor;
  readonly metadata?: JsonObject;
}

export interface FieldNode extends BaseNode {
  readonly kind: 'field';
  readonly id: string;
  readonly validation?: ValidationDescriptor[];
  readonly defaultValue?: unknown;
}

export interface ContentNode extends BaseNode {
  readonly kind: 'content';
}

export interface ActionNode extends BaseNode {
  readonly kind: 'action';
  readonly id?: string;
  readonly handler?: string;
}

export interface GroupNode extends BaseNode {
  readonly kind: 'group';
  readonly nodes: SurfaceNode[];
}

export interface SlotNode extends BaseNode {
  readonly kind: 'slot';
}

export interface ValidationDescriptor {
  readonly type: string;
  readonly message?: string;
  readonly params?: JsonObject;
}

export interface ConditionDescriptor {
  readonly field: string;
  readonly operator:
    | 'equals'
    | 'notEquals'
    | 'greaterThan'
    | 'lessThan'
    | 'greaterThanOrEqual'
    | 'lessThanOrEqual'
    | 'contains'
    | 'notContains'
    | 'in'
    | 'notIn'
    | 'exists'
    | 'notExists'
    | 'matches';
  readonly value?: unknown;
}

export interface ConditionsDescriptor {
  readonly visible?: ConditionDescriptor;
  readonly disabled?: ConditionDescriptor;
  readonly required?: ConditionDescriptor;
  readonly readonly?: ConditionDescriptor;
  readonly skippable?: ConditionDescriptor;
}

export interface JsonSchemaObject {
  readonly [key: string]: unknown;
}

export interface RegistryManifest {
  readonly version: 1;
  readonly fields?: Record<string, FieldManifestEntry>;
  readonly content?: Record<string, NodeManifestEntry>;
  readonly actions?: Record<string, ActionManifestEntry>;
  readonly groups?: Record<string, NodeManifestEntry>;
  readonly slots?: Record<string, NodeManifestEntry>;
}

export interface NodeManifestEntry {
  readonly kind: SurfaceNodeKind;
  readonly propsSchema?: JsonSchemaObject;
  readonly description?: string;
  readonly examples?: unknown[];
  readonly capabilities?: JsonObject;
}

export interface FieldManifestEntry extends NodeManifestEntry {
  readonly kind: 'field';
  readonly valueSchema?: JsonSchemaObject;
  readonly validations?: string[];
}

export interface ActionManifestEntry extends NodeManifestEntry {
  readonly kind: 'action';
  readonly handlerRequired?: boolean;
}

export interface RuntimeGraph {
  readonly surfaceId: string;
  readonly mode: SurfaceMode;
  readonly steps: RuntimeStep[];
  readonly indexes: RuntimeGraphIndexes;
}

export interface RuntimeStep {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly metadata?: JsonObject;
  readonly conditions?: ConditionsDescriptor;
  readonly nodes: SurfaceNode[];
  readonly implicit?: boolean;
}

export interface RuntimeGraphIndexes {
  readonly fields: Record<string, FieldNode>;
  readonly actions: Record<string, ActionNode>;
  readonly nodesByPath: Record<string, SurfaceNode | SurfaceStep>;
}

export interface CompiledSurface {
  readonly graph: RuntimeGraph;
}
