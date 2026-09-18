import { z } from "zod";
import { eventSchema, tripSchema } from "./validation";
export const publicEventSchema = z
  .object(eventSchema.shape)
  .pick({
    title: true,
    kind: true,
    start: true,
    end: true,
    timezone: true,
    endTimezone: true,
    dateEnd: true,
    timeRange: true,
    timeMode: true,
    endUnspecified: true,
    place: true,
    address: true,
    location: true,
    departureLocation: true,
    from: true,
    to: true,
  })
  .refine(
    (e) => Date.parse(e.end) > Date.parse(e.start),
    "结束时间必须晚于开始时间",
  );
export const publicTripSchema = z
  .object(tripSchema.shape)
  .pick({
    title: true,
    start_date: true,
    end_date: true,
    timezone: true,
    home_timezone: true,
    currency: true,
    home_currency: true,
    destinations: true,
  })
  .refine((t) => t.end_date >= t.start_date, "结束日期不能早于开始日期");
export const snapshotSchema = z.object({
  trip: publicTripSchema,
  events: z.array(publicEventSchema).min(1).max(200),
});
export type PublicSnapshot = z.infer<typeof snapshotSchema>;
export const introductionLimit = 500;
export const introductionSchema = z
  .string()
  .trim()
  .max(introductionLimit, "介绍最多 500 字");
export const shareTitleSchema = z
  .string()
  .trim()
  .max(100, "公开名称最多 100 字")
  .optional();
export type PublicAuthor = { name: string; avatar: string | null };
export type PublicItinerary = {
  code: string;
  introduction: string;
  author: PublicAuthor;
  id: string;
  version: number;
  updated_at: string;
  snapshot: PublicSnapshot;
};
export type MarketCard = {
  code: string;
  introduction: string;
  author: PublicAuthor;
  id: string;
  title: string;
  updated_at: string;
  days: number;
  event_count: number;
  destinations: string[];
};
export type ShareDraft = {
  snapshot: PublicSnapshot | null;
  hash: string;
  current: PublicItinerary | null;
};
