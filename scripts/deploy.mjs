import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { assertPrivateBucket, cloudflare } from "./production/cloudflare.mjs";

const root = resolve(import.meta.dirname, "..");
const configPath = "infra/wrangler.production.jsonc";
const config = JSON.parse(await readFile(resolve(root, configPath), "utf8"));
if (
  !/^[a-f0-9-]{36}$/.test(config.d1_databases[0].database_id) ||
  config.workers_dev !== false ||
  config.preview_urls !== false
)
  throw new Error("请检查生产数据库和域名配置");

const email = config.send_email?.find((binding) => binding.name === "EMAIL");
if (
  config.vars?.APP_ENV !== "production" ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.vars?.EMAIL_FROM ?? "") ||
  /@(?:example\.(?:com|test|invalid)|localhost)$/.test(
    config.vars.EMAIL_FROM,
  ) ||
  !email?.allowed_sender_addresses?.includes(config.vars.EMAIL_FROM) ||
  email.destination_address ||
  email.allowed_destination_addresses
)
  throw new Error(
    "请配置生产邮箱验证、真实发件地址及 EMAIL binding；公开注册不能限制收件地址",
  );

assertPrivateBucket(config);
if (!existsSync(resolve(root, "web/out/skill/trip-together-skill.zip")))
  throw new Error("web/out 里没有 skill 压缩包，请先运行 npm run build");
const secrets = cloudflare(
  `/accounts/${config.account_id}/workers/scripts/${config.name}/secrets`,
);
if (!secrets.some((secret) => secret.name === "SESSION_SIGNING_KEY"))
  throw new Error("请先通过 wrangler secret put 设置 SESSION_SIGNING_KEY");

function run(args) {
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, "node_modules/wrangler/bin/wrangler.js"),
      ...args,
      "--config",
      configPath,
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Initial data transfer is separate; routine releases must preserve live data.
run(["deploy", "--dry-run"]);
run(["d1", "migrations", "apply", "DB", "--remote"]);
run(["deploy"]);
assertPrivateBucket(config);
