import type {
  Bindings,
  CompileFormOptions,
  CustomValidatorFactory,
  SchemaEffectHandler,
  SchemaRegistry,
} from '@rilaykit/forms';
import { compileForm } from '@rilaykit/forms';
import { describe, expectTypeOf, it } from 'vitest';

describe('compileForm public type surface', () => {
  it('exposes Bindings with optional validators and effects maps', () => {
    expectTypeOf<Bindings>().toEqualTypeOf<{
      readonly validators?: Record<string, CustomValidatorFactory>;
      readonly effects?: Record<string, SchemaEffectHandler>;
    }>();
    expectTypeOf<Bindings['validators']>().toEqualTypeOf<
      Record<string, CustomValidatorFactory> | undefined
    >();
  });

  it('keeps SchemaRegistry as a deprecated alias of Bindings', () => {
    expectTypeOf<SchemaRegistry>().toEqualTypeOf<Bindings>();
  });

  it('names the CompileFormOptions fields `bindings` and `validateProps`', () => {
    expectTypeOf<CompileFormOptions>().toEqualTypeOf<{
      readonly bindings?: Bindings;
      readonly validateProps?: boolean;
    }>();
  });

  it('accepts CompileFormOptions as the optional third parameter of compileForm', () => {
    expectTypeOf(compileForm<{ text: unknown }>)
      .parameter(2)
      .toEqualTypeOf<CompileFormOptions | undefined>();
  });
});
