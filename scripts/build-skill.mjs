// 把 skills/trip-together 打包成一个 zip，随站点静态资源一起发布。
// 只依赖 Node 内置模块：deflate + 手写 ZIP 目录，输出可复现（时间戳固定）。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { deflateRawSync } from "node:zlib";
const source = resolve("skills/trip-together"),
  target = resolve("web/public/skill/trip-together-skill.zip"),
  prefix = "trip-together/",
  required = ["SKILL.md", "scripts/tt.mjs", "references/model.md"];
function fail(message) {
  console.error(`打包 skill 失败：${message}`);
  process.exit(1);
}
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.name === ".DS_Store") return [];
      return entry.isDirectory() ? collect(path) : [path];
    })
    .sort();
}
const files = collect(source);
for (const name of required)
  if (!files.includes(join(source, name))) fail(`缺少 ${name}`);
for (const file of files.filter((path) => path.endsWith(".mjs")))
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    fail(`${relative(source, file)} 语法检查未通过：${error.stderr ?? error}`);
  }

const table = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  table[index] = value >>> 0;
}
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
// 固定时间戳（2026-01-01 00:00:00）让重复构建得到完全相同的字节。
const dosTime = 0,
  dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1,
  chunks = [],
  central = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(prefix + relative(source, file).split("\\").join("/")),
    content = readFileSync(file),
    deflated = deflateRawSync(content, { level: 9 }),
    crc = crc32(content),
    mode = file.endsWith("tt.mjs") ? 0o100755 : 0o100644;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x0314, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(8, 10);
  header.writeUInt16LE(dosTime, 12);
  header.writeUInt16LE(dosDate, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(deflated.length, 20);
  header.writeUInt32LE(content.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE((mode << 16) >>> 0, 38);
  header.writeUInt32LE(offset, 42);
  chunks.push(local, name, deflated);
  central.push(header, name);
  offset += local.length + name.length + deflated.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...chunks, directory, end]);
rmSync(target, { force: true });
mkdirSync(resolve("web/public/skill"), { recursive: true });
writeFileSync(target, archive);
const digest = createHash("sha256").update(archive).digest("hex").slice(0, 16);
console.log(
  `已打包 ${files.length} 个文件 → web/public/skill/trip-together-skill.zip（${(archive.length / 1024).toFixed(1)} KB，sha256 ${digest}…）`,
);
