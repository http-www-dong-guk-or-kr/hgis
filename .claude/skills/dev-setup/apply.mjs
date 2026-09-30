#!/usr/bin/env node
// 개발설정 설치기 — Claude Code 최신 개발설정(Opus 5.5, C++ 전용)을 전역과 프로젝트에 적용·등록한다.
//
//   node apply.mjs [전부|전역|프로젝트|점검] [강제]
//   node apply.mjs --scope all|global|project [--check] [--force] [--project <폴더>] [--home <폴더>] [--json]
//
// 전역(scope=global): <홈>/.claude 에 settings.json 병합, CLAUDE.md 관리 블록, hooks(guard·statusline), 이 스킬 자체를 설치한다.
// 프로젝트(scope=project): 현재 폴더가 C++ 프로젝트(또는 빈 폴더)면 .claude/settings.json·hooks·rules, CLAUDE.md,
//   .clangd·.clang-format·.clang-tidy, .gitignore 블록을 없는 것만 만든다. ka-hgis 는 이미 전용 설정이 있어 건드리지 않는다.
//
// 원칙: 멱등(여러 번 돌려도 같음) · 덮어쓰기 전 백업(<파일>.bak-날짜-시각) · 사용자 값은 --force 없이는 유지 ·
//       설정 JSON 이 깨져 있거나 주석이 있으면 손대지 않고 알린다 · --check 는 아무것도 쓰지 않는다.
// Node 18 이상, 외부 패키지 없음. Windows·Linux·macOS 공통.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(SKILL_DIR, "assets");
const SKILL_DIRNAME = path.basename(SKILL_DIR);
const PLATFORM = process.env.KA_DEVSETUP_PLATFORM || process.platform;
const BLOCK_BEGIN = "<!-- BEGIN 개발설정 (자동 관리: /개발설정이 갱신합니다. 이 블록 밖의 내용은 그대로 둡니다) -->";
const BLOCK_END = "<!-- END 개발설정 -->";
const GI_BEGIN = "# BEGIN 개발설정 (자동 관리)";
const GI_END = "# END 개발설정";

// ------------------------------------------------------------------ 인자
function parseArgs(argv) {
  const a = { scope: "all", check: false, force: false, json: false, project: null, home: null };
  const words = { 전부: "all", 전역: "global", 프로젝트: "project" };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--scope") a.scope = argv[++i];
    else if (v === "--check" || v === "점검") a.check = true;
    else if (v === "--force" || v === "강제") a.force = true;
    else if (v === "--json") a.json = true;
    else if (v === "--yes") continue;
    else if (v === "--project") a.project = argv[++i];
    else if (v === "--home") a.home = argv[++i];
    else if (words[v]) a.scope = words[v];
    else if (v === "--help" || v === "-h") a.help = true;
    else if (v) a.unknown = (a.unknown || []).concat(v);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("사용: node apply.mjs [전부|전역|프로젝트|점검] [강제]  (또는 --scope all|global|project --check --force --project <폴더> --home <폴더> --json)");
  process.exit(0);
}
if (!["all", "global", "project"].includes(args.scope)) {
  console.error(`알 수 없는 범위: ${args.scope} (전부|전역|프로젝트)`);
  process.exit(1);
}

const HOME = path.resolve(args.home || process.env.KA_DEVSETUP_HOME || os.homedir());
const CLAUDE_HOME = args.home
  ? path.join(HOME, ".claude")
  : path.resolve(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, ".claude"));
const PROJECT = path.resolve(args.project || process.env.CLAUDE_PROJECT_DIR || process.cwd());
const fwd = (p) => p.replace(/\\/g, "/");

// ------------------------------------------------------------------ 기록
const actions = []; // {scope, kind, path, note}
const note = (scope, kind, p, text = "") => actions.push({ scope, kind, path: p, note: text });

function stamp() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}
const RUN_STAMP = stamp();

// ------------------------------------------------------------------ 파일 도우미
const exists = (p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
};
const readText = (p) => fs.readFileSync(p, "utf8");
const readBuf = (p) => fs.readFileSync(p);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function backup(scope, file) {
  const dest = `${file}.bak-${RUN_STAMP}`;
  if (!args.check) fs.copyFileSync(file, dest);
  note(scope, "backup", dest, "덮어쓰기 전 백업");
}

