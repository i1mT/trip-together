import { z } from "zod";
import { placeSchema, type Place } from "../../shared/places";
import { gcj02ToWgs84 } from "./coord";

const poiSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  address: z.string().nullish(),
  location: z.string().min(1),
  pname: z.string().nullish(),
  cityname: z.string().nullish(),
  adcode: z.string().nullish(),
});
const responseSchema = z.object({ pois: z.array(z.unknown()) });

function countryCode(adcode: string | null | undefined) {
  if (!adcode) return "cn";
  if (adcode.startsWith("81")) return "hk";
  if (adcode.startsWith("82")) return "mo";
  if (adcode.startsWith("71")) return "tw";
  return "cn";
}

function parsePlaces(data: unknown): Place[] {
  return responseSchema.parse(data).pois.flatMap((poi) => {
    const parsed = poiSchema.safeParse(poi);
    if (!parsed.success) return [];
    const v = parsed.data;
    const [lonText, latText] = v.location.split(",");
    const lon = Number.parseFloat(lonText ?? "");
    const lat = Number.parseFloat(latText ?? "");
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
    const wgs = gcj02ToWgs84(lon, lat);
    const parts = [v.pname, v.cityname, v.address].filter(
      (part, index, all) => part && all[index - 1] !== part,
    );
    const place = placeSchema.safeParse({
      id: v.id,
      name: v.name.slice(0, 150),
      address: parts.join("").slice(0, 500),
      latitude: wgs.lat,
      longitude: wgs.lon,
      countryCode: countryCode(v.adcode),
      provider: "amap",
    });
    return place.success ? [place.data] : [];
  });
}

export async function findAmapPlaces(
  query: string,
  key: string,
  signal: AbortSignal,
  fetcher: (url: URL, init: RequestInit) => Promise<Response>,
) {
  const url = new URL("https://restapi.amap.com/v5/place/text");
  url.search = new URLSearchParams({
    key,
    keywords: query.slice(0, 80),
    page_size: "6",
  }).toString();
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error("Amap place search failed");
  const data = (await response.json()) as { status?: string; info?: string };
  // 高德业务错误也返回 HTTP 200，status "0" 表示配额、key 等故障，交给调用方回退。
  if (data.status !== "1")
    throw new Error(`Amap place search failed: ${data.info ?? "unknown"}`);
  return parsePlaces(data);
}
