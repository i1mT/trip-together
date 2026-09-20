import { HttpError, json } from "../http";
import { rateLimit } from "../security/rate-limit";
import { findPlaces } from "./provider";
export async function searchPlaces(
  request: Request,
  env: Env,
  memberId: string,
) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  const mode = params.get("mode") === "city" ? "city" : "poi";
  if (query.length < 2 || query.length > 200)
    throw new HttpError(400, "请输入 2 至 200 个字的地点名称");
  if (!env.GEOAPIFY_API_KEY)
    throw new HttpError(503, "地点搜索暂不可用，可以稍后添加地点");
  await rateLimit(request, env, "place-search", 120, memberId);
  try {
    return json({
      places: await findPlaces(
        query,
        env.GEOAPIFY_API_KEY,
        undefined,
        env.AMAP_API_KEY,
        mode,
      ),
    });
  } catch {
    throw new HttpError(
      503,
      "地点搜索暂时失败，请稍后重试，或尝试城市名和当地名称",
    );
  }
}
