// 校验生产前端产物是否能在最低支持浏览器上解析。
//
// Next.js 16 默认按 MODERN_BROWSERSLIST_TARGET（chrome/edge/firefox 111、safari 16.4）
// 编译，会在产物里保留 iOS 15.5 无法解析的语法（class static block 等）。
// 根目录 package.json 的 browserslist 把这些语法降级；本脚本负责在构建后验证结果，
// 防止依赖升级或配置回退后再次把不兼容语法送进生产。
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const acorn = require("next/dist/compiled/acorn");

// Safari 15.4 已实现 ES2022 的类字段与私有静态字段，可以放心用 acorn 按 ES2022 解析。
// 下列语法属于 Safari 15.5 之后才实现的能力，必须确认不存在。
const UNSUPPORTED = [
  [
    "class static block（class static block，Safari 16.4+）",
    /(?:^|[;{}(\s])static\s*\{/,
  ],
  ["static private method（Safari 16.4+）", /static\s+#[\w$]+\s*\(/],
  ["static accessor（Safari 17.4+）", /(?:^|[;{}\s])accessor\s/],
  [
    "explicit resource management（using，Safari 18+）",
    /(?:^|[;{}\s])using\s+[\w$]+\s*=/,
  ],
  ["await using（Safari 18+）", /await\s+using\s/],
  [
    "decorator（Safari 17.4+）",
    /(?:^|\n)\s*@[A-Za-z_$][\w$]*(?:\s*\([^)\n]*\))?\s*\n\s*(?:export\s+)?class\s/,
  ],
  [
    "RegExp v flag（Safari 17+）",
    /(?:^|[=(,:;[!&|?{}\s])\/[^/\n]*\/[dgimsuvy]*v[dgimsuvy]*[;,)\]}.\s]/,
  ],
  [
    "RegExp duplicate named group（Safari 17.4+）",
    /\(\?<([A-Za-z_$][\w$]*)>[\s\S]{0,200}?\(\?<\1>/,
  ],
  [
    "Array.prototype.toSorted / toReversed / toSpliced / with（Safari 16.4+）",
    /\.(?:toSorted|toReversed|toSpliced)\(|\.with\(/,
  ],
  ["Array.fromAsync（Safari 18.4+）", /Array\.fromAsync\b/],
  [
    "Object.groupBy / Map.groupBy（Safari 17.4+）",
    /\b(?:Object|Map)\.groupBy\b/,
  ],
  ["Promise.withResolvers（Safari 17.4+）", /Promise\.withResolvers\b/],
  ["AbortSignal.any（Safari 17.4+）", /AbortSignal\.any\b/],
  ["RegExp set notation（[[:，Safari 17+）", /\[\[:/],
  ["Atomics.waitAsync（Safari 16.4+）", /Atomics\.waitAsync\b/],
];

const dir = resolve(process.argv[2] ?? "web/out/_next/static/chunks");
let failed = 0;
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".js"))
  .sort();
if (files.length === 0) {
  console.error(`未找到前端 chunk：${dir}`);
  process.exit(1);
}
for (const name of files) {
  const source = readFileSync(resolve(dir, name), "utf8");
  const problems = [];
  try {
    acorn.parse(source, { ecmaVersion: 2022 });
  } catch (error) {
    problems.push(`无法按 ES2022 解析：${error.message}`);
  }
  for (const [label, pattern] of UNSUPPORTED) {
    if (pattern.test(source)) problems.push(`包含不兼容语法：${label}`);
  }
  if (problems.length > 0) {
    failed += 1;
    console.error(`✗ ${name}`);
    for (const problem of problems) console.error(`    ${problem}`);
  }
}
if (failed > 0) {
  console.error(
    `\n${failed} 个产物无法在 iOS 15.5 Safari 解析。请确认根目录 package.json 的 browserslist 未被移除或改写。`,
  );
  process.exit(1);
}
console.log(
  `浏览器兼容检查通过：${files.length} 个 chunk 均可在 iOS 15.5 Safari 解析。`,
);
