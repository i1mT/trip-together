// CI / Cloudflare Builds 专属构建脚本。
//
// 串联：
// 1. 全量静态 TypeScript 类型检查 (web & infra)
// 2. 打包旅行助手 Skill (web/public/skill/trip-together-skill.zip)
// 3. Next.js 静态资源构建 (next build web -> web/out)
// 4. iOS 15.5/15.6 浏览器兼容性强校验 (防止 Safari 16.4+ 语法泄露)
//
// 任何一步失败均以非 0 状态码退出，打断 CI 构建流程。
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function run(cmd, args, stepName) {
  console.log(`\n▶ [CI Build] ${stepName}...`);
  const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\n✗ [CI Build] 步骤失败: ${stepName} (退出码: ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

// 0. 生成 Worker 类型定义（infra/env.d.ts 被 gitignore 排除，CI 环境需从 wrangler 配置重新生成）
run("npx", [
  "wrangler",
  "types",
  "--strict-vars",
  "false",
  "--config",
  "infra/wrangler.jsonc",
  "infra/env.d.ts",
], "生成 Worker 类型定义 (wrangler types)");

// 1. 静态代码类型检查
run("npm", ["run", "typecheck"], "TypeScript 静态类型检查");

// 2. 打包旅行助手 Skill
run("node", ["scripts/build-skill.mjs"], "打包旅行助手 Skill");

// 3. Next.js 导出构建
run("npx", ["next", "build", "web"], "Next.js 前端静态导出构建");

// 4. iOS 15.5/15.6 浏览器兼容性校验（Acorn 扫描不兼容语法）
run("node", ["scripts/check-browser-support.mjs"], "iOS 15.5/15.6 浏览器兼容性扫描");

console.log("\n✓ [CI Build] 构建及全部兼容性、静态检查通过，产物准备就绪！\n");