// 텍스트(또는 Buffer)를 파일에 둔다. 같으면 유지, 다르면 백업 후 갱신, 없으면 생성.
function put(scope, file, content, { label = "" } = {}) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  if (exists(file)) {
    if (readBuf(file).equals(buf)) {
      note(scope, "keep", file, "이미 최신");
      return "keep";
    }
    backup(scope, file);
    if (!args.check) fs.writeFileSync(file, buf);
    note(scope, "update", file, label || "갱신");
    return "update";
  }
  if (!args.check) {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, buf);
  }
  note(scope, "create", file, label || "새로 만듦");
  return "create";
}

// 있으면 건드리지 않고(--force 면 백업 후 덮어씀), 없으면 만든다.
function putIfAbsent(scope, file, content, { label = "" } = {}) {
  if (exists(file) && !args.force) {
    note(scope, "keep", file, "이미 있어 그대로 둠");
    return "keep";
  }
  return put(scope, file, content, { label });
}

function copyTree(scope, srcDir, destDir, filter = () => true) {
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, ent.name);
    const d = path.join(destDir, ent.name);
    if (!filter(s, ent)) continue;
    if (ent.isDirectory()) copyTree(scope, s, d, filter);
    else put(scope, d, readBuf(s));
  }
}

// ------------------------------------------------------------------ JSON 병합
class BadJson extends Error {}

function readSettings(file) {
  if (!exists(file)) return { data: {}, existed: false };
  let text = readText(file);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // 메모장이 붙인 BOM
  if (!text.trim()) return { data: {}, existed: true };
  try {
    const data = JSON.parse(text);
    if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error("객체가 아님");
    return { data, existed: true };
  } catch (e) {
    throw new BadJson(`${file} 을(를) JSON 으로 읽지 못했습니다(${e.message}). 주석이나 쉼표 오류가 있으면 자동 병합이 주석을 지울 수 있어 손대지 않습니다. 파일을 고친 뒤 다시 실행하세요.`);
  }
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// 스칼라: 없으면 넣고, 다르면 --force 일 때만 덮어쓴다.
function setScalar(obj, keys, value, changes) {
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!isObj(cur[keys[i]])) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  const k = keys[keys.length - 1];
  const name = keys.join(".");
  if (!(k in cur)) {
    cur[k] = value;
    changes.push({ kind: "set", key: name, to: value });
  } else if (JSON.stringify(cur[k]) === JSON.stringify(value)) {
    changes.push({ kind: "same", key: name });
  } else if (args.force) {
    changes.push({ kind: "overwrite", key: name, from: cur[k], to: value });
    cur[k] = value;
  } else {
    changes.push({ kind: "differs", key: name, from: cur[k], to: value });
  }
}

function unionArray(obj, keys, values, changes) {
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!isObj(cur[keys[i]])) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  const k = keys[keys.length - 1];
  if (!Array.isArray(cur[k])) cur[k] = [];
  let added = 0;
  for (const v of values) {
    if (!cur[k].includes(v)) {
      cur[k].push(v);
      added++;
    }
  }
  changes.push({ kind: added ? "added" : "same", key: keys.join("."), count: added });
}

function hookSig(h) {
  return `${h.command ?? ""} ${(h.args ?? []).join(" ")}`.trim();
}

function mergeHooks(obj, tmplHooks, changes) {
  if (!isObj(obj.hooks)) obj.hooks = {};
  for (const [event, groups] of Object.entries(tmplHooks)) {
    if (!Array.isArray(obj.hooks[event])) obj.hooks[event] = [];
    const existingSigs = obj.hooks[event].flatMap((g) => (g.hooks ?? []).map(hookSig));
    for (const g of groups) {
      const sigs = (g.hooks ?? []).map(hookSig);
      const base = (s) => path.basename(s.split(" ").pop() || "");
      const present = sigs.every((s) => existingSigs.some((e) => e === s || (base(e) && base(e) === base(s))));
      if (present) {
        changes.push({ kind: "same", key: `hooks.${event}` });
      } else {
        obj.hooks[event].push(g);
        changes.push({ kind: "added", key: `hooks.${event}`, count: 1 });
      }
    }
  }
}

function substitute(value, map) {
  if (typeof value === "string") {
    let s = value;
    for (const [k, v] of Object.entries(map)) s = s.split(k).join(v);
    return s;
  }
  if (Array.isArray(value)) return value.map((x) => substitute(x, map));
  if (isObj(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, map)]));
  return value;
}

