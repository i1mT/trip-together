// CI / Cloudflare Builds 专属部署脚本。
//
// 自动完成：
// 1. 支持直接使用 wrangler.production.jsonc（本地），或在开源 CI 环境下通过环境变量将开源模板动态生成为生产配置
// 2. 检查必要的生产 Key / Secrets（SESSION_SIGNING_KEY、GEOAPIFY_API_KEY 等）
// 3. D1 数据库 Migration（执行远程迁移，失败则立即中断）
// 4. Worker & 静态前端产物部署 (wrangler deploy)
// 5. R2 存储桶私有性复核，避免数据意外公网暴露
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { assertPrivateBucket, cloudflare } from "./production/cloudflare.mjs";

const root = resolve(import.meta.dirname, "..");
let configPath = process.env.WRANGLER_CONFIG ?? "infra/wrangler.production.jsonc";
let fullConfigPath = resolve(root, configPath);

// 如果是开源环境自动构建（没有 wrangler.production.jsonc 实体文件），根据公开模板与环境变量动态生成临时配置
if (!existsSync(fullConfigPath)) {
  console.log(`\n▶ [CI Deploy] 未找到 ${configPath}，检查是否为 Cloudflare CI 动态配置模式...`);
  const templatePath = resolve(root, "infra/wrangler.jsonc");
  if (!existsSync(templatePath)) {
    throw new Error("未找到基础模板 infra/wrangler.jsonc");
  }

  const baseConfig = JSON.parse(await readFile(templatePath, "utf8"));

  // 从环境变量中注入关键生产配置（如 CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID 等）
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.CF_ACCOUNT_ID;
  const d1DatabaseId = process.env.D1_DATABASE_ID;
  const workerName = process.env.WORKER_NAME ?? "trip-public";
  const r2BucketName = process.env.R2_BUCKET_NAME ?? "trip-public-private";
  const emailFrom = process.env.EMAIL_FROM ?? "noreply@trip.awell.one";
  const customDomain = process.env.CUSTOM_DOMAIN ?? "trip.awell.one";

  if (d1DatabaseId) {
    baseConfig.d1_databases[0].database_id = d1DatabaseId;
  }
  if (process.env.D1_DATABASE_NAME) {
    baseConfig.d1_databases[0].database_name = process.env.D1_DATABASE_NAME;
  }
  if (accountId) {
    baseConfig.account_id = accountId;
  }
  baseConfig.name = workerName;
  if (baseConfig.r2_buckets?.[0]) {
    baseConfig.r2_buckets[0].bucket_name = r2BucketName;
  }
  baseConfig.workers_dev = false;
  baseConfig.preview_urls = false;
  baseConfig.routes = [{ pattern: customDomain, custom_domain: true }];
  baseConfig.vars = {
    ...baseConfig.vars,
    APP_ENV: "production",
    EMAIL_FROM: emailFrom,
    // Analytics 相关非敏感配置支持从构建环境注入；缺省保持模板默认（开源用户默认关闭）
    ...(process.env.ANALYTICS_ENABLED ? { ANALYTICS_ENABLED: process.env.ANALYTICS_ENABLED } : {}),
    ...(process.env.ANALYTICS_HOSTNAME ? { ANALYTICS_HOSTNAME: process.env.ANALYTICS_HOSTNAME } : {}),
    ...(process.env.OPENPANEL_CLIENT_ID ? { OPENPANEL_CLIENT_ID: process.env.OPENPANEL_CLIENT_ID } : {}),
  };
  baseConfig.send_email = [
    {
      name: "EMAIL",
      allowed_sender_addresses: [emailFrom],
    },
  ];

  const generatedPath = resolve(root, "infra/.wrangler.ci.json");
  await writeFile(generatedPath, JSON.stringify(baseConfig, null, 2), "utf8");
  configPath = "infra/.wrangler.ci.json";
  fullConfigPath = generatedPath;
  console.log(`✓ 已根据 CI 环境变量成功生成部署配置: ${configPath}`);
}

console.log(`\n▶ [CI Deploy] 读取部署配置文件: ${configPath}`);
const config = JSON.parse(await readFile(fullConfigPath, "utf8"));

