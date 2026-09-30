#!/usr/bin/env node
// 상태 줄 — 화면 맨 아래에 "지금 상태"를 한 줄로 보여 준다(모델 호출·토큰을 쓰지 않는다).
//   예) Opus 5.5 · 노력 high │ 컨텍스트 ▓▓▓░░░░░░░ 32% │ 브랜치 20260922-1 │ ⚠ C++ 수정 3개 검증 대기 │ 5시간 한도 18%
// 입력: Claude Code 가 stdin 으로 주는 JSON(https://code.claude.com/docs/en/statusline#available-data)
// 색을 끄려면 환경변수 NO_COLOR=1.

import fs from "node:fs";
import path from "node:path";

function readInput() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const input = readInput();
const useColor = !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = (s) => c("2", s);

const root = path.resolve(input.workspace?.project_dir || process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());

function branch() {
  try {
    let gitDir = path.join(root, ".git");
    if (fs.statSync(gitDir).isFile()) {
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

function pendingCount() {
  try {
    const sid = String(input.session_id || "").replace(/[^\w.-]/g, "_");
    if (!sid) return 0;
    const p = path.join(root, ".claude", "hooks", "state", sid, "pending.txt");
    return fs
      .readFileSync(p, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

const parts = [];

const model = input.model?.display_name || input.model?.id;
if (model) {
  const level = input.effort?.level;
  parts.push(c("1", model) + (level ? dim(` · 노력 ${level}`) : ""));
}

const used = input.context_window?.used_percentage;
if (typeof used === "number") {
  const pct = Math.max(0, Math.min(100, Math.round(used)));
  const filled = Math.round(pct / 10);
  const bar = "▓".repeat(filled) + "░".repeat(10 - filled);
  const color = pct >= 80 ? "31" : pct >= 50 ? "33" : "32";
  parts.push(`컨텍스트 ${c(color, bar)} ${pct}%`);
}

const br = branch();
if (br) parts.push(`브랜치 ${br}`);

const pend = pendingCount();
if (pend > 0) parts.push(c("33", `⚠ C++ 수정 ${pend}개 검증 대기`));

const five = input.rate_limits?.five_hour?.used_percentage;
if (typeof five === "number") parts.push(dim(`5시간 한도 ${Math.round(five)}%`));

process.stdout.write((parts.length ? parts.join(dim(" │ ")) : "ka-hgis") + "\n");
