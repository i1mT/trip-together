import { z } from "zod";
import { placeSchema, type Place } from "../../shared/places";
import { findAmapPlaces } from "./amap";
import { looksChinese } from "./coord";
const resultSchema = z.object({
  place_id: z.string(),
  name: z.string().nullish(),
  address_line1: z.string().nullish(),
  formatted: z.string(),
  lat: z.number(),
  lon: z.number(),
  country_code: z.string().nullish(),
});
const responseSchema = z.object({ results: z.array(z.unknown()) });
function parsePlaces(data: unknown): Place[] {
  return responseSchema.parse(data).results.flatMap((result) => {
    const parsed = resultSchema.safeParse(result);
    if (!parsed.success) return [];
    const v = parsed.data;
    const place = placeSchema.safeParse({
      id: v.place_id,
      name: (v.name || v.address_line1 || v.formatted).slice(0, 150),
      address: v.formatted.slice(0, 500),
      latitude: v.lat,
      longitude: v.lon,
      countryCode: v.country_code ?? "",
      provider: "geoapify",
    });
    return place.success ? [place.data] : [];
  });
}
async function findGeoapifyPlaces(
  query: string,
  key: string,
  signal: AbortSignal,
  fetcher: (url: URL, init: RequestInit) => Promise<Response>,
) {
  const places: Place[] = [];
  for (const city of [false, true]) {
    const url = new URL("https://api.geoapify.com/v1/geocode/search");
    url.search = new URLSearchParams({
      ...(city ? { city: query, type: "city" } : { text: query }),
      lang: "zh",
      limit: "6",
      format: "json",
      bias: "countrycode:none",
      apiKey: key,
    }).toString();
    const response = await fetcher(url, { signal });
    if (!response.ok) throw new Error("Place provider unavailable");
    places.push(...parsePlaces(await response.json()));
    if (places.length) break;
  }
  return places;
}
export async function findPlaces(
  query: string,
  key: string,
  fetcher: (url: URL, init: RequestInit) => Promise<Response> = (url, init) =>
    fetch(url, init),
  amapKey?: string,
  mode: "poi" | "city" = "poi",
) {
  // 一次搜索共享同一个截止时刻；provider 故障必须回退而不是当成空结果。
  const signal = AbortSignal.timeout(8000);
  // 城市意图（目的地选择）保持 Geoapify：高德会把「东京」这类海外城市名模糊匹配到
  // 国内同名门店，而 Geoapify 覆盖海外城市且含中文名。
  if (mode === "city" || !looksChinese(query) || !amapKey) {
    return findGeoapifyPlaces(query, key, signal, fetcher);
  }
  // POI 意图：高德国内商户库能命中 Geoapify 找不到的小店与民宿，但高德不覆盖海外，
  // 且会把海外城市名模糊成国内门店，因此两路并行，Geoapify 结果兜底海外场景。
  const [amap, geo] = await Promise.allSettled([
    findAmapPlaces(query, amapKey, signal, fetcher),
    findGeoapifyPlaces(query, key, signal, fetcher),
  ]);
  const seen = new Set<string>();
  const merged: Place[] = [];
  for (const list of [amap, geo]) {
    if (list.status !== "fulfilled") continue;
    for (const place of list.value) {
      // 去重：同一坐标 50 米内的候选视为同一地点。
      const key1 = `${Math.round(place.latitude * 1000)}:${Math.round(place.longitude * 1000)}`;
      if (seen.has(key1)) continue;
      seen.add(key1);
      merged.push(place);
    }
  }
  if (
    amap.status === "rejected" &&
    geo.status === "rejected" &&
    !merged.length
  ) {
    throw new Error("Place providers unavailable");
  }
  return merged.slice(0, 6);
}
