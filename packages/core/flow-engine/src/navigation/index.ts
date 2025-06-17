import { PageId } from '@streamline/form-engine';
import { ConditionEvaluator } from '../conditions/index';
import type {
  FlowNavigationConfig,
  NavigationCondition,
  NavigationRule,
} from '../types/index';

/**
 * Mutable versions for building
 */
type MutableNavigationRule = {
  fromPageId?: PageId;
  toPageId?: PageId;
  condition?: NavigationCondition;
  isDefault?: boolean;
};

type MutableFlowNavigationConfig = {
  startPageId?: PageId;
  rules?: NavigationRule[];
  allowBack?: boolean;
  showProgress?: boolean;
};

/**
 * Navigation utilities for flow management
 */
export class FlowNavigator {
  private navigation: FlowNavigationConfig;

  constructor(navigation: FlowNavigationConfig) {
    this.navigation = navigation;
  }

  /**
   * Get the next page ID based on current page and data
   */
  getNextPage(currentPageId: PageId, data: Record<string, any>): PageId | null {
    const rules = this.navigation.rules.filter(
      rule => rule.fromPageId === currentPageId
    );

    // Find first matching conditional rule
    for (const rule of rules.filter(r => r.condition)) {
      if (ConditionEvaluator.evaluate(rule.condition!, data)) {
        return rule.toPageId;
      }
    }

    // Fall back to default rule
    const defaultRule = rules.find(rule => rule.isDefault);
    return defaultRule?.toPageId || null;
  }

  /**
   * Get all possible next pages from current page
   */
  getPossibleNextPages(currentPageId: PageId): PageId[] {
    return this.navigation.rules
      .filter(rule => rule.fromPageId === currentPageId)
      .map(rule => rule.toPageId);
  }

  /**
   * Check if navigation is allowed back
   */
  canGoBack(): boolean {
    return this.navigation.allowBack ?? false;
  }

  /**
   * Check if progress should be shown
   */
  shouldShowProgress(): boolean {
    return this.navigation.showProgress ?? false;
  }

  /**
   * Get the start page ID
   */
  getStartPage(): PageId {
    return this.navigation.startPageId;
  }

  /**
   * Validate navigation configuration
   */
  validate(): NavigationValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if start page exists
    if (!this.navigation.startPageId) {
      errors.push('Start page ID is required');
    }

    // Check for orphaned pages (pages that can't be reached)
    const reachablePages = new Set<PageId>([this.navigation.startPageId]);
    const allToPages = new Set(this.navigation.rules.map(r => r.toPageId));
    
    // Build reachability graph
    let changed = true;
    while (changed) {
      changed = false;
      for (const rule of this.navigation.rules) {
        if (reachablePages.has(rule.fromPageId) && !reachablePages.has(rule.toPageId)) {
          reachablePages.add(rule.toPageId);
          changed = true;
        }
      }
    }

    // Find unreachable pages
    for (const pageId of allToPages) {
      if (!reachablePages.has(pageId)) {
        warnings.push(`Page ${pageId} is not reachable from start page`);
      }
    }

    // Check for missing default rules
    const fromPages = new Set(this.navigation.rules.map(r => r.fromPageId));
    for (const fromPage of fromPages) {
      const rulesFromPage = this.navigation.rules.filter(r => r.fromPageId === fromPage);
      const hasDefault = rulesFromPage.some(r => r.isDefault);
      const hasConditions = rulesFromPage.some(r => r.condition);

      if (hasConditions && !hasDefault) {
        warnings.push(`Page ${fromPage} has conditional rules but no default rule`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

/**
 * Navigation validation result
 */
export interface NavigationValidationResult {
  readonly isValid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}

/**
 * Navigation rule builder
 */
export class NavigationRuleBuilder {
  private rule: MutableNavigationRule = {};

  /**
   * Set the from page
   */
  from(pageId: PageId): NavigationRuleBuilder {
    this.rule.fromPageId = pageId;
    return this;
  }

  /**
   * Set the to page
   */
  to(pageId: PageId): NavigationRuleBuilder {
    this.rule.toPageId = pageId;
    return this;
  }

  /**
   * Set the condition
   */
  when(condition: NavigationCondition): NavigationRuleBuilder {
    this.rule.condition = condition;
    return this;
  }

  /**
   * Mark as default rule
   */
  asDefault(): NavigationRuleBuilder {
    this.rule.isDefault = true;
    return this;
  }

  /**
   * Build the navigation rule
   */
  build(): NavigationRule {
    if (!this.rule.fromPageId || !this.rule.toPageId) {
      throw new Error('Both fromPageId and toPageId are required');
    }
    return this.rule as NavigationRule;
  }
}

/**
 * Factory function to create a navigation rule builder
 */
export function createNavigationRule(): NavigationRuleBuilder {
  return new NavigationRuleBuilder();
}

/**
 * Navigation configuration builder
 */
export class NavigationConfigBuilder {
  private config: MutableFlowNavigationConfig = {
    rules: [],
  };

  /**
   * Set the start page
   */
  startAt(pageId: PageId): NavigationConfigBuilder {
    this.config.startPageId = pageId;
    return this;
  }

  /**
   * Add a navigation rule
   */
  addRule(rule: NavigationRule): NavigationConfigBuilder {
    this.config.rules = [...(this.config.rules || []), rule];
    return this;
  }

  /**
   * Add multiple navigation rules
   */
  addRules(...rules: NavigationRule[]): NavigationConfigBuilder {
    this.config.rules = [...(this.config.rules || []), ...rules];
    return this;
  }

  /**
   * Allow back navigation
   */
  allowBack(allow = true): NavigationConfigBuilder {
    this.config.allowBack = allow;
    return this;
  }

  /**
   * Show progress indicator
   */
  showProgress(show = true): NavigationConfigBuilder {
    this.config.showProgress = show;
    return this;
  }

  /**
   * Build the navigation configuration
   */
  build(): FlowNavigationConfig {
    if (!this.config.startPageId) {
      throw new Error('Start page ID is required');
    }
    return this.config as FlowNavigationConfig;
  }
}

/**
 * Factory function to create a navigation config builder
 */
export function createNavigationConfig(): NavigationConfigBuilder {
  return new NavigationConfigBuilder();
}

/**
 * Factory function to create a flow navigator
 */
export function createFlowNavigator(navigation: FlowNavigationConfig): FlowNavigator {
  return new FlowNavigator(navigation);
} 