function mergeSettings(existing, template, { win }) {
  const out = JSON.parse(JSON.stringify(existing));
  const changes = [];
  if (template.$schema) setScalar(out, ["$schema"], template.$schema, changes);
  for (const k of ["model", "language", "cleanupPeriodDays", "outputStyle"]) {
    if (k in template) setScalar(out, [k], template[k], changes);
  }
  if (isObj(template.modelSettings)) {
    for (const [m, cfg] of Object.entries(template.modelSettings)) {
      for (const [ck, cv] of Object.entries(cfg)) setScalar(out, ["modelSettings", m, ck], cv, changes);
    }
  }
  const env = { ...(template.env ?? {}) };
  if (win) env.CLAUDE_CODE_USE_POWERSHELL_TOOL = "1";
  for (const [k, v] of Object.entries(env)) setScalar(out, ["env", k], v, changes);
  const perm = template.permissions ?? {};
  for (const k of ["disableBypassPermissionsMode", "disableAutoMode", "defaultMode"]) {
    if (k in perm) setScalar(out, ["permissions", k], perm[k], changes);
  }
  for (const k of ["allow", "ask", "deny"]) {
    if (Array.isArray(perm[k])) unionArray(out, ["permissions", k], perm[k], changes);
  }
  if (isObj(template.hooks)) mergeHooks(out, template.hooks, changes);
  if (isObj(template.statusLine)) {
    if (!("statusLine" in out)) {
      out.statusLine = template.statusLine;
      changes.push({ kind: "set", key: "statusLine" });
    } else if (JSON.stringify(out.statusLine) === JSON.stringify(template.statusLine)) {
      changes.push({ kind: "same", key: "statusLine" });
    } else if (args.force) {
      changes.push({ kind: "overwrite", key: "statusLine", from: out.statusLine });
      out.statusLine = template.statusLine;
    } else {
      changes.push({ kind: "differs", key: "statusLine", from: out.statusLine });
    }
  }
  return { merged: out, changes };
}

function reportChanges(scope, file, changes) {
  const sets = changes.filter((c) => ["set", "added", "overwrite"].includes(c.kind));
  const diffs = changes.filter((c) => c.kind === "differs");
  if (sets.length) {
    note(scope, "info", file, "적용: " + sets.map((c) => (c.kind === "added" ? `${c.key}(+${c.count})` : c.key)).join(", "));
  }
  for (const c of diffs) {
    note(scope, "warn", file, `내 값을 유지함: ${c.key} = ${JSON.stringify(c.from)} (권장 ${JSON.stringify(c.to)}). 권장값으로 바꾸려면 '강제'`);
  }
}

// ------------------------------------------------------------------ 관리 블록(CLAUDE.md, .gitignore)
function upsertBlock(scope, file, begin, end, body, { label }) {
  const block = `${begin}\n${body.replace(/\s+$/, "")}\n${end}\n`;
  if (!exists(file)) return put(scope, file, block, { label });
  let text = readText(file);
  const bom = text.charCodeAt(0) === 0xfeff ? "﻿" : "";
  if (bom) text = text.slice(1);
  const i = text.indexOf(begin);
  const j = text.indexOf(end);
  let next;
  if (i !== -1 && j !== -1 && j > i) {
    next = text.slice(0, i) + block + text.slice(j + end.length).replace(/^\r?\n/, "");
  } else {
    next = text.replace(/\s*$/, "") + (text.trim() ? "\n\n" : "") + block;
  }
  return put(scope, file, bom + next, { label });
}

