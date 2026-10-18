import { z } from "zod";

const label = { title: z.string().optional(), description: z.string().optional() };
const option = z.object({ const: z.string(), title: z.string() });
const fieldSchema = z.discriminatedUnion("type", [
  z.object({
    ...label,
    type: z.literal("string"),
    default: z.string().optional(),
    enum: z.array(z.string()).optional(),
    enumNames: z.array(z.string()).optional(),
    oneOf: z.array(option).optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().nonnegative().optional(),
    format: z.enum(["email", "uri", "date", "date-time"]).optional(),
  }),
  z.object({ ...label, type: z.literal("boolean"), default: z.boolean().optional() }),
  z.object({
    ...label,
    type: z.enum(["number", "integer"]),
    default: z.number().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
  }),
  z.object({
    ...label,
    type: z.literal("array"),
    default: z.array(z.string()).optional(),
    minItems: z.number().int().nonnegative().optional(),
    maxItems: z.number().int().nonnegative().optional(),
    items: z.union([
      z.object({ type: z.literal("string"), enum: z.array(z.string()) }),
      z.object({ anyOf: z.array(option) }),
    ]),
  }),
]);
export const mcpRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("form"),
    serverName: z.string(),
    message: z.string(),
    requestedSchema: z.object({
      type: z.literal("object"),
      properties: z.record(z.string(), fieldSchema),
      required: z.array(z.string()).optional(),
    }),
  }),
  z.object({
    mode: z.literal("url"),
    serverName: z.string(),
    message: z.string(),
    url: z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
  }),
]);
export type McpRequest = z.infer<typeof mcpRequestSchema>;
export type McpFieldSchema = z.infer<typeof fieldSchema>;
export type FormValues = Record<string, string | boolean | string[]>;

export const fieldOptions = (field: McpFieldSchema) => {
  if (field.type === "string")
    return (
      field.oneOf?.map((value) => ({ value: value.const, label: value.title })) ??
      field.enum?.map((value, index) => ({ value, label: field.enumNames?.[index] ?? value }))
    );
  if (field.type === "array")
    return "anyOf" in field.items
      ? field.items.anyOf.map((value) => ({ value: value.const, label: value.title }))
      : field.items.enum.map((value) => ({ value, label: value }));
  return undefined;
};

export const initialValues = (request: McpRequest): FormValues =>
  request.mode === "form"
    ? Object.fromEntries(
        Object.entries(request.requestedSchema.properties).flatMap(([key, field]) =>
          field.default === undefined
            ? []
            : [
                [
                  key,
                  typeof field.default === "number" ? String(field.default) : field.default,
                ],
              ],
        ),
      )
    : {};

/** Keep native JSON types, validate all required fields, and omit unanswered optional fields. */
export const formContent = (request: McpRequest, values: FormValues) => {
  if (request.mode === "url") return { valid: true as const, content: null };
  const schema = request.requestedSchema;
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.properties)) {
    let validator: z.ZodType;
    if (field.type === "string") {
      let text = z.string().min(field.minLength ?? 0);
      if (field.maxLength !== undefined) text = text.max(field.maxLength);
      const options = fieldOptions(field);
      validator = options
        ? text.refine((value) => options.some((option) => option.value === value))
        : text;
      if (field.format === "email") validator = validator.pipe(z.email());
      if (field.format === "uri") validator = validator.pipe(z.url());
      if (field.format === "date") validator = validator.pipe(z.iso.date());
      if (field.format === "date-time")
        validator = validator.pipe(z.iso.datetime({ offset: true }));
    } else if (field.type === "boolean") validator = z.boolean();
    else if (field.type === "array") {
      const options = fieldOptions(field)!;
      let list = z.array(
        z.string().refine((value) => options.some((option) => option.value === value)),
      );
      if (field.minItems !== undefined) list = list.min(field.minItems);
      if (field.maxItems !== undefined) list = list.max(field.maxItems);
      validator = list;
    } else {
      let number = z.number();
      if (field.type === "integer") number = number.int();
      if (field.minimum !== undefined) number = number.min(field.minimum);
      if (field.maximum !== undefined) number = number.max(field.maximum);
      validator = z.string().transform(Number).pipe(number);
    }
    shape[key] = schema.required?.includes(key) ? validator : validator.optional();
  }
  if (schema.required?.some((key) => !Object.hasOwn(shape, key)))
    return { valid: false as const };
  const result = z
    .object(shape)
    .safeParse(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "")));
  return result.success
    ? {
        valid: true as const,
        content: result.data as Record<string, string | number | boolean | string[]>,
      }
    : { valid: false as const };
};
