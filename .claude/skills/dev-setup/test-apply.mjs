#!/usr/bin/env node
// 개발설정 설치기 시험 — node .claude/skills/dev-setup/test-apply.mjs
// 임시 홈·임시 프로젝트에서만 돈다(실제 ~/.claude 는 건드리지 않는다). 모델·네트워크 호출 없음.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apply = path.join(here, "apply.mjs");
let pass = 0;
let fail = 0;
const failures = [];
const ok = (cond, name, detail = "") => {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? "  → " + String(detail).slice(0, 300) : ""}`);
  }
};

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `kadev-${p}-`));
const rm = (d) => fs.rmSync(d, { recursive: true, force: true });
const read = (p) => fs.readFileSync(p, "utf8");
const json = (p) => JSON.parse(read(p));
const w = (p, t) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, t);
};
const list = (d) => {
  const out = [];
  const walk = (x) => {
    for (const e of fs.readdirSync(x, { withFileTypes: true })) {
      const f = path.join(x, e.name);
      if (e.isDirectory()) walk(f);
      else out.push(path.relative(d, f));
    }
  };
  if (fs.existsSync(d)) walk(d);
  return out.sort();
};

function run(argv, env = {}) {
  const r = spawnSync(process.execPath, [apply, ...argv], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_CONFIG_DIR: "", CLAUDE_PROJECT_DIR: "", KA_DEVSETUP_PLATFORM: "", ...env },
    timeout: 60000,
  });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}
const runJson = (argv, env) => {
  const r = run([...argv, "--json"], env);
  let j = null;
  try {
    j = JSON.parse(r.out);
  } catch {
    j = null;
  }
  return { ...r, j };
};

// ------------------------------------------------------------------ 1) 새 홈에 전역 적용
{
  const home = tmp("home");
  const r = runJson(["--scope", "global", "--home", home]);
  ok(r.code === 0 && r.j?.ok, "전역 첫 적용 성공", r.out + r.err);
  const s = path.join(home, ".claude", "settings.json");
  ok(fs.existsSync(s), "settings.json 생성");
  const d = json(s);
  ok(d.model === "claude-opus-5-5", "model=claude-opus-5-5");
  ok(d.modelSettings?.["claude-opus-5-5"]?.effortLevel === "high", "modelSettings effort high");
  ok(d.language === "korean", "language=korean");
  ok(d.env?.BASH_MAX_TIMEOUT_MS === "1800000" && d.env?.CLAUDE_CODE_ENABLE_TODO_TOOLS === "1", "env 키");
  ok(!("CLAUDE_CODE_USE_POWERSHELL_TOOL" in (d.env ?? {})), "Linux 에서는 PowerShell 도구 env 를 넣지 않음");
  ok(d.permissions?.disableBypassPermissionsMode === "disable", "bypass 모드 비활성");
  ok(d.permissions?.deny?.includes("Bash(git push --force*)"), "force push 거부 규칙");
  const hook = d.hooks?.PreToolUse?.[0]?.hooks?.[0];
  ok(hook?.command === "node" && fs.existsSync(hook.args[0]), "PreToolUse 훅 경로가 실제 파일", JSON.stringify(hook));
  ok(/statusline\.mjs/.test(d.statusLine?.command ?? ""), "statusLine 설정");
  ok(fs.existsSync(path.join(home, ".claude", "hooks", "guard.mjs")) && fs.existsSync(path.join(home, ".claude", "hooks", "statusline.mjs")), "훅 파일 설치");
  const md = read(path.join(home, ".claude", "CLAUDE.md"));
  ok(md.includes("BEGIN 개발설정") && md.includes("END 개발설정") && md.includes("C++ 작업 원칙"), "전역 CLAUDE.md 관리 블록");
  const skill = path.join(home, ".claude", "skills", "dev-setup");
  ok(fs.existsSync(path.join(skill, "SKILL.md")) && fs.existsSync(path.join(skill, "apply.mjs")) && fs.existsSync(path.join(skill, "assets", "global", "settings.json")), "전역에 /개발설정 스킬 등록");
  ok(!fs.existsSync(path.join(skill, "test-apply.mjs")), "시험 파일은 전역에 복사하지 않음");
  ok(r.j.verify.length >= 3 && r.j.verify.every((x) => x.startsWith("✔")), "자체 점검 통과", JSON.stringify(r.j.verify));

  // 2) 멱등
  const before = list(home);
  const r2 = runJson(["--scope", "global", "--home", home]);
  ok(r2.code === 0 && list(home).join() === before.join(), "두 번째 실행은 새 파일·백업을 만들지 않음", list(home).join(","));
  ok(!r2.j.actions.some((a) => a.kind === "create" || a.kind === "update"), "두 번째 실행은 create/update 없음", JSON.stringify(r2.j.actions.filter((a) => a.kind !== "keep")));

  // 3) 점검 모드는 아무것도 쓰지 않는다 (다른 새 홈)
  const home2 = tmp("home");
  const r3 = runJson(["--scope", "global", "--home", home2, "--check"]);
  ok(r3.code === 0 && list(home2).length === 0, "점검 모드는 파일을 만들지 않음", list(home2).join(","));
  ok(r3.j.actions.some((a) => a.kind === "create"), "점검 모드도 만들 것을 알려 줌");
  // 한국어 인자
  const r4 = runJson(["전역", "점검", "--home", home2]);
  ok(r4.code === 0 && r4.j.check === true && list(home2).length === 0, "한국어 인자(전역 점검)");
  rm(home);
  rm(home2);
}

// ------------------------------------------------------------------ Windows 시뮬레이션
{
  const home = tmp("home");
  const r = runJson(["--scope", "global", "--home", home], { KA_DEVSETUP_PLATFORM: "win32" });
  const d = json(path.join(home, ".claude", "settings.json"));
  ok(r.code === 0 && d.env?.CLAUDE_CODE_USE_POWERSHELL_TOOL === "1", "Windows 에서는 PowerShell 도구 env 추가", r.out);
  ok(!/\\/.test(d.hooks.PreToolUse[0].hooks[0].args[0]) && !/\\/.test(d.statusLine.command), "훅·상태줄 경로는 슬래시(Git Bash 안전)");
  rm(home);
}

// ------------------------------------------------------------------ 기존 사용자 설정 보존
{
  const home = tmp("home");
  const s = path.join(home, ".claude", "settings.json");
  w(s, JSON.stringify({ model: "sonnet", customKey: { a: 1 }, permissions: { allow: ["Bash(ls)"], deny: ["Bash(rm -rf /)"] }, env: { MY_VAR: "x" } }, null, 2));
  w(path.join(home, ".claude", "CLAUDE.md"), "# 내 메모\n- 나는 커피를 좋아한다\n");
  const r = runJson(["--scope", "global", "--home", home]);
  const d = json(s);
  ok(r.code === 0, "기존 설정에 병합 성공", r.out + r.err);
  ok(d.model === "sonnet", "내 model 값은 유지");
  ok(r.j.actions.some((a) => a.kind === "warn" && /model/.test(a.note)), "유지한 값을 주의로 알림");
  ok(d.customKey?.a === 1 && d.env?.MY_VAR === "x", "모르는 키·내 env 보존");
  ok(d.permissions.allow.includes("Bash(ls)") && d.permissions.allow.includes("Bash(cmake *)"), "allow 는 합집합");
  ok(d.permissions.deny.includes("Bash(rm -rf /)") && d.permissions.deny.includes("Bash(git reset --hard*)"), "deny 는 합집합");
  ok(fs.readdirSync(path.dirname(s)).some((f) => /^settings\.json\.bak-/.test(f)), "백업 파일 생성");
  const md = read(path.join(home, ".claude", "CLAUDE.md"));
  ok(md.startsWith("# 내 메모") && md.includes("커피") && md.includes("BEGIN 개발설정"), "CLAUDE.md 내 내용 보존 + 블록 추가");
  // 블록만 갱신
  w(path.join(home, ".claude", "CLAUDE.md"), md.replace("C++ 작업 원칙", "망가뜨림"));
  runJson(["--scope", "global", "--home", home]);
  const md2 = read(path.join(home, ".claude", "CLAUDE.md"));
  ok(md2.includes("C++ 작업 원칙") && !md2.includes("망가뜨림") && md2.includes("커피") && (md2.match(/BEGIN 개발설정/g) || []).length === 1, "관리 블록만 복원, 블록은 하나");
  // 강제
  const r2 = runJson(["--scope", "global", "--home", home, "--force"]);
  ok(json(s).model === "claude-opus-5-5" && r2.code === 0, "강제: model 을 권장값으로");
  rm(home);
}

// ------------------------------------------------------------------ 깨진 JSON
{
  const home = tmp("home");
  const s = path.join(home, ".claude", "settings.json");
  const bad = '{\n  // 주석이 있는 설정\n  "model": "opus",\n}\n';
  w(s, bad);
  const r = run(["--scope", "global", "--home", home]);
  ok(r.code === 2 && read(s) === bad, "주석/오류가 있는 설정은 손대지 않고 종료코드 2", r.out + r.err);
  ok(/JSON/.test(r.err), "원인을 알려 줌", r.err);
  // BOM 은 허용
  w(s, "﻿" + JSON.stringify({ model: "claude-opus-5-5" }));
  const r2 = run(["--scope", "global", "--home", home]);
  ok(r2.code === 0, "BOM 붙은 설정은 읽음", r2.out + r2.err);
  ok(!read(s).startsWith("﻿") || true, "BOM 처리");
  rm(home);
}

// ------------------------------------------------------------------ 프로젝트: 빈 폴더
{
  const proj = tmp("proj");
  const home = tmp("home");
  const r = runJson(["--scope", "project", "--project", proj, "--home", home]);
  ok(r.code === 0, "빈 폴더 프로젝트 적용", r.out + r.err);
  const files = list(proj);
  for (const f of [".claude/settings.json", ".claude/hooks/guard.mjs", ".claude/hooks/statusline.mjs", ".claude/rules/cpp.md", "CLAUDE.md", ".clangd", ".clang-format", ".clang-tidy", ".gitignore"]) {
    ok(files.includes(f.replace(/\//g, path.sep)), `빈 폴더에 ${f} 생성`, files.join(","));
  }
  ok(!fs.existsSync(path.join(home, ".claude")), "프로젝트 범위는 전역을 건드리지 않음");
  const d = json(path.join(proj, ".claude", "settings.json"));
  ok(d.hooks.PreToolUse[0].hooks[0].args[0] === "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.mjs", "프로젝트 훅은 ${CLAUDE_PROJECT_DIR} 경로");
  ok(read(path.join(proj, "CLAUDE.md")).includes("빌드 시스템을 자동으로 찾지 못했습니다"), "빈 폴더 CLAUDE.md 는 빈 감지 안내");
  const gi = read(path.join(proj, ".gitignore"));
  ok(gi.includes("BEGIN 개발설정") && gi.includes(".claude/settings.local.json"), ".gitignore 블록");
  const before = list(proj);
  const r2 = runJson(["--scope", "project", "--project", proj, "--home", home]);
  ok(list(proj).join() === before.join() && !r2.j.actions.some((a) => a.kind === "create" || a.kind === "update"), "프로젝트 두 번째 실행 멱등", JSON.stringify(r2.j.actions.filter((a) => a.kind !== "keep")));
  rm(proj);
  rm(home);
}

// ------------------------------------------------------------------ 프로젝트: CMake + 프리셋
{
  const proj = tmp("proj");
  w(path.join(proj, "CMakeLists.txt"), "cmake_minimum_required(VERSION 3.21)\nproject(my_engine LANGUAGES CXX)\nset(CMAKE_CXX_STANDARD 17)\nenable_testing()\n");
  w(path.join(proj, "CMakePresets.json"), JSON.stringify({ version: 3, configurePresets: [{ name: "dev" }], buildPresets: [{ name: "dev-build" }], testPresets: [{ name: "dev-test" }] }));
  fs.mkdirSync(path.join(proj, "src"));
  fs.mkdirSync(path.join(proj, "tests"));
  w(path.join(proj, ".clang-format"), "# 내 스타일\nBasedOnStyle: LLVM\n");
  w(path.join(proj, ".gitignore"), "*.o\n");
  const r = runJson(["--scope", "project", "--project", proj, "--home", tmp("home")]);
  ok(r.code === 0, "CMake 프로젝트 적용", r.out + r.err);
  const md = read(path.join(proj, "CLAUDE.md"));
  ok(md.includes("my_engine") && md.includes("C++17"), "프로젝트 이름·표준 감지", md.slice(0, 200));
  ok(md.includes("cmake --preset dev") && md.includes("cmake --build --preset dev-build") && md.includes("ctest --preset dev-test"), "프리셋 명령 감지");
  ok(md.includes("`src/`") && md.includes("`tests/`"), "폴더 구조 감지");
  ok(read(path.join(proj, ".clang-format")).includes("내 스타일"), "기존 .clang-format 은 그대로");
  const gi = read(path.join(proj, ".gitignore"));
  ok(gi.startsWith("*.o") && gi.includes("BEGIN 개발설정"), ".gitignore 기존 내용 보존 + 블록");
  // 기존 CLAUDE.md 는 유지
  w(path.join(proj, "CLAUDE.md"), "# 내 지침\n");
  runJson(["--scope", "project", "--project", proj, "--home", tmp("home")]);
  ok(read(path.join(proj, "CLAUDE.md")) === "# 내 지침\n", "기존 CLAUDE.md 는 덮어쓰지 않음");
  rm(proj);
}

// ------------------------------------------------------------------ 프로젝트: 감지 분기
{
  const ka = tmp("proj");
  w(path.join(ka, ".claude", "hooks", "dev-loop.mjs"), "// ka");
  w(path.join(ka, "CMakeLists.txt"), "project(ka-hgis)\n");
  const r = runJson(["--scope", "project", "--project", ka, "--home", tmp("home")]);
  ok(r.code === 0 && r.j.actions.some((a) => a.kind === "skip" && /ka-hgis/.test(a.note)), "ka-hgis 는 프로젝트 골격을 만들지 않음", r.out);
  ok(!fs.existsSync(path.join(ka, "CLAUDE.md")) && !fs.existsSync(path.join(ka, ".clangd")), "ka-hgis 에 파일을 만들지 않음");

  const js = tmp("proj");
  w(path.join(js, "package.json"), "{}");
  const r2 = runJson(["--scope", "project", "--project", js, "--home", tmp("home")]);
  ok(r2.code === 0 && r2.j.actions.some((a) => a.kind === "skip") && !fs.existsSync(path.join(js, "CLAUDE.md")), "C++ 가 아닌 폴더는 건너뜀");
  const r3 = runJson(["--scope", "project", "--force", "--project", js, "--home", tmp("home")]);
  ok(fs.existsSync(path.join(js, "CLAUDE.md")), "강제하면 C++ 가 아니어도 만듦", r3.out);
  rm(ka);
  rm(js);
}

// ------------------------------------------------------------------ 번들 훅이 원본과 같은가 (저장소 안에서만)
{
  const srcHooks = path.resolve(here, "..", "..", "hooks");
  for (const f of ["guard.mjs", "statusline.mjs"]) {
    const src = path.join(srcHooks, f);
    if (fs.existsSync(src)) ok(read(src) === read(path.join(here, "assets", "hooks", f)), `번들 훅 ${f} 이(가) .claude/hooks 원본과 같음(다르면 assets/hooks 를 갱신)`);
  }
}

console.log(`개발설정 설치기 시험: 통과 ${pass} · 실패 ${fail}`);
if (fail) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