// ------------------------------------------------------------------ 전역
function applyGlobal() {
  const scope = "global";
  const win = PLATFORM === "win32";
  const hooksDir = fwd(path.join(CLAUDE_HOME, "hooks"));

  // 1) hooks
  for (const f of ["guard.mjs", "statusline.mjs"]) {
    put(scope, path.join(CLAUDE_HOME, "hooks", f), readBuf(path.join(ASSETS, "hooks", f)), { label: "훅 스크립트" });
  }

  // 2) settings.json 병합
  const settingsPath = path.join(CLAUDE_HOME, "settings.json");
  const tmpl = substitute(JSON.parse(readText(path.join(ASSETS, "global", "settings.json"))), { __HOOKS_DIR__: hooksDir });
  const { data, existed } = readSettings(settingsPath);
  const { merged, changes } = mergeSettings(data, tmpl, { win });
  const text = JSON.stringify(merged, null, 2) + "\n";
  if (!existed) {
    put(scope, settingsPath, text, { label: "전역 설정 새로 만듦" });
  } else if (JSON.stringify(data) === JSON.stringify(merged)) {
    note(scope, "keep", settingsPath, "이미 최신(바꿀 것 없음)");
  } else {
    put(scope, settingsPath, text, { label: "전역 설정 병합(내 설정은 유지)" });
  }
  reportChanges(scope, settingsPath, changes);

  // 3) 전역 CLAUDE.md 관리 블록
  upsertBlock(scope, path.join(CLAUDE_HOME, "CLAUDE.md"), BLOCK_BEGIN, BLOCK_END, readText(path.join(ASSETS, "global", "CLAUDE.md")), {
    label: "전역 개발 지침(관리 블록)",
  });

  // 4) 이 스킬 자체를 전역에 등록(어느 프로젝트에서나 /개발설정 사용)
  const dest = path.join(CLAUDE_HOME, "skills", SKILL_DIRNAME);
  if (path.resolve(dest) === path.resolve(SKILL_DIR)) {
    note(scope, "keep", dest, "이미 전역 스킬 위치에서 실행 중");
  } else {
    copyTree(scope, SKILL_DIR, dest, (s, ent) => !/^test-.*\.mjs$/.test(ent.name) && !/\.bak-/.test(ent.name));
  }
}

// ------------------------------------------------------------------ 프로젝트
const CPP_EXT = /\.(cpp|cc|cxx|c\+\+|h|hpp|hxx)$/i;

function listDirSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function hasCppSources(dir, depth = 2) {
  for (const ent of listDirSafe(dir)) {
    if (ent.name.startsWith(".") || ["build", "node_modules", "out"].includes(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isFile() && CPP_EXT.test(ent.name)) return true;
    if (ent.isDirectory() && depth > 0 && hasCppSources(full, depth - 1)) return true;
  }
  return false;
}

function detectProject(dir) {
  const has = (n) => exists(path.join(dir, n));
  const entries = listDirSafe(dir).filter((e) => e.name !== ".git");
  const isKa = has(path.join(".claude", "hooks", "dev-loop.mjs")) || (has("AGENTS.md") && /ka-hgis/i.test(safeRead(path.join(dir, "AGENTS.md"))));
  return {
    isKa,
    isEmpty: entries.length === 0,
    isCpp: has("CMakeLists.txt") || has("meson.build") || has("CMakePresets.json") || hasCppSources(dir),
  };
}

function safeRead(p) {
  try {
    return readText(p);
  } catch {
    return "";
  }
}

function cmakeInfo(dir) {
  const text = safeRead(path.join(dir, "CMakeLists.txt"));
  const info = { name: null, std: null, presets: null };
  const nm = /project\s*\(\s*([A-Za-z0-9_.+-]+)/i.exec(text);
  if (nm) info.name = nm[1];
  const sd = /CMAKE_CXX_STANDARD\s+(\d\d)/.exec(text) || /cxx_std_(\d\d)/.exec(text);
  if (sd) info.std = sd[1];
  const presetsText = safeRead(path.join(dir, "CMakePresets.json"));
  if (presetsText) {
    try {
      const p = JSON.parse(presetsText.replace(/^﻿/, ""));
      const names = (arr) => (Array.isArray(arr) ? arr.map((x) => x.name).filter(Boolean) : []);
      info.presets = { configure: names(p.configurePresets), build: names(p.buildPresets), test: names(p.testPresets) };
    } catch {
      info.presets = null;
    }
  }
  return info;
}

function commandsFor(dir) {
  const has = exists(path.join(dir, "CMakeLists.txt"));
  const info = cmakeInfo(dir);
  if (info.presets && info.presets.configure.length) {
    const c = info.presets.configure[0];
    const b = info.presets.build[0];
    const t = info.presets.test[0];
    return [
      `- 구성: \`cmake --preset ${c}\``,
      b ? `- 빌드: \`cmake --build --preset ${b}\`` : "- 빌드: `cmake --build build`",
      t ? `- 시험: \`ctest --preset ${t}\`` : "- 시험: `ctest --test-dir build --output-on-failure`",
      "- clangd용 컴파일 DB: `CMAKE_EXPORT_COMPILE_COMMANDS=ON` 으로 구성(`build/compile_commands.json`)",
    ].join("\n");
  }
  if (has) {
    return [
      "- 구성: `cmake -S . -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`",
      "- 빌드: `cmake --build build`",
      "- 시험: `ctest --test-dir build --output-on-failure`",
    ].join("\n");
  }
  return "- 빌드 시스템을 자동으로 찾지 못했습니다. 실제로 쓰는 빌드·시험 명령을 여기에 적어 주세요(예: `cmake`, `ctest`).";
}

function layoutFor(dir) {
  const hints = {
    src: "소스",
    include: "공개 헤더",
    tests: "시험",
    test: "시험",
    cmake: "CMake 모듈",
    docs: "문서",
    scripts: "보조 스크립트",
    third_party: "외부 라이브러리(통째로 읽지 않음)",
    external: "외부 라이브러리(통째로 읽지 않음)",
    examples: "예제",
  };
  const rows = [];
  for (const ent of listDirSafe(dir)) {
    if (ent.isDirectory() && hints[ent.name]) rows.push(`- \`${ent.name}/\` — ${hints[ent.name]}`);
  }
  return rows.length ? rows.join("\n") : "- (아직 폴더 구조가 없습니다. 만들면서 이 절을 채워 주세요.)";
}

function applyProject() {
  const scope = "project";
  const det = detectProject(PROJECT);
  if (det.isKa) {
    note(scope, "skip", PROJECT, "ka-hgis 전용 설정이 이미 있습니다(.claude/settings.json·hooks·rules·skills). 프로젝트 골격은 만들지 않고 전역 설정만 적용합니다.");
    return;
  }
  if (!det.isCpp && !det.isEmpty && !args.force) {
    note(scope, "skip", PROJECT, "C++ 프로젝트로 보이지 않아 건너뜀(CMakeLists.txt·C++ 소스 없음). 그래도 만들려면 '프로젝트 강제'.");
    return;
  }
  if (det.isEmpty) note(scope, "info", PROJECT, "빈 폴더: 새 C++ 프로젝트 초기 설정(설정·규칙·clang 파일)만 만듭니다. 코드는 만들지 않습니다.");

  const claude = path.join(PROJECT, ".claude");
  // 훅
  for (const f of ["guard.mjs", "statusline.mjs"]) putIfAbsent(scope, path.join(claude, "hooks", f), readBuf(path.join(ASSETS, "hooks", f)), { label: "훅 스크립트" });

  // settings.json: 없으면 만들고, 있으면 관리 키만 병합(사용자 값 유지)
  const sPath = path.join(claude, "settings.json");
  const tmpl = JSON.parse(readText(path.join(ASSETS, "project-cpp", "settings.json")));
  const { data, existed } = readSettings(sPath);
  const { merged, changes } = mergeSettings(data, tmpl, { win: false });
  if (!existed) put(scope, sPath, JSON.stringify(merged, null, 2) + "\n", { label: "프로젝트 설정 새로 만듦" });
  else if (JSON.stringify(data) === JSON.stringify(merged)) note(scope, "keep", sPath, "이미 최신");
  else put(scope, sPath, JSON.stringify(merged, null, 2) + "\n", { label: "프로젝트 설정 병합(내 설정은 유지)" });
  reportChanges(scope, sPath, changes);

  // 규칙
  putIfAbsent(scope, path.join(claude, "rules", "cpp.md"), readBuf(path.join(ASSETS, "project-cpp", "rules", "cpp.md")), { label: "C++ 규칙" });

  // CLAUDE.md (감지 값으로 생성, 있으면 유지)
  const info = cmakeInfo(PROJECT);
  const name = info.name || path.basename(PROJECT);
  const md = readText(path.join(ASSETS, "project-cpp", "CLAUDE.md.tpl"))
    .replace(/\{\{NAME\}\}/g, name)
    .replace(/\{\{STD\}\}/g, info.std || "20")
    .replace(/\{\{COMMANDS\}\}/g, commandsFor(PROJECT))
    .replace(/\{\{LAYOUT\}\}/g, layoutFor(PROJECT));
  putIfAbsent(scope, path.join(PROJECT, "CLAUDE.md"), md, { label: "프로젝트 지침(자동 감지 값)" });

  // clang 파일: 이미 있으면 절대 덮어쓰지 않는다(--force 여도 백업 후 덮어쓰지 않도록 keep)
  for (const [asset, dest] of [["clangd", ".clangd"], ["clang-format", ".clang-format"], ["clang-tidy", ".clang-tidy"]]) {
    const target = path.join(PROJECT, dest);
    if (exists(target)) note(scope, "keep", target, "이미 있어 그대로 둠(프로젝트 고유 스타일 보존)");
    else put(scope, target, readBuf(path.join(ASSETS, "project-cpp", asset)), { label: "clang 설정" });
  }

  // .gitignore 관리 블록
  upsertBlock(scope, path.join(PROJECT, ".gitignore"), GI_BEGIN, GI_END, readText(path.join(ASSETS, "project-cpp", "gitignore.add")), {
    label: ".gitignore 관리 블록",
  });
}

// ------------------------------------------------------------------ 자체 점검
function selfCheck() {
  const rows = [];
  const ok = (cond, text) => rows.push(`${cond ? "✔" : "✘"} ${text}`);
  const g = path.join(CLAUDE_HOME, "settings.json");
  try {
    const { data } = readSettings(g);
    ok(!!data.model, `전역 settings.json 읽힘(model=${data.model ?? "없음"})`);
    const guard = path.join(CLAUDE_HOME, "hooks", "guard.mjs");
    ok(exists(guard), "전역 훅 guard.mjs 있음");
    if (exists(guard)) {
      const r = spawnSync(process.execPath, [guard], {
        input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git push --force origin main" } }),
        encoding: "utf8",
        timeout: 15000,
      });
      let deny = false;
      try {
        deny = JSON.parse(r.stdout).hookSpecificOutput.permissionDecision === "deny";
      } catch {
        deny = false;
      }
      ok(deny, "훅 시험: force push 를 차단함");
    }
    ok(exists(path.join(CLAUDE_HOME, "skills", SKILL_DIRNAME, "SKILL.md")) || path.resolve(SKILL_DIR) === path.resolve(path.join(CLAUDE_HOME, "skills", SKILL_DIRNAME)), "전역 스킬 /개발설정 등록됨");
  } catch (e) {
    ok(false, `전역 점검 실패: ${e.message}`);
  }
  return rows;
}

// ------------------------------------------------------------------ 실행
const KIND_LABEL = { create: "만듦", update: "갱신", keep: "유지", skip: "건너뜀", backup: "백업", info: "안내", warn: "주의" };
let exitCode = 0;
try {
  if (args.scope === "all" || args.scope === "global") applyGlobal();
  if (args.scope === "all" || args.scope === "project") applyProject();
} catch (e) {
  if (e instanceof BadJson) {
    console.error(`✘ ${e.message}`);
    exitCode = 2;
  } else {
    console.error(`✘ 예기치 않은 오류: ${e?.stack || e}`);
    exitCode = 1;
  }
}

const verify = !args.check && exitCode === 0 && (args.scope === "all" || args.scope === "global") ? selfCheck() : [];

if (args.json) {
  console.log(JSON.stringify({ ok: exitCode === 0, check: args.check, claudeHome: CLAUDE_HOME, project: PROJECT, actions, verify }, null, 2));
} else {
  console.log(`개발설정 ${args.check ? "점검(아무것도 쓰지 않음)" : "적용"} — 범위: ${{ all: "전역+프로젝트", global: "전역", project: "프로젝트" }[args.scope]}${args.force ? " · 강제" : ""}`);
  console.log(`전역 폴더: ${CLAUDE_HOME}`);
  console.log(`프로젝트: ${PROJECT}\n`);
  const order = ["create", "update", "backup", "warn", "info", "skip", "keep"];
  for (const kind of order) {
    const rows = actions.filter((a) => a.kind === kind);
    if (!rows.length) continue;
    if (kind === "keep") {
      console.log(`${KIND_LABEL.keep}: ${rows.length}개(이미 최신이거나 사용자 값 보존)`);
      continue;
    }
    for (const r of rows) console.log(`${KIND_LABEL[kind]}: ${r.path}${r.note ? ` — ${r.note}` : ""}`);
  }
  if (verify.length) console.log("\n" + verify.join("\n"));
  if (exitCode === 0) {
    console.log("\n다음 할 일:");
    console.log(args.check ? "- 위 내용을 적용하려면 '/개발설정'(점검 없이)을 실행하세요." : "- Claude Code 를 다시 시작하면(또는 /clear) 새 설정이 모두 적용됩니다. /status 로 모델·설정 출처를, /hooks·/permissions 로 훅과 권한을 확인할 수 있습니다.");
    if (PLATFORM === "win32" && (args.scope === "all" || args.scope === "global")) {
      console.log("- Windows: Graft·Archify 같은 개발 도구 설치는 저장소의 scripts\\setup-claude-dev.bat 이 담당합니다.");
    }
  }
}
process.exit(exitCode);
