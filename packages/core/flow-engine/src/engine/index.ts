import { PageId, ValidationResult } from '@streamline/form-engine';
import type {
  FlowConfig,
  FlowRuntimeEngine,
  FlowState, NavigationCondition,
  Page,
} from '../types/index';

/**
 * Flow runtime engine implementation
 * Manages the execution of multi-step workflows
 */
export class FlowEngine implements FlowRuntimeEngine {
  private flow: FlowConfig;
  private state: FlowState;

  constructor(flow: FlowConfig, initialData: Record<string, any> = {}) {
    this.flow = flow;
    this.state = {
      id: flow.id,
      currentPageId: flow.navigation.startPageId,
      history: [],
      data: { ...initialData },
      completed: false,
      startTime: new Date(),
    };
  }

  getCurrentPage(): Page | undefined {
    return this.flow.pages.find(p => p.id === this.state.currentPageId);
  }

  canGoNext(): boolean {
    const rules = this.flow.navigation.rules.filter(
      r => r.fromPageId === this.state.currentPageId
    );
    
    return rules.some(rule => this.evaluateCondition(rule.condition));
  }

  canGoBack(): boolean {
    return (this.flow.navigation.allowBack ?? false) && this.state.history.length > 0;
  }

  async goNext(): Promise<boolean> {
    const nextPageId = this.getNextPageId();
    if (!nextPageId) return false;

    // Validate current page data
    const currentPage = this.getCurrentPage();
    if (currentPage && !(await this.validatePageData(currentPage))) {
      return false;
    }

    this.state.history.push(this.state.currentPageId);
    this.state.currentPageId = nextPageId;

    // Check if flow is completed (no more next pages)
    if (!this.canGoNext()) {
      this.state.completed = true;
      this.state.endTime = new Date();
    }

    return true;
  }

  goBack(): boolean {
    if (!this.canGoBack()) return false;

    this.state.currentPageId = this.state.history.pop()!;
    this.state.completed = false;
    this.state.endTime = undefined;
    return true;
  }

  updateData(pageData: Record<string, any>): void {
    this.state.data = { ...this.state.data, ...pageData };
  }

  getData(): Record<string, any> {
    return { ...this.state.data };
  }

  getProgress(): number {
    const totalPages = this.flow.pages.length;
    const currentIndex = this.flow.pages.findIndex(
      p => p.id === this.state.currentPageId
    );
    return totalPages > 0 ? (currentIndex + 1) / totalPages : 0;
  }

  reset(): void {
    this.state = {
      id: this.flow.id,
      currentPageId: this.flow.navigation.startPageId,
      history: [],
      data: {},
      completed: false,
      startTime: new Date(),
    };
  }

  getState(): FlowState {
    return { ...this.state };
  }

  private getNextPageId(): PageId | null {
    const rules = this.flow.navigation.rules.filter(
      r => r.fromPageId === this.state.currentPageId
    );

    // Find first matching conditional rule
    for (const rule of rules.filter(r => r.condition)) {
      if (this.evaluateCondition(rule.condition)) {
        return rule.toPageId;
      }
    }

    // Fall back to default rule
    const defaultRule = rules.find(r => r.isDefault);
    return defaultRule?.toPageId || null;
  }

  private evaluateCondition(condition?: NavigationCondition): boolean {
    if (!condition) return true;

    const fieldValue = condition.field ? this.state.data[condition.field] : undefined;

    let result = false;
    switch (condition.operator) {
      case 'equals':
        result = fieldValue === condition.value;
        break;
      case 'not_equals':
        result = fieldValue !== condition.value;
        break;
      case 'contains':
        result = String(fieldValue).includes(String(condition.value));
        break;
      case 'greater_than':
        result = Number(fieldValue) > Number(condition.value);
        break;
      case 'less_than':
        result = Number(fieldValue) < Number(condition.value);
        break;
      case 'exists':
        result = fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
        break;
    }

    // Handle nested conditions
    if (condition.conditions && condition.conditions.length > 0) {
      const conditionResults = condition.conditions.map(c => this.evaluateCondition(c));
      
      if (condition.logic === 'or') {
        result = result || conditionResults.some(r => r);
      } else {
        result = result && conditionResults.every(r => r);
      }
    }

    return result;
  }

  private async validatePageData(page: Page): Promise<boolean> {
    if (page.type === 'pre-developed' && page.schema) {
      try {
        await page.schema.parseAsync(this.state.data);
        return true;
      } catch {
        return false;
      }
    }

    if (page.type === 'configurable') {
      // Validate configurable fields
      for (const field of page.fields) {
        if (field.required && !this.state.data[field.id]) {
          return false;
        }

        if (field.validation) {
          const isValid = await this.validateField(field, this.state.data[field.id]);
          if (!isValid) return false;
        }
      }
    }

    return true;
  }

  private async validateField(
    field: { validation?: { validator?: (value: any) => Promise<ValidationResult> | ValidationResult } },
    value: any
  ): Promise<boolean> {
    if (!field.validation?.validator) return true;

    try {
      const result = await field.validation.validator(value);
      return result.isValid;
    } catch {
      return false;
    }
  }
}

/**
 * Factory function to create a flow engine instance
 */
export function createFlowEngine(
  flow: FlowConfig,
  initialData?: Record<string, any>
): FlowEngine {
  return new FlowEngine(flow, initialData);
} 