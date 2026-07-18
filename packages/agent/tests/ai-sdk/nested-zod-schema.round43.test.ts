import { ril } from '@rilaykit/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { tools } from '../../src/ai-sdk';

/**
 * Round 43 (bug hunt): #13 changed the ZOD path from a raw pass-through (the SDK
 * converted the zod schema itself) to a projected-then-`jsonSchema()`-wrapped
 * root. Real tools use NESTED zod schemas — nested objects, arrays, enums,
 * optionals, descriptions. If the `~standard.jsonSchema` projection drops any of
 * that structure, a developer's complex tool silently reaches the model with a
 * lossy schema. This pins the projected root against the shape the model needs.
 */
describe('Round 43: a nested zod tool schema projects losslessly through ai-sdk tools()', () => {
  const catalog = ril.create().tool('book_trip', {
    description: 'Book a trip',
    inputSchema: z.object({
      destination: z.string().describe('City to fly to'),
      passengers: z.number().int().min(1),
      cabin: z.enum(['economy', 'business']),
      contact: z.object({
        email: z.string(),
        phone: z.string().optional(),
      }),
      legs: z.array(z.object({ from: z.string(), to: z.string() })),
    }),
  });

  it('emits a JSON Schema that preserves nested objects, arrays, enums, and required/optional', () => {
    const def = tools(catalog).book_trip as {
      inputSchema: { jsonSchema?: Record<string, unknown> };
    };
    const root = def.inputSchema.jsonSchema as {
      type: string;
      properties: Record<string, Record<string, unknown>>;
      required?: string[];
    };

    expect(root.type).toBe('object');

    // Top-level shape preserved.
    expect(root.properties.destination).toMatchObject({
      type: 'string',
      description: 'City to fly to',
    });
    expect(root.properties.passengers).toMatchObject({ type: 'integer', minimum: 1 });
    expect(root.properties.cabin).toMatchObject({ enum: ['economy', 'business'] });

    // Nested object preserved, with its own required/optional split.
    const contact = root.properties.contact as {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(contact.type).toBe('object');
    expect(contact.properties.email).toMatchObject({ type: 'string' });
    expect(contact.properties.phone).toMatchObject({ type: 'string' });
    expect(contact.required).toEqual(['email']); // phone is optional

    // Array of objects preserved.
    const legs = root.properties.legs as { type: string; items: Record<string, unknown> };
    expect(legs.type).toBe('array');
    expect((legs.items as { type: string }).type).toBe('object');

    // The optional top-level field is out of `required`; the rest are in.
    expect(root.required).toEqual(
      expect.arrayContaining(['destination', 'passengers', 'cabin', 'contact', 'legs'])
    );
  });

  it('the wrapped validate still enforces the zod schema (rejects a bad payload)', async () => {
    const validate = (
      tools(catalog).book_trip as { inputSchema: { validate?: (v: unknown) => unknown } }
    ).inputSchema.validate;
    const good = await validate?.({
      destination: 'CDG',
      passengers: 2,
      cabin: 'business',
      contact: { email: 'a@b.co' },
      legs: [{ from: 'JFK', to: 'CDG' }],
    });
    expect((good as { success: boolean }).success).toBe(true);
    const bad = await validate?.({
      destination: 'CDG',
      passengers: 0,
      cabin: 'first',
      contact: {},
      legs: [],
    });
    expect((bad as { success: boolean }).success).toBe(false);
  });
});
