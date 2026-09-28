/**
 * Tests for the Zod → Gemini schema converter.
 *
 * The converter is the piece that keeps the prompt contract and the validation
 * contract from drifting apart, so these tests are mostly about the *dialect
 * differences* between JSON Schema and Gemini's dialect, and about failing loudly
 * on constructs the converter cannot honestly express.
 */

import { Type } from '@google/genai'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  breakdownResponseSchema,
  createTasksResponseSchema,
  improveResponseSchema,
  prioritizeResponseSchema,
} from '../shared/ai.ts'
import { toGeminiSchema } from '../server/ai/json-schema.ts'

describe('primitive types', () => {
  it('maps each JSON Schema primitive to its Gemini type', () => {
    expect(toGeminiSchema(z.string(), 'S').type).toBe(Type.STRING)
    expect(toGeminiSchema(z.number(), 'S').type).toBe(Type.NUMBER)
    expect(toGeminiSchema(z.int(), 'S').type).toBe(Type.INTEGER)
    expect(toGeminiSchema(z.boolean(), 'S').type).toBe(Type.BOOLEAN)
    expect(toGeminiSchema(z.array(z.string()), 'S').type).toBe(Type.ARRAY)
  })

  it('converts a nested object with all properties required', () => {
    const schema = toGeminiSchema(z.object({ a: z.string(), b: z.number() }), 'Thing')
    expect(schema.type).toBe(Type.OBJECT)
    expect(schema.title).toBe('Thing')
    expect(schema.required).toEqual(['a', 'b'])
    expect(schema.propertyOrdering).toEqual(['a', 'b'])
    expect(schema.properties?.a?.type).toBe(Type.STRING)
    expect(schema.properties?.b?.type).toBe(Type.NUMBER)
  })

  it('converts array items', () => {
    const schema = toGeminiSchema(z.array(z.object({ title: z.string() })), 'Steps')
    expect(schema.items?.type).toBe(Type.OBJECT)
    expect(schema.items?.properties?.title?.type).toBe(Type.STRING)
  })

  it('passes an enum through as strings', () => {
    const schema = toGeminiSchema(z.enum(['low', 'medium', 'high']), 'Priority')
    expect(schema.enum).toEqual(['low', 'medium', 'high'])
  })

  it('carries a description through to the model', () => {
    const schema = toGeminiSchema(z.string().describe('A calendar date'), 'D')
    expect(schema.description).toBe('A calendar date')
  })
})

describe('nullable handling', () => {
  it('uses nullable rather than a union type', () => {
    // Gemini has no union types, so `string | null` has to become
    // `{ type: STRING, nullable: true }`.
    const schema = toGeminiSchema(z.string().nullable(), 'Maybe')
    expect(schema.type).toBe(Type.STRING)
    expect(schema.nullable).toBe(true)
  })

  it('leaves non-nullable fields without the flag', () => {
    const schema = toGeminiSchema(z.string(), 'Plain')
    expect(schema.nullable).toBeUndefined()
  })

  it('handles a nullable field inside an object', () => {
    const schema = toGeminiSchema(z.object({ dueDate: z.string().nullable() }), 'Task')
    expect(schema.properties?.dueDate?.nullable).toBe(true)
  })
})

describe('unsupported constructs fail loudly', () => {
  it('rejects a union of two non-null types', () => {
    // Silently picking one branch would weaken the contract, so this throws.
    expect(() => toGeminiSchema(z.union([z.string(), z.number()]), 'U')).toThrow(
      /union|not supported/i,
    )
  })

  it('rejects an object with no properties', () => {
    expect(() => toGeminiSchema(z.object({}).passthrough(), 'Empty')).toThrow()
  })

  it('names the offending path so the failure is findable', () => {
    expect(() =>
      toGeminiSchema(z.object({ outer: z.object({ inner: z.union([z.string(), z.number()]) }) }), 'Deep'),
    ).toThrow(/outer\.inner/)
  })
})

describe('real AI response schemas convert cleanly', () => {
  it('converts the task-creation contract', () => {
    const schema = toGeminiSchema(createTasksResponseSchema, 'TaskExtraction')
    expect(schema.type).toBe(Type.OBJECT)
    const task = schema.properties?.tasks?.items
    expect(task?.properties?.dueDate?.nullable).toBe(true)
    expect(task?.properties?.rationale?.nullable).toBe(true)
    expect(task?.properties?.priority?.enum).toEqual(['low', 'medium', 'high'])
  })

  it('converts the breakdown contract', () => {
    const schema = toGeminiSchema(breakdownResponseSchema, 'TaskBreakdown')
    expect(schema.properties?.steps?.type).toBe(Type.ARRAY)
    expect(schema.properties?.notes?.nullable).toBe(true)
  })

  it('converts the prioritisation contract', () => {
    const schema = toGeminiSchema(prioritizeResponseSchema, 'NextTaskRecommendation')
    expect(schema.properties?.focusTaskId?.nullable).toBe(true)
    expect(schema.properties?.suggestedOrder?.type).toBe(Type.ARRAY)
  })

  it('converts the improvement contract', () => {
    const schema = toGeminiSchema(improveResponseSchema, 'TaskRewrite')
    expect(schema.title).toBe('TaskRewrite')
    expect(schema.properties?.title?.type).toBe(Type.STRING)
  })
})