// 1. 基础生产配置检查
console.log("▶ [CI Deploy] 检查生产配置合法性...");
if (
  !/^[a-f0-9-]{36}$/.test(config.d1_databases?.[0]?.database_id ?? "") ||
  config.workers_dev !== false ||
  config.preview_urls !== false
) {
  throw new Error(
    "生产配置校验未通过：请确保已配置合法的 D1 database_id（UUID 格式），且 workers_dev 和 preview_urls 均为 false",
  );
}

const email = config.send_email?.find((binding) => binding.name === "EMAIL");
if (
  config.vars?.APP_ENV !== "production" ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.vars?.EMAIL_FROM ?? "") ||
  /@(?:example\.(?:com|test|invalid)|localhost)$/.test(config.vars.EMAIL_FROM) ||
  !email?.allowed_sender_addresses?.includes(config.vars.EMAIL_FROM) ||
  email.destination_address ||
  email.allowed_destination_addresses
) {
  throw new Error(
    "请配置生产邮箱验证、真实发件地址及 EMAIL binding；公开注册不能限制收件地址",
  );
}

// 2. 产物完整性校验
const skillZipPath = resolve(root, "web/out/skill/trip-together-skill.zip");
if (!existsSync(skillZipPath)) {
  throw new Error("web/out 里未检测到 skill 压缩包，请确认 build 步骤已执行！");
}

// 3. 必要生产 Secret 校验
console.log("▶ [CI Deploy] 检查必要 Secret 与环境变量...");
const requiredSecrets = config.secrets?.required ?? [
  "SESSION_SIGNING_KEY",
  "GEOAPIFY_API_KEY",
];

// 如果提供了 CLOUDFLARE_API_TOKEN，通过 Cloudflare API 查询已绑定的 secrets
if (process.env.CLOUDFLARE_API_TOKEN && config.account_id) {
  try {
    const existingSecrets = cloudflare(
      `/accounts/${config.account_id}/workers/scripts/${config.name}/secrets`,
    );
    const existingSecretNames = new Set(existingSecrets.map((s) => s.name));
    for (const required of requiredSecrets) {
      if (!existingSecretNames.has(required)) {
        throw new Error(
          `缺少必需的生产 Secret: ${required}，请先在 Cloudflare Dashboard 或通过 wrangler secret put 配置。`,
        );
      }
    }
    console.log(`✓ 必需 Secret 检查通过: ${requiredSecrets.join(", ")}`);
  } catch (err) {
    console.error(`✗ Secret 检查失败: ${err.message}`);
    throw err;
  }
} else {
  console.warn(
    "ℹ 未设置 CLOUDFLARE_API_TOKEN 或 account_id，跳过远程 Secret API 查询；请确保 Cloudflare 后台已配置必需 Secret: " +
      requiredSecrets.join(", "),
  );
}

// 4. R2 私有桶安全复核（部署前）
if (process.env.CLOUDFLARE_API_TOKEN && config.account_id && config.r2_buckets?.length) {
  console.log("▶ [CI Deploy] 验证 R2 存储桶私有访问权限...");
  assertPrivateBucket(config);
}

function runWrangler(args, label) {
  console.log(`\n▶ [CI Deploy] 执行 ${label}...`);
  const wranglerBin = resolve(root, "node_modules/wrangler/bin/wrangler.js");
  const result = spawnSync(
    process.execPath,
    [wranglerBin, ...args, "--config", configPath],
    { cwd: root, stdio: "inherit" },
  );
  if (result.status !== 0) {
    console.error(`\n✗ [CI Deploy] ${label} 失败，中断发布！(退出码: ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

// 5. 试运行部署检查
runWrangler(["deploy", "--dry-run"], "部署前 dry-run 检查");

// 6. 执行 D1 数据库 Migration（与发版强制捆绑）
runWrangler(["d1", "migrations", "apply", "DB", "--remote"], "D1 数据库远程 Migration");

// 7. 正式部署 Worker 与前端资源
runWrangler(["deploy"], "正式部署 Worker & 静态前端");

// 8. 部署后再次复核 R2 私有性
if (process.env.CLOUDFLARE_API_TOKEN && config.account_id && config.r2_buckets?.length) {
  console.log("▶ [CI Deploy] 部署后再次复核 R2 存储桶私有权限...");
  assertPrivateBucket(config);
}

console.log("\n✓ [CI Deploy] 恭喜！数据库迁移与服务部署均已成功完成！\n");
