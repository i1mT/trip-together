// 每个命令只做三件事：把参数拼成接口请求、调用 Worker、返回可打印的 JSON。
import { randomUUID } from "node:crypto";
import {
  ApiError,
  api,
  context,
  download,
  query,
  upload,
} from "./http.mjs";
import { login, logout, remember, stored } from "./auth.mjs";

/** 删除都不可恢复：必须先和用户确认，再加 --yes 才会真的调用接口。 */
function confirmDelete(flags, label) {
  if (flags.yes !== true)
    throw new ApiError(`删除${label}不可恢复，先向用户确认，再加 --yes 重试`);
}
function payload(data) {
  if (!data) throw new ApiError("这个命令需要 --data '<json>' 或从标准输入传入 JSON");
  return data;
}
async function bootstrap() {
  return api("/bootstrap");
}
export async function currentTrip(explicit) {
  const { base } = context();
  if (explicit) return explicit;
  const result = await bootstrap(),
    saved = stored(base)?.tripId;
  const id =
    result.trips.find((trip) => trip.id === saved)?.id ?? result.trips[0]?.id;
  if (!id) throw new ApiError("这个账号还没有行程，先运行：tt trip new --data '{…}'");
  remember(base, { tripId: id });
  return id;
}
async function data({ flags }) {
  return api(`/trips/${await currentTrip(flags.trip)}/data`);
}
async function eventVersion(trip, id) {
  const result = await api(`/trips/${trip}/data`),
    event = result.events.find((item) => item.id === id);
  if (!event) throw new ApiError(`行程里没有编号为 ${id} 的安排`);
  return event.version;
}
async function expenseVersion(trip, id) {
  const result = await api(`/trips/${trip}/data`),
    expense = result.expenses.find((item) => item.id === id);
  if (!expense) throw new ApiError(`行程里没有编号为 ${id} 的支出`);
  return expense.version;
}
async function members(trip) {
  const result = await api(`/trips/${trip}/data`);
  return result.members;
}
export const commands = {
  login: ({ flags }) => login({ label: flags.label, open: flags["no-open"] !== true }),
  logout: () => logout(),
  whoami: async () => {
    const result = await bootstrap();
    if (result.trips[0]) remember(context().base, { tripId: result.trips[0].id });
    return { member: result.me, trips: result.trips.map((trip) => ({ id: trip.id, title: trip.title, start_date: trip.start_date, end_date: trip.end_date })) };
  },
  "trip list": async () => {
    const result = await bootstrap();
    return {
      current: result.trips.length ? await currentTrip() : "",
      trips: result.trips,
    };
  },
  "trip show": async ({ args, flags }) => {
    const trip = await currentTrip(args[0] ?? flags.trip),
      result = await bootstrap();
    return result.trips.find((item) => item.id === trip);
  },
  "trip use": async ({ args }) => {
    if (!args[0]) throw new ApiError("用法：tt trip use <行程编号>");
    const result = await bootstrap(),
      trip = result.trips.find((item) => item.id === args[0]);
    if (!trip) throw new ApiError("账号里没有这个行程，先运行 tt trip list");
    remember(context().base, { tripId: trip.id });
    return { current: trip.id, title: trip.title };
  },
  "trip new": async ({ data: body }) => api("/trips", { method: "POST", data: payload(body) }),
  "trip update": async ({ args, flags, data: body }) => {
    const value = payload(body),
      id = await currentTrip(args[0] ?? flags.trip);
    if (!value.version) {
      const result = await bootstrap(),
        trip = result.trips.find((item) => item.id === id);
      if (!trip) throw new ApiError("账号里没有这个行程");
      value.version = trip.version;
    }
    return api(`/trips/${id}`, { method: "PUT", data: value });
  },
  "trip rm": async ({ args, flags }) => {
    const id = await currentTrip(args[0] ?? flags.trip),
      result = await bootstrap(),
      trip = result.trips.find((item) => item.id === id);
    if (!trip) throw new ApiError("账号里没有这个行程");
    if (flags.confirm !== trip.title)
      throw new ApiError(
        `删除行程不可恢复，需要与行程名称完全一致：tt trip rm ${id} --confirm "${trip.title}"`,
      );
    return api(`/trips/${id}`, { method: "DELETE", data: { title: trip.title } });
  },
  "trip join": ({ args, flags }) =>
    api("/join", { method: "POST", data: { token: args[0] ?? flags.code } }),
  data,
  "event list": async ({ flags }) => (await data({ flags })).events,
  "event add": async ({ flags, data: body }) =>
    api(`/trips/${await currentTrip(flags.trip)}/events`, {
      method: "POST",
      data: payload(body),
    }),
  "event update": async ({ args, flags, data: body }) => {
    const value = payload(body),
      trip = await currentTrip(flags.trip);
    if (!args[0]) throw new ApiError("用法：tt event update <安排编号> --data '{…}'");
    if (!value.version) value.version = await eventVersion(trip, args[0]);
    return api(`/trips/${trip}/events/${args[0]}`, { method: "PUT", data: value });
  },
  "event rm": async ({ args, flags, data: body }) => {
    if (!args[0]) throw new ApiError("用法：tt event rm <安排编号> --yes");
    confirmDelete(flags, "安排");
    const trip = await currentTrip(flags.trip),
      version = body?.version ?? (flags.version ? Number(flags.version) : await eventVersion(trip, args[0]));
    return api(`/trips/${trip}/events/${args[0]}`, {
      method: "DELETE",
      data: { version },
    });
  },
  "event status": async ({ args, flags }) => {
    const [id, status] = args,
      trip = await currentTrip(flags.trip);
    if (!id || !status)
      throw new ApiError("用法：tt event status <安排编号> <planned|completed|cancelled>");
    return api(`/trips/${trip}/events/${id}`, {
      method: "PATCH",
      data: { status, version: Number(flags.version) || (await eventVersion(trip, id)) },
    });
  },
  "prep list": async ({ flags }) => (await data({ flags })).preparation,
  "prep add": async ({ flags, data: body }) =>
    api(`/trips/${await currentTrip(flags.trip)}/preparation`, {
      method: "POST",
      data: payload(body),
    }),
  "prep rm": async ({ args, flags }) => {
    if (!args[0]) throw new ApiError("用法：tt prep rm <准备事项编号> --yes");
    confirmDelete(flags, "准备事项");
    return api(
      `/trips/${await currentTrip(flags.trip)}/preparation/${args[0]}`,
      { method: "DELETE" },
    );
  },
  "prep check": async ({ args, flags }) => {
    if (!args[0]) throw new ApiError("用法：tt prep check <准备事项编号> [--off]");
    return api(`/trips/${await currentTrip(flags.trip)}/packing`, {
      method: "PUT",
      data: { itemId: args[0], checked: flags.off !== true },
    });
  },
  "doc list": async ({ flags }) => (await data({ flags })).documents,
  "doc upload": async ({ args, flags }) => {
    if (!args[0]) throw new ApiError("用法：tt doc upload <文件> [--category 分类] [--private]");
    const trip = await currentTrip(flags.trip),
      id = randomUUID();
    await upload(
      `/trips/${trip}/documents/${id}${query({
        category: flags.category,
        private: flags.private === true ? 1 : undefined,
      })}`,
      args[0],
      flags.name,
    );
    return { id, trip: trip, name: flags.name ?? args[0], category: flags.category ?? "行程", private: flags.private === true };
  },
  "doc rename": async ({ args, flags, data: body }) => {
    const [id, name] = args,
      trip = await currentTrip(flags.trip);
    if (!id || !(name || body?.name))
      throw new ApiError("用法：tt doc rename <资料编号> <新名称>");
    const list = (await api(`/trips/${trip}/data`)).documents,
      previous = list.find((item) => item.id === id);
    if (!previous) throw new ApiError(`行程里没有编号为 ${id} 的资料`);
    return api(`/trips/${trip}/documents/${id}`, {
      method: "PATCH",
      data: { name: name ?? body.name, previousName: previous.name },
    });
  },
  "doc rm": async ({ args, flags }) => {
    if (!args[0]) throw new ApiError("用法：tt doc rm <资料编号> --yes");
    confirmDelete(flags, "资料");
    return api(`/trips/${await currentTrip(flags.trip)}/documents/${args[0]}`, {
      method: "DELETE",
    });
  },
  "doc download": async ({ args }) => {
    if (!args[0] || !args[1]) throw new ApiError("用法：tt doc download <资料编号> <保存路径>");
    return download(`/files/${args[0]}`, args[1]);
  },
  "me doc list": async () => {
    const result = await bootstrap();
    return result.documents;
  },
  "me doc upload": async ({ args, flags }) => {
    if (!args[0]) throw new ApiError("用法：tt me doc upload <文件>");
    const id = `personal-${randomUUID()}`;
    await upload(`/personal-documents/${id}`, args[0], flags.name);
    return { id, name: flags.name ?? args[0], private: true };
  },
  "me doc rm": ({ args, flags }) => {
    if (!args[0]) throw new ApiError("用法：tt me doc rm <证件编号> --yes");
    confirmDelete(flags, "证件");
    return api(`/personal-documents/${args[0]}`, { method: "DELETE" });
  },
  "expense list": async ({ flags }) => (await data({ flags })).expenses,
  "expense add": async ({ flags, data: body }) => {
    const value = payload(body),
      trip = await currentTrip(flags.trip),
      list = await members(trip);
    if (!value.participants?.length)
      value.participants = list.map((member) => member.id);
    if (!value.payerId)
      throw new ApiError(
        `缺少付款人 payerId，可选：${list.map((member) => `${member.id}（${member.name}）`).join("、")}`,
      );
    return api(`/trips/${trip}/expenses`, { method: "POST", data: value });
  },
  "expense rm": async ({ args, flags, data: body }) => {
    if (!args[0]) throw new ApiError("用法：tt expense rm <支出编号> --yes");
    confirmDelete(flags, "支出");
    const trip = await currentTrip(flags.trip),
      version = body?.version ?? (flags.version ? Number(flags.version) : await expenseVersion(trip, args[0]));
    return api(`/trips/${trip}/expenses/${args[0]}`, {
      method: "DELETE",
      data: { version },
    });
  },
  "expense receipt": async ({ args, flags }) => {
    if (!args[0]) throw new ApiError("用法：tt expense receipt <凭证文件>");
    const trip = await currentTrip(flags.trip),
      id = randomUUID();
    await upload(`/trips/${trip}/receipts/${id}`, args[0], flags.name);
    return { receiptId: id, hint: "作为 receiptIds 传入 expense add 即可关联" };
  },
  place: async ({ args, flags }) => {
    const text = args.join(" ") || flags.q;
    if (!text) throw new ApiError("用法：tt place <地点名称>");
    return api(`/places${query({ q: text })}`);
  },
  "market list": async ({ args, flags }) =>
    api(`/market${query({ q: args.join(" ") || flags.q, page: flags.page })}`),
  "market show": ({ args }) => {
    if (!args[0]) throw new ApiError("用法：tt market show <公开行程编号>");
    return api(`/market/${args[0]}`);
  },
  "market copy": ({ args }) => {
    if (!args[0]) throw new ApiError("用法：tt market copy <公开行程编号>");
    return api(`/market/${args[0]}/copy`, { method: "POST", data: {} });
  },
  raw: ({ args, data: body }) => {
    const [method, path] = args;
    if (!method || !path) throw new ApiError("用法：tt raw <GET|POST|PUT|PATCH|DELETE> <路径> [--data '{…}']");
    return api(path, { method: method.toUpperCase(), data: body });
  },
};
export function resolve(rest) {
  for (const length of [3, 2, 1]) {
    const key = rest.slice(0, length).join(" ");
    if (commands[key]) return { key, handler: commands[key], args: rest.slice(length) };
  }
  throw new ApiError(`未知命令：${rest.join(" ")}，先看 SKILL.md 的命令表`);
}
