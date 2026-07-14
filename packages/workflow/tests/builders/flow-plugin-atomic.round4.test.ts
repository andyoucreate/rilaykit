// @ts-nocheck - Disable TypeScript checking for test file due to generic constraints
import { ConfigurationError, ril } from '@rilaykit/core';
import { form } from '@rilaykit/forms';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { flow } from '../../src/builders/flow';

describe('flow.use() atomicity (round-4)', () => {
  let rilConfig: any;
  let formConfig: any;

  beforeEach(() => {
    rilConfig = ril.create<any>().component('text', {
      name: 'Text Input',
      renderer: () => React.createElement('input'),
      defaultProps: { label: '' },
    });
    formConfig = form.create(rilConfig).add({ type: 'text' });
  });

  // BUG 3
  it('does not register a plugin whose install() throws', () => {
    const bad = {
      name: 'bad',
      version: '1',
      install() {
        throw new Error('boom');
      },
    };
    const f = flow.create(rilConfig, 'w', 'W').addStep({ title: 'S', formConfig });

    expect(() => f.use(bad)).toThrow(ConfigurationError);

    const built = f.build();
    expect(built.plugins.some((p) => p.name === 'bad')).toBe(false);

    // A later plugin depending on the failed one must fail dependency validation.
    expect(() =>
      f.use({ name: 'dep', dependencies: ['bad'], version: '1', install() {} })
    ).toThrow(ConfigurationError);
  });
});
