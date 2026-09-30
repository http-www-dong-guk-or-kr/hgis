#!/usr/bin/env node
// C++ 검증 게이트 — "src/·tests/ 의 C++ 를 고치고도 검증 증거 없이 끝내지 않기"
//
// 이 프로젝트의 필수 개발 흐름(AGENTS.md "Mandatory development workflow"):
//   Claude Code + CLAUDE.md + clangd + Graft + Archify + CMake/CTest
// 모델이 여섯 도구 중 일부를 빼먹어도 턴이 그냥 끝나 버리는 문제를 기계적으로 막는다.
// (예전 Cursor 판 .cursor/hooks/dev-loop.mjs 를 Claude Code 이벤트 형식으로 옮기고 다음을 고쳤다.)
//   - JSON 을 정확히 파싱한다(정규식으로 원문을 훑지 않는다).
//   - 성공한 호출만 증거로 인정한다. 단, ctest 는 기준선 실패(알려진 실패)가 있어 실패한 실행도 "실행했다"로 인정하고 경고한다.
//   - ctest 는 "마지막 C++ 편집 이후"에 실행한 것만 인정한다.
//   - 이 PC 에 없는 도구(Graft·Archify·컴파일 DB·빌드 폴더)는 요구하지 않고, 답변에 "검증 미완료"로 적게 한다.
//   - 최대 2번만 막고, 그 뒤에는 "검증 미완료" 경고와 함께 풀어 준다(무한 루프 방지).
//   - Linux/원격(Claude Code on the web)에서는 빌드·ctest 를 요구하지 않고 "통과 보고 금지"만 안내한다.
//
// 사용: node dev-loop.mjs <session-start|after-edit|after-shell|after-shell-fail|after-lsp|after-mcp|stop>
// 시험: node .claude/hooks/test-hooks.mjs

import fs from "node:fs";
import path from "node:path";

const PLATFORM = process.env.KA_HOOK_PLATFORM || process.platform; // 시험용 재정의
const MAX_BLOCKS = 2;
const NEED = ["graft", "clangd", "archify", "ctest"];

// ---------------------------------------------------------------- 입력·경로
function readInput() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
const input = readInput();

const EVENT_BY_NAME = {
  SessionStart: "session-start",
  PostToolUse: "after-shell",
  PostToolUseFailure: "after-shell-fail",
  Stop: "stop",
};
const event = process.argv[2] || EVENT_BY_NAME[input.hook_event_name] || "";

const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const sid = String(input.session_id || "nosession").replace(/[^\w.-]/g, "_");
const stateRoot = path.join(root, ".claude", "hooks", "state");
const state = path.join(stateRoot, sid);

const exists = (rel) => {
  try {
    return fs.existsSync(path.join(root, rel));
  } catch {
    return false;
  }
};
const sp = (name) => path.join(state, name);
const ensure = () => fs.mkdirSync(state, { recursive: true });
const readText = (name) => {
  try {
    return fs.readFileSync(sp(name), "utf8");
  } catch {
    return "";
  }
};
const lines = (name) =>
  readText(name)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
const write = (name, text) => {
  ensure();
  fs.writeFileSync(sp(name), text, "utf8");
};
const append = (name, line) => {
  ensure();
  fs.appendFileSync(sp(name), line + "\n", "utf8");
};
const remove = (name) => {
  try {
    fs.rmSync(sp(name), { force: true });
  } catch {
    /* 무시 */
  }
};
const clearState = () => {
  try {
    fs.rmSync(state, { recursive: true, force: true });
  } catch {
    /* 무시 */
  }
};

