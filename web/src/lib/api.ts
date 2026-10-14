let activeTrip = "";
export function setActiveTrip(id: string) {
  activeTrip = id;
}
export function apiUrl(path: string) {
  const scoped =
    /^\/(trip$|expenses|receipts|documents|packing|events|preparation|invites|members)/.test(
      path,
    );
  if (scoped) {
    if (!activeTrip) throw new Error("请先选择行程");
    return `/api/trips/${activeTrip}${path === "/trip" ? "/data" : path}`;
  }
  return `/api${path}`;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  resolvedUrl?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(resolvedUrl ?? apiUrl(path), {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("网络连接失败，请检查网络后重试", 0);
  }
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(data.error ?? "操作失败，请重试", response.status);
  return data;
}
