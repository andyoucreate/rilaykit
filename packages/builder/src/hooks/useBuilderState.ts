import type { ril } from '@rilaykit/core';
import { useMemo, useState } from 'react';
import { visualBuilder } from '../builders/visual-builder';

/**
 * Builder state with history tracking
 */
interface BuilderState<C extends Record<string, any>> {
  readonly builder: visualBuilder<C>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/**
 * Builder state actions
 */
interface BuilderActions<C extends Record<string, any>> {
  readonly addComponent: (type: keyof C & string, props?: any) => void;
  readonly removeField: (fieldId: string) => void;
  readonly updateField: (fieldId: string, props: Record<string, any>) => void;
  readonly selectField: (fieldId?: string) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly clear: () => void;
  readonly setBuilder: (builder: visualBuilder<C>) => void;
}

/**
 * Result of useBuilderState hook
 */
export interface UseBuilderStateResult<C extends Record<string, any>> {
  readonly state: BuilderState<C>;
  readonly actions: BuilderActions<C>;
}

/**
 * Custom hook for managing visual builder state
 *
 * Provides immutable state management with undo/redo support.
 * All operations return new builder instances following Rilay philosophy.
 *
 * @param rilConfig - RilayKit configuration
 * @param initialBuilder - Optional initial builder instance
 * @returns Builder state and actions
 *
 * @example
 * ```typescript
 * function MyBuilder() {
 *   const { state, actions } = useBuilderState(rilConfig);
 *
 *   return (
 *     <div>
 *       <button onClick={() => actions.addComponent('text')}>
 *         Add Text Field
 *       </button>
 *       <button onClick={actions.undo} disabled={!state.canUndo}>
 *         Undo
 *       </button>
 *       <button onClick={actions.redo} disabled={!state.canRedo}>
 *         Redo
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useBuilderState<C extends Record<string, any>>(
  rilConfig: ril<C>,
  initialBuilder?: visualBuilder<C>
): UseBuilderStateResult<C> {
  // Initialize builder state
  const [builder, setBuilder] = useState<visualBuilder<C>>(() => {
    return initialBuilder || visualBuilder.create(rilConfig);
  });

  // Memoized state
  const state = useMemo<BuilderState<C>>(
    () => ({
      builder,
      canUndo: builder.canUndo(),
      canRedo: builder.canRedo(),
    }),
    [builder]
  );

  // Actions (stable references with useCallback)
  const actions = useMemo<BuilderActions<C>>(
    () => ({
      addComponent: (type: keyof C & string, props?: any) => {
        setBuilder((current) => current.addComponent(type, props));
      },

      removeField: (fieldId: string) => {
        setBuilder((current) => current.removeField(fieldId));
      },

      updateField: (fieldId: string, props: Record<string, any>) => {
        setBuilder((current) => current.updateField(fieldId, props));
      },

      selectField: (fieldId?: string) => {
        setBuilder((current) => current.selectField(fieldId));
      },

      undo: () => {
        setBuilder((current) => current.undo());
      },

      redo: () => {
        setBuilder((current) => current.redo());
      },

      clear: () => {
        setBuilder((current) => current.clear());
      },

      setBuilder: (newBuilder: visualBuilder<C>) => {
        setBuilder(newBuilder);
      },
    }),
    []
  );

  return { state, actions };
}

/**
 * Hook for accessing builder statistics
 *
 * @param builder - Visual builder instance
 * @returns Form statistics
 */
export function useBuilderStats<C extends Record<string, any>>(builder: visualBuilder<C>) {
  return useMemo(() => builder.getStats(), [builder]);
}

/**
 * Hook for accessing selected field
 *
 * @param builder - Visual builder instance
 * @returns Selected field configuration or undefined
 */
export function useSelectedField<C extends Record<string, any>>(builder: visualBuilder<C>) {
  return useMemo(() => builder.getSelectedField(), [builder]);
}