function out(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

const isRemote = () => PLATFORM !== "win32" || process.env.CLAUDE_CODE_REMOTE === "true";

// ---------------------------------------------------------------- 사실 수집
const toPosix = (p) => String(p ?? "").replace(/\\/g, "/");

const CPP_UNDER_SRC_TESTS = /(^|\/)(src|tests)\/.+\.(cpp|cxx|cc|h|hpp)$/i;

function relativeToRoot(filePath) {
  const p = toPosix(filePath);
  const r = toPosix(root).replace(/\/+$/, "");
  if (p.toLowerCase().startsWith(r.toLowerCase() + "/")) return p.slice(r.length + 1);
  return null;
}

function isProductCpp(filePath) {
  const p = toPosix(filePath);
  const rel = relativeToRoot(p);
  if (rel !== null) return /^(src|tests)\/.+\.(cpp|cxx|cc|h|hpp)$/i.test(rel);
  // 프로젝트 루트를 알 수 없는 절대경로(예: 다른 PC 경로 형식)는 경로 조각으로 판정
  return CPP_UNDER_SRC_TESTS.test(p);
}

function detectTools() {
  return {
    graft: exists("build/tooling/graft-source/dist/mcp/tools.js"),
    clangd: exists("build/compile_commands.json") && exists("scripts/clangd-definition.py"),
    archify: exists(".claude/skills/archify/bin/archify.mjs") || exists(".agents/skills/archify/bin/archify.mjs"),
    ctest: exists("build/CMakeCache.txt"),
  };
}

function readBranch() {
  try {
    let gitDir = path.join(root, ".git");
    const st = fs.statSync(gitDir);
    if (st.isFile()) {
      const m = fs.readFileSync(gitDir, "utf8").match(/gitdir:\s*(.+)/);
      if (m) gitDir = path.resolve(root, m[1].trim());
    }
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    const m = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    return m ? m[1] : head.slice(0, 8);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- 증거 판별
const WRAPPER_CTEST = /ka-test(-all)?\.ps1|ka-check\.ps1|verify-release\.ps1|ctest-flake\.ps1|build-all\.ps1/i;
const DIRECT_CTEST = /(^|[^a-z0-9_-])ctest(\.exe)?(?![a-z0-9_-])/i;
const CTEST_LIST_ONLY = /ctest[^\n]*\s(-n|--show-only(=\w+)?|--version|-h|--help)(\s|$)/i;

function classify(command) {
  const c = toPosix(command);
  const ev = [];
  if (/clangd-definition\.py/i.test(c)) ev.push("clangd");
  if (/archify\.ps1['"\s]+(validate|deliver|visual-check|preview)\b/i.test(c)) ev.push("archify");
  if (WRAPPER_CTEST.test(c) || (DIRECT_CTEST.test(c) && !CTEST_LIST_ONLY.test(c))) ev.push("ctest");
  if (/graft-mcp\.mjs|graft_find_|graft_file_api|graft_check_freshness/i.test(c)) ev.push("graft");
  if (/--smoke-quit|ka-smoke\.ps1/i.test(c)) ev.push("smoke");
  return ev;
}

// 셸로 C++ 를 고친 경우(sed -i, Set-Content, cp, git checkout/restore, 리다이렉트 …)
const WRITE_VERB =
  /(^|[^\w-])(sed\s+-i|set-content|add-content|out-file|copy-item|cpi|move-item|tee|cp|mv|xcopy|robocopy|git\s+(apply|checkout|restore))(?![\w-])/i;
function shellCppEdits(command) {
  const c = toPosix(command).replace(/["'`]/g, "");
  const found = [];
  const re = /((?:[\w.:~-]+\/)*(?:src|tests)\/[^\s|;&<>]+\.(?:cpp|cxx|cc|h|hpp))\b/gi;
  let m;
  while ((m = re.exec(c))) {
    const before = c.slice(Math.max(0, m.index - 6), m.index);
    if (WRITE_VERB.test(c) || />>?\s*$/.test(before)) found.push(m[1]);
  }
  return found;
}

function mark(name, ok = true, extra = "") {
  write(name, `${Date.now()} ${ok ? "ok" : "fail"} ${extra}`.trim() + "\n");
}
function readMark(name) {
  const t = readText(name).trim();
  if (!t) return null;
  const [at, status] = t.split(/\s+/);
  return { at: Number(at) || 0, ok: status !== "fail" };
}

function addPending(filePath) {
  const p = toPosix(filePath);
  if (!isProductCpp(p)) return false;
  ensure();
  if (!lines("pending.txt").includes(p)) append("pending.txt", p);
  write("last_edit", String(Date.now()));
  return true;
}

// ---------------------------------------------------------------- 이벤트
function sessionStart() {
  const source = input.source || "startup";
  if (source === "startup" || source === "clear") {
    clearState();
    // 오래된 세션 상태 폴더 정리(7일)
    try {
      for (const d of fs.readdirSync(stateRoot)) {
        const full = path.join(stateRoot, d);
        if (Date.now() - fs.statSync(full).mtimeMs > 7 * 24 * 3600 * 1000) fs.rmSync(full, { recursive: true, force: true });
      }
    } catch {
      /* 폴더가 없으면 무시 */
    }
  }
  const branch = readBranch();
  const remote = isRemote();
  const rows = [];
  rows.push(`[ka-hgis 세션 상태] 브랜치: ${branch ?? "알 수 없음"} · 환경: ${remote ? "Linux/원격" : "Windows"}`);
  if (remote) {
    rows.push("이 환경에는 OSGeo4W·Visual Studio·qgis-dev 가 없습니다. 여기서 configure·build·ctest·smoke 를 하지 말고, 통과했다고 보고하지 마세요(빌드 게이트는 Windows PC).");
  } else {
    const t = detectTools();
    const o = (b) => (b ? "있음" : "없음");
    rows.push(`도구: Graft ${o(t.graft)} · clangd(컴파일 DB) ${o(t.clangd)} · Archify ${o(t.archify)} · 빌드 폴더 ${o(t.ctest)}`);
    if (!(t.graft && t.clangd && t.archify && t.ctest)) {
      rows.push("없는 도구가 있습니다. 사용자가 원하면 /ka-doctor 로 설치 방법을 안내하세요. 없는 도구는 최종 답변에 \"검증 미완료(도구 없음)\"으로 적습니다.");
    }
  }
  rows.push("규칙: src/·tests/ C++ 를 고치면 Graft·clangd·Archify·ctest 증거(입력+결과)를 이 세션에서 실제로 남긴 뒤에만 완료라고 합니다(Stop 훅이 확인). 문서만 고친 경우는 면제.");
  out({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: rows.join("\n") } });
}

function afterEdit() {
  const p = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (p) addPending(p);
}

function afterShell(ok) {
  const command = String(input.tool_input?.command ?? "");
  const errText = String(input.error ?? "");
  if (ok) {
    for (const p of shellCppEdits(command)) addPending(p);
  }
  for (const name of classify(command)) {
    if (name === "ctest") {
      if (!ok && /no tests were found|could not find (a )?(cmakecache|test)|not recognized as (the name of )?(a |an )?(internal|cmdlet|external)|command not found|cannot find path|is not recognized/i.test(errText)) {
        continue; // ctest 자체를 못 돌린 것은 증거가 아니다
      }
      mark("ctest", ok, command.slice(0, 160).replace(/\s+/g, " "));
    } else if (ok) {
      mark(name, true);
    }
  }
}

function afterMcp() {
  mark("graft", true);
}

const HINTS = {
  graft: "graft: mcp__hgis_graft__graft_file_api(바꾼 파일) 또는 graft_find_code(심볼) 를 호출하고, 시그니처·줄은 소스로 확인",
  clangd: "clangd: python scripts/clangd-definition.py <저장소 상대 파일> <줄> <열(UTF-16)> (또는 LSP 도구로 정의·진단 조회)",
  archify: "archify: powershell -NoProfile -File scripts/archify.ps1 validate architecture <json> --repo-root . --quality showcase --json → deliver → visual-check",
  ctest: "ctest: powershell -NoProfile -File scripts/ka-test.ps1 -Area <영역>  (영역은 ka-hgis-gis 스킬 references/task-map.md 참고. 바꾼 뒤에 실행한 것만 인정)",
};
const LABEL = { graft: "Graft", clangd: "clangd", archify: "Archify", ctest: "ctest" };

function stop() {
  const pending = lines("pending.txt");
  if (!pending.length) return; // 검증할 C++ 수정이 없다 → 통과

  const changed = pending.map((p) => relativeToRoot(p) ?? p).slice(0, 8);
  const changedText = changed.join(", ") + (pending.length > changed.length ? ` 외 ${pending.length - changed.length}개` : "");

  // Linux/원격: 빌드·ctest 를 요구하지 않는다. 통과 보고 금지만 한 번 안내.
  if (isRemote()) {
    if (readText("remote_notified")) return;
    write("remote_notified", "1\n");
    out({
      hookSpecificOutput: {
        hookEventName: "Stop",
        additionalContext:
          "C++ 파일을 고쳤지만 이 환경(Linux/원격)에는 OSGeo4W·Visual Studio·qgis-dev 가 없어 빌드·ctest·smoke 를 할 수 없습니다. " +
          "통과했다고 쓰지 말고, 최종 답변에 \"빌드·ctest·smoke 는 Windows PC 에서 확인 필요\"라고 분명히 적으세요. 바꾼 파일: " +
          changedText,
      },
    });
    return;
  }

  const avail = detectTools();
  const lastEdit = Number(readText("last_edit").trim()) || 0;
  const ct = readMark("ctest");
  const have = {
    graft: !!readMark("graft"),
    clangd: !!readMark("clangd"),
    archify: !!readMark("archify"),
    ctest: !!ct && ct.at >= lastEdit,
  };
  const missing = NEED.filter((n) => !have[n] && avail[n]);
  const unavailable = NEED.filter((n) => !have[n] && !avail[n]);
  const blocks = Number(readText("blocks").trim()) || 0;

  const releaseWithWarning = (why) => {
    // 상한 도달: 풀어 주되 사용자에게 보이는 경고를 남긴다.
    append("released.txt", pending.join("\n"));
    remove("pending.txt");
    remove("blocks");
    remove("unavailable_notified");
    out({
      systemMessage:
        `⚠ 검증 미완료: C++(${changedText})를 고쳤지만 ${why}. 자동 점검을 여기서 풀었습니다. ` +
        "이 변경은 아직 검증되지 않은 것으로 봐야 합니다. /ka-check 로 마저 확인하세요.",
    });
  };

  if (missing.length) {
    if (blocks >= MAX_BLOCKS) {
      releaseWithWarning(`${missing.map((n) => LABEL[n]).join("·")} 증거를 남기지 못했습니다`);
      return;
    }
    write("blocks", String(blocks + 1));
    const rows = [
      `[검증 게이트 ${blocks + 1}/${MAX_BLOCKS}] 이 세션에서 C++ 를 고쳤지만(${changedText}) 아래 검증 증거가 아직 없습니다: ${missing.join(", ")}.`,
      "지금 바로 실행하고, 입력과 결과를 답변에 적으세요. 도구 이름만 언급하는 것은 증거가 아닙니다.",
      ...missing.map((n) => `- ${HINTS[n]}`),
    ];
    if (unavailable.length) rows.push(`이 PC 에 없어서 요구하지 않는 도구: ${unavailable.map((n) => LABEL[n]).join(", ")} → 최종 답변에 "검증 미완료(도구 없음: …)"라고 적으세요.`);
    rows.push('실행할 수 없는 사정이 있으면 사유를 적고 "검증 미완료"로 보고하세요(결과를 지어내지 마세요).');
    out({
      decision: "block",
      reason: rows.join("\n"),
      systemMessage: `🔎 자동 점검: C++ 수정에 대한 검증 증거가 부족해 Claude 에게 마저 실행하도록 했습니다(${missing.join(", ")}).`,
    });
    return;
  }

  // 구할 수 있는 증거는 모두 있음
  if (unavailable.length && !readText("unavailable_notified")) {
    write("unavailable_notified", "1\n");
    out({
      decision: "block",
      reason:
        `[검증 게이트] 이 PC 에 없는 도구가 있습니다: ${unavailable.map((n) => LABEL[n]).join(", ")}. ` +
        `최종 답변에 "검증 미완료(도구 없음: ${unavailable.map((n) => LABEL[n]).join(", ")})"라고 분명히 적고, ` +
        "사용자가 원하면 /ka-doctor 로 설치 방법을 안내하세요.",
    });
    return;
  }

  // 통과: 상태를 비우고(다음 작업은 처음부터), 사용자에게 한 줄 보고
  const note = ct && !ct.ok ? " ⚠ ctest 에 실패가 있었습니다. 기준선(알려진 실패) 대비 새 실패인지 확인하세요." : "";
  const partial = unavailable.length ? ` (없는 도구: ${unavailable.map((n) => LABEL[n]).join("·")} → 검증 미완료)` : "";
  clearState();
  out({
    systemMessage: `✔ 검증 증거 확인: ${NEED.filter((n) => have[n]).map((n) => LABEL[n]).join("·") || "없음"}${partial}.${note}`,
  });
}

// ---------------------------------------------------------------- 진입점
try {
  switch (event) {
    case "session-start":
      sessionStart();
      break;
    case "after-edit":
      afterEdit();
      break;
    case "after-shell":
      afterShell(true);
      break;
    case "after-shell-fail":
      afterShell(false);
      break;
    case "after-lsp":
      mark("clangd", true);
      break;
    case "after-mcp":
      afterMcp();
      break;
    case "stop":
      stop();
      break;
    default:
      break;
  }
} catch (e) {
  // 훅 오류는 작업을 막지 않는다. 진단용으로 상태 폴더에만 남긴다.
  try {
    ensure();
    fs.appendFileSync(sp("errors.log"), `${new Date().toISOString()} ${event} ${e?.stack || e}\n`, "utf8");
  } catch {
    /* 무시 */
  }
}
process.exit(0);
