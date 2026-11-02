import { placeSchema } from "./places";
import { z } from "zod";
import { currencies } from "./travel-options";
export { currencies } from "./travel-options";
export const currencySchema = z.enum(currencies);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    "日期无效",
  );
export const zoneSchema = z
  .string()
  .max(80)
  .refine((s) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: s });
      return true;
    } catch {
      return false;
    }
  }, "请选择有效的当地时间");
export const tripSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    destinations: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(100),
          timezone: zoneSchema,
          currency: currencySchema,
        }),
      )
      .max(20)
      .default([]),
    start_date: dateSchema,
    end_date: dateSchema,
    timezone: zoneSchema,
    home_timezone: zoneSchema,
    currency: currencySchema,
    home_currency: currencySchema,
    version: z.number().int().positive().optional(),
  })
  .refine((v) => v.end_date >= v.start_date, "结束日期不能早于开始日期");
export const eventSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    subtitle: z.string().max(250).default(""),
    kind: z.enum(["flight", "drive", "stay", "explore", "meal", "transfer"]),
    dateEnd: dateSchema.optional(),
    timeRange: z.boolean().optional(),
    timeMode: z.enum(["timed", "date"]).default("timed"),
    endUnspecified: z.boolean().default(false),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    timezone: zoneSchema,
    endTimezone: zoneSchema.optional(),
    certainty: z.enum(["confirmed", "suggested"]),
    place: z.string().max(150).default(""),
    address: z.string().max(500).default(""),
    location: placeSchema.nullable().optional(),
    departureLocation: placeSchema.nullable().optional(),
    phone: z.string().max(80).default(""),
    source: z.string().max(500).default(""),
    note: z.string().max(3000).default(""),
    documents: z.array(z.string().uuid()).max(30).default([]),
    from: z.string().max(150).default(""),
    to: z.string().max(150).default(""),
    code: z.string().max(80).default(""),
    version: z.number().int().positive().optional(),
  })
  .refine(
    (v) => Date.parse(v.end) > Date.parse(v.start),
    "结束时间必须晚于开始时间",
  );
