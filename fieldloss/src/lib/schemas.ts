import { z } from "zod";

export const countrySchema = z.enum(["AU", "FJ"]);
export const commoditySchema = z.enum(["tomatoes", "bananas", "taro"]);
export const stageSchema = z.enum(["handling", "storage", "transport"]);
export const destinationSchema = z.enum(["discarded", "composted", "donated", "resold", "animal_feed", "productive_use", "unknown"]);
export const measurementSchema = z.enum(["weighed", "estimated", "unknown"]);
export const quantitySchema = z.strictObject({ amount: z.number().nullable(), unit: z.enum(["kg", "g", "tonnes", "crates", "unknown"]), kgPerCrate: z.number().nullable() });
export const allocationSchema = z.strictObject({ destination: destinationSchema, quantity: quantitySchema });
export const contextSchema = z.strictObject({ country: countrySchema, commodity: commoditySchema, stage: stageSchema, date: z.iso.date(), location: z.string().max(200) });
const detectedSchema = z.strictObject({ country: countrySchema.nullable(), commodity: commoditySchema.nullable(), stage: stageSchema.nullable() });
export const extractionSchema = z.strictObject({
  incoming: quantitySchema.nullable(), affected: quantitySchema.nullable(), allocations: z.array(allocationSchema), cause: z.string().nullable(), measurement: measurementSchema,
  detectedContext: detectedSchema,
  evidence: z.strictObject({ incoming: z.string().nullable(), affected: z.string().nullable(), cause: z.string().nullable(), allocations: z.string().nullable(), commodity: z.string().nullable(), stage: z.string().nullable() }),
});
const evidenceSchema = z.strictObject({ incoming: z.string().optional(), affected: z.string().optional(), cause: z.string().optional(), allocations: z.string().optional(), commodity: z.string().optional(), stage: z.string().optional() });
export const draftSchema = z.strictObject({ id: z.string(), context: contextSchema, transcript: z.string(), incoming: quantitySchema, affected: quantitySchema, allocations: z.array(allocationSchema), cause: z.string().nullable(), measurement: measurementSchema, evidence: evidenceSchema, detectedContext: detectedSchema, acknowledgedConflicts: z.array(z.string()) });
export const recordSchema = z.strictObject({
  id: z.string(), context: contextSchema, transcript: z.string(), incomingKg: z.number().positive(), affectedKg: z.number().nonnegative(),
  allocations: z.array(z.strictObject({ destination: destinationSchema, kg: z.number().nonnegative() })), lossKg: z.number().nonnegative(), lossPercent: z.number().min(0).max(100),
  cause: z.string().nullable(), measurement: measurementSchema, evidence: evidenceSchema, confirmedAt: z.iso.datetime(), isSample: z.boolean(),
});
export const trialSchema = z.strictObject({ id: z.string(), scenarioId: z.string(), mode: z.enum(["manual", "assisted"]), inputMethod: z.enum(["voice", "text", "manual"]), elapsedMs: z.number().nonnegative(), correct: z.boolean(), errors: z.array(z.string()), completedAt: z.iso.datetime() });
export const stateSchema = z.strictObject({ schemaVersion: z.literal(1), draft: draftSchema.nullable(), records: z.array(recordSchema), trials: z.array(trialSchema) });
export const extractionRequestSchema = z.strictObject({ transcript: z.string().trim().min(1).max(8000), context: contextSchema });
