import { FlowEngine } from '../engine/index';
import type { FlowConfig, FlowContext, FlowRuntimeEngine } from '../types/index';

/**
 * Flow runtime utilities and helpers
 */
export class FlowRuntime {
  private engine: FlowRuntimeEngine;

  constructor(flow: FlowConfig, initialData?: Record<string, any>) {
    this.engine = new FlowEngine(flow, initialData);
  }

  /**
   * Get the current flow context
   */
  getContext(): FlowContext {
    const currentPage = this.engine.getCurrentPage();
    return {
      currentPageId: currentPage?.id!,
      totalPages: 0, // This would need to be calculated based on flow structure
      canGoBack: this.engine.canGoBack(),
      canGoNext: this.engine.canGoNext(),
      progress: this.engine.getProgress(),
    };
  }

  /**
   * Execute the next step in the flow
   */
  async executeNext(): Promise<boolean> {
    return this.engine.goNext();
  }

  /**
   * Execute the previous step in the flow
   */
  executePrevious(): boolean {
    return this.engine.goBack();
  }

  /**
   * Update flow data
   */
  updateData(data: Record<string, any>): void {
    this.engine.updateData(data);
  }

  /**
   * Get current flow data
   */
  getData(): Record<string, any> {
    return this.engine.getData();
  }

  /**
   * Reset the flow to initial state
   */
  reset(): void {
    this.engine.reset();
  }

  /**
   * Get the underlying engine instance
   */
  getEngine(): FlowRuntimeEngine {
    return this.engine;
  }
}

/**
 * Factory function to create a flow runtime instance
 */
export function createFlowRuntime(
  flow: FlowConfig,
  initialData?: Record<string, any>
): FlowRuntime {
  return new FlowRuntime(flow, initialData);
}

/**
 * Flow execution result
 */
export interface FlowExecutionResult {
  readonly success: boolean;
  readonly data?: Record<string, any>;
  readonly error?: Error;
  readonly completedAt?: Date;
}

/**
 * Flow execution options
 */
export interface FlowExecutionOptions {
  readonly onStepChange?: (context: FlowContext) => void;
  readonly onComplete?: (data: Record<string, any>) => void;
  readonly onError?: (error: Error) => void;
  readonly validateSteps?: boolean;
}

/**
 * Execute a complete flow with options
 */
export async function executeFlow(
  flow: FlowConfig,
  options: FlowExecutionOptions = {}
): Promise<FlowExecutionResult> {
  const runtime = createFlowRuntime(flow);
  
  try {
    while (runtime.getEngine().canGoNext()) {
      const success = await runtime.executeNext();
      
      if (!success) {
        throw new Error('Flow execution failed');
      }
      
      options.onStepChange?.(runtime.getContext());
    }
    
    const data = runtime.getData();
    options.onComplete?.(data);
    
    return {
      success: true,
      data,
      completedAt: new Date(),
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    options.onError?.(err);
    
    return {
      success: false,
      error: err,
    };
  }
} 