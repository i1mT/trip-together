import { z } from "zod";
export const placeSchema = z.object({
  id: z.string().min(1).max(1000),
  name: z.string().min(1).max(150),
  address: z.string().max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  countryCode: z.string().max(3).default(""),
  provider: z.enum(["geoapify", "amap"]),
});
export type Place = z.infer<typeof placeSchema>;
export function mapLink(place: Place) {
  const url = new URL("https://maps.apple.com/");
  url.searchParams.set("daddr", `${place.latitude},${place.longitude}`);
  url.searchParams.set("dirflg", "d");
  return url.toString();
}
