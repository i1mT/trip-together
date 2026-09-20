#!/usr/bin/env node
// Trip Together 助手命令行。
// 用法：tt <命令> [参数] [--flag 值] [--data '<json>' | --data @file | --data -]
// stdout 只输出 JSON 结果，进度与提示写到 stderr，方便脚本和 AI 直接解析。
import { readFileSync } from "node:fs";
import { ApiError, configure, context, defaultBase } from "./lib/http.mjs";
import { credentialPath, readCredentials } from "./lib/auth.mjs";
import { resolve } from "./lib/commands.mjs";
function parse(argv) {
  const flags = {},
    rest = [];
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--") {
      rest.push(...argv.slice(index + 1));
      break;
    }
    if (!value.startsWith("--")) {
      rest.push(value);
      continue;
    }
    const [name, inline] = value.slice(2).split("=");
    if (inline !== undefined) flags[name] = inline;
    else if (argv[index + 1] !== undefined && !argv[index + 1].startsWith("--"))
      flags[name] = argv[++index];
    else flags[name] = true;
  }
  return { flags, rest };
}
function readData(flags) {
  const source = flags.data;
  if (source === undefined || source === true) return undefined;
  const text =
    source === "-"
      ? readFileSync(0, "utf8")
      : source.startsWith("@")
        ? readFileSync(source.slice(1), "utf8")
        : source;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ApiError(`--data 不是合法的 JSON：${error.message}`);
  }
}
function baseUrl(flags) {
  if (flags.base) return String(flags.base).replace(/\/+$/, "");
  if (process.env.TT_BASE) return process.env.TT_BASE.replace(/\/+$/, "");
  const saved = Object.keys(readCredentials())[0];
  return saved ?? defaultBase;
}
async function main() {
  const { flags, rest } = parse(process.argv.slice(2));
  if (!rest.length || flags.help || flags.h) {
    process.stdout.write(
      [
        "tt login | logout | whoami",
        "tt trip list | show [编号] | use <编号> | new | update | rm | join <口令>",
        "tt data",
        "tt event list | add | update <编号> | rm <编号> | status <编号> <状态>",
        "tt prep list | add | rm <编号> | check <编号> [--off]",
        "tt doc list | upload <文件> | rename <编号> <名称> | rm <编号> | download <编号> <路径>",
        "tt me doc list | upload <文件> | rm <编号>",
        "tt expense list | add | rm <编号> | receipt <文件>",
        "tt place <地点>",
        "tt market list [关键词] | show <编号> | copy <编号>",
        "tt raw <METHOD> <路径>",
        "",
        `站点 ${defaultBase}；凭据文件 ${credentialPath()}`,
      ].join("\n") + "\n",
    );
    return;
  }
  const base = baseUrl(flags),
    token = flags.token ? String(flags.token) : (readCredentials()[base]?.token ?? "");
  configure({ base, token });
  if (!token && !["login"].includes(rest[0]))
    throw new ApiError(`还没有登录，先运行：tt login`);
  const { handler, args } = resolve(rest),
    result = await handler({ args, flags, data: readData(flags) });
  process.stdout.write(
    `${JSON.stringify(result, null, flags.pretty ? 2 : 0)}\n`,
  );
}
try {
  await main();
} catch (error) {
  const message =
    error instanceof ApiError ? error.message : (error?.stack ?? String(error));
  process.stderr.write(`错误：${message}\n`);
  if (error instanceof ApiError && error.status === 401)
    process.stderr.write(`令牌可能已经过期，运行 tt login 重新授权。\n`);
  process.exit(1);
}
