/**
 * Converts a Zod schema into the OpenAPI-flavoured `Schema` that Gemini's
 * structured output requires.
 *
 * Why not hand-write the response schemas? Because then the schema sent to the
 * model and the schema used to validate its reply would be two declarations that
 * silently drift apart. Deriving one from the other means a change to the Zod
 * contract automatically changes what the model is asked for.
 *
 * The two dialects differ in ways that matter:
 *   - Zod emits `"type": ["string", "null"]`; Gemini has no union types and
 *     wants `nullable: true` instead.
 *   - Zod emits `additionalProperties: false`; Gemini does not support the key.
 *   - Gemini types are upper-case enum members, not JSON Schema primitives.
 *
 * Anything outside the supported subset throws, so an unsupported construct
 * fails a unit test instead of silently producing a weaker prompt contract.
 */

import { Type, type Schema } from '@google/genai'
import { z } from 'zod'

type JsonSchema = Record<string, unknown>

const PRIMITIVES: Record<string, Type> = {
  string: Type.STRING,
  number: Type.NUMBER,
  integer: Type.INTEGER,
  boolean: Type.BOOLEAN,
  object: Type.OBJECT,
  array: Type.ARRAY,
}

/** Keys of a JSON Schema node that Gemini understands. Everything else is dropped. */
const SUPPORTED_KEYS = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'description',
  'format',
  'anyOf',
  'const',
  'examples',
  'default',
  'propertyOrdering',
])

/**
 * Keywords that only *constrain* a value and are dropped silently.
 *
 * Gemini's dialect has no equivalent, so there is no way to transmit them — and
 * no harm in omitting them, because the same Zod schema is re-run over the reply
 * before anything is used. `minLength` in particular arrives from every
 * `z.string().min(1)` in the AI contract, so this list is load-bearing rather
 * than defensive.
 */
const DROPPED_CONSTRAINTS = new Set([
  'additionalProperties',
  '$schema',
  '$defs',
  'minLength',
  'maxLength',
  'pattern',
  'formatMinimum',
  'formatMaximum',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'default',
  'examples',
  '$ref',
  'title',
  'description',
])

function unsupported(path: string, detail: string): never {
  throw new Error(`Cannot convert Zod schema to a Gemini schema at ${path || '<root>'}: ${detail}`)
}

/**
 * Normalises a `type` field into a single primitive plus a nullable flag.
 * Accepts both `"string"` and `["string", "null"]`.
 */
function resolveType(node: JsonSchema, path: string): { type: Type; nullable: boolean } {
  const raw = node.type

  if (Array.isArray(raw)) {
    const nonNull = raw.filter((entry) => entry !== 'null')
    const nullable = nonNull.length !== raw.length
    if (nonNull.length !== 1) {
      unsupported(path, `union of ${raw.length} types is not supported (only T | null is)`)
    }
    return { type: primitive(nonNull[0] as string, path), nullable }
  }

  if (typeof raw === 'string') return { type: primitive(raw, path), nullable: false }

  unsupported(path, 'missing "type"')
}

function primitive(name: string, path: string): Type {
  const mapped = PRIMITIVES[name]
  if (!mapped) unsupported(path, `type "${name}" has no Gemini equivalent`)
  return mapped
}

/**
 * Derives the Gemini response schema for a Zod schema.
 *
 * @param schema The Zod schema describing the model's reply.
 * @param name   Object title; becomes the `title` Gemini reports for the root.
 */
export function toGeminiSchema(schema: z.ZodType, name: string): Schema {
  return convert(z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }) as JsonSchema, '', name)
}

function convert(node: JsonSchema, path: string, title?: string): Schema {
  for (const key of Object.keys(node)) {
    if (SUPPORTED_KEYS.has(key)) continue
    // Constraints Gemini cannot express are dropped: they only narrow what we
    // accept, and we re-apply the full Zod contract to the reply anyway.
    // Unsupported *shapes* must fail loudly, because silently dropping one would
    // ask the model for a weaker contract than the one we validate against.
    if (DROPPED_CONSTRAINTS.has(key)) continue
    unsupported(path, `keyword "${key}" is not supported`)
  }

  // A nullable union may arrive as anyOf: [T, null] depending on how the Zod
  // schema was composed. Collapse that into the nullable flag.
  const collapsed = collapseNullableUnion(node, path)
  if (collapsed !== node) return convert(collapsed, path, title)

  const { type, nullable } = resolveType(collapsed, path)
  const out: Schema = { type }
  if (nullable) out.nullable = true
  if (title) out.title = title

  if (typeof collapsed.description === 'string') out.description = collapsed.description
  if (typeof collapsed.format === 'string') out.format = collapsed.format
  if (Array.isArray(collapsed.enum)) out.enum = collapsed.enum.map(String)
  if (collapsed.const !== undefined) out.enum = [String(collapsed.const)]

  if (type === Type.OBJECT) {
    const properties = (collapsed.properties ?? {}) as Record<string, JsonSchema>
    const names = Object.keys(properties)
    if (names.length === 0) unsupported(path, 'object with no properties')

    const converted: Record<string, Schema> = {}
    for (const name of names) {
      converted[name] = convert(properties[name]!, `${path}.${name}`)
    }
    out.properties = converted
    out.propertyOrdering = names
    // Gemini's structured output is strictest when every property is required;
    // optionality is expressed with `nullable` instead of omission.
    out.required = Array.isArray(collapsed.required) && collapsed.required.length > 0
      ? (collapsed.required as string[])
      : names
  }

  if (type === Type.ARRAY) {
    const items = collapsed.items as JsonSchema | undefined
    if (!items) unsupported(path, 'array is missing "items"')
    out.items = convert(items, `${path}[]`)
  }

  return out
}

/** Rewrites `anyOf: [T, {type:'null'}]` into `T` plus a nullable hint. */
function collapseNullableUnion(node: JsonSchema, path: string): JsonSchema {
  const anyOf = node.anyOf
  if (!Array.isArray(anyOf) || anyOf.length === 0) return node

  const nullIndex = anyOf.findIndex(
    (entry) => typeof entry === 'object' && entry !== null && (entry as JsonSchema).type === 'null',
  )
  if (nullIndex === -1) unsupported(path, 'anyOf unions are not supported (only T | null is)')

  const rest = anyOf.filter((_, index) => index !== nullIndex)
  if (rest.length !== 1) unsupported(path, 'anyOf union of more than one non-null type')

  const [inner] = rest as [JsonSchema]
  const merged: JsonSchema = { ...inner, type: [inner.type, 'null'] }
  if (node.description) merged.description = node.description
  return merged
}
