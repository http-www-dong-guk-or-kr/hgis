#!/usr/bin/env node
// 전역 안전 검사(범용) — PreToolUse: Bash | PowerShell
//
// 어느 C++ 프로젝트에서나 쓰는 "두 번째 방어선"이다. 특정 프로젝트(GIS 등)의 규칙은 넣지 않는다.
// 프로젝트 전용 규칙은 그 프로젝트의 .claude/hooks/ 안에 따로 둔다(전역 훅과 함께 둘 다 실행된다).
//
// 왜 필요한가
//   - Windows 에는 Claude Code 의 OS 샌드박스가 없다. 그래서 되돌릴 수 없는 명령을 도구 실행 직전에 한 번 더 걸러 준다.
//   - permissions.deny 와 같은 방향이며 보안 경계는 아니다(우회하려는 악의적 명령은 못 막는다).
//
// 동작
//   - stdin 으로 훅 JSON 을 받는다. 위험하면 hookSpecificOutput.permissionDecision 을 deny 또는 ask 로 낸다.
//   - deny 사유는 Claude 에게 보여 대안을 찾게 한다. ask 사유는 사용자에게 한국어로 보여 준다.
//   - 이 스크립트 안의 오류는 조용히 통과시킨다(fail-open). 권한 규칙(settings.json)은 그대로 적용된다.
//
// 시험: 저장소 .claude/skills/dev-setup/test-apply.mjs 가 이 파일을 실제로 실행해 확인한다.

import fs from "node:fs";

const SAFE_EXIT = () => process.exit(0);

function readInput() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function respond(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }) + "\n",
  );
  process.exit(0);
}

// 정규화: git -C/-c 의 따옴표 인자를 한 덩어리로 접고, 역슬래시→슬래시, 따옴표·백틱 제거, 공백 정리, 소문자
//   (git -C "C:\내 폴더\repo" push --force 처럼 공백이 든 경로가 규칙을 피해 가지 못하게 먼저 접는다.)
function norm(text) {
  return String(text ?? "")
    .replace(/\bgit((?:\s+-[cC]\s+(?:"[^"]*"|'[^']*'|\S+))+)/gi, (m, opts) => "git" + opts.replace(/(-[cC]\s+)(?:"[^"]*"|'[^']*')/g, "$1x"))
    .replace(/\\/g, "/")
    .replace(/[`'"]/g, "")
    .replace(/[ \t\r]+/g, " ")
    .toLowerCase()
    .trim();
}

// ---------------------------------------------------------------------------
// 명령 나누기(따옴표·here-string·heredoc 을 아는 분리)
//   ; && || | 줄바꿈 "밖에서만" 자른다. 따옴표 안의 글자는 쪼개지 않는다.
//   → git commit -m "..." 메시지나 rg "git push --force" 검색어 안의 글자가 실행 명령으로 오인되지 않는다.
// ---------------------------------------------------------------------------
function splitCommand(raw) {
  const s = String(raw ?? "");
  const n = s.length;
  const segs = []; // { text, sep }  sep = 이 조각 앞의 구분자
  let cur = "";
  let sep = "";
  let pendingHeredoc = null;
  const flush = (nextSep) => {
    if (cur.trim()) segs.push({ text: cur, sep });
    cur = "";
    sep = nextSep;
  };
  let i = 0;
  while (i < n) {
    const ch = s[i];
    const two = s.slice(i, i + 2);

    // PowerShell here-string:  @" ... "@   /   @' ... '@   (여는 표시는 줄 끝에 온다)
    if ((two === '@"' || two === "@'") && /^[ \t]*\r?\n/.test(s.slice(i + 2))) {
      const close = "\n" + two[1] + "@";
      const end = s.indexOf(close, i + 2);
      const stop = end === -1 ? n : end + close.length;
      cur += s.slice(i, stop);
      i = stop;
      continue;
    }
    // 따옴표 문자열
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (ch === '"' && (s[j] === "\\" || s[j] === "`")) {
          j += 2;
          continue;
        }
        if (s[j] === ch) break;
        j++;
      }
      cur += s.slice(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }
    // bash heredoc:  <<WORD  <<-WORD  <<'WORD'  <<"WORD"  (본문은 다음 줄부터 WORD 만 있는 줄까지)
    if (two === "<<" && s[i + 2] !== "<") {
      const m = /^<<-?[ \t]*(['"]?)([A-Za-z_][\w-]*)\1/.exec(s.slice(i));
      if (m) {
        pendingHeredoc = m[2];
        cur += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (ch === "\n") {
      if (pendingHeredoc) {
        const re = new RegExp("\\n[ \\t]*" + pendingHeredoc + "[ \\t]*(?=\\r?\\n|$)");
        const m = re.exec(s.slice(i));
        const stop = m ? i + m.index + m[0].length : n;
        cur += s.slice(i, stop);
        i = stop;
        pendingHeredoc = null;
        continue;
      }
      flush("\n");
      i++;
      continue;
    }
    if (ch === ";") {
      flush(";");
      i++;
      continue;
    }
    if (two === "&&" || two === "||") {
      flush(two);
      i += 2;
      continue;
    }
    if (ch === "|") {
      flush("|");
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  flush("");
  return segs;
}

// 실행이 아니라 "글자(데이터)"를 다루는 명령이면 따옴표·heredoc 안의 글자를 검사에서 뺀다.
const DATA_VERBS = new Set(["rg", "grep", "egrep", "fgrep", "ag", "ack", "sls", "select-string", "findstr", "echo", "write-host", "write-output", "printf", "set-content", "add-content", "out-file", "cat", "tee"]);
const INTERPRETERS = new Set(["python", "python3", "py", "node", "ruby", "perl", "php"]);
const SHELLS = new Set(["bash", "sh", "zsh", "pwsh", "powershell", "cmd", "iex", "invoke-expression", "source", "."]);
const GIT_TEXT_SUBS = new Set(["commit", "tag", "notes", "merge", "revert", "stash", "cherry-pick", "log", "grep", "show", "blame"]);

function firstWord(seg) {
  const m = /^\s*(?:&\s+|\.\s+)?([^\s]+)/.exec(seg);
  if (!m) return "";
  return m[1].replace(/^["']|["']$/g, "").split(/[\\/]/).pop().replace(/\.exe$/i, "").toLowerCase();
}

function gitSubcommand(seg) {
  const m = /^\s*git(?:\s+(?:-[cC]\s+(?:"[^"]*"|'[^']*'|\S+)|--?[\w-]+(?:=\S+)?))*\s+([a-z-]+)/i.exec(seg);
  return m ? m[1].toLowerCase() : "";
}

const HEREDOC_BODY = /<<-?[ \t]*(['"]?)([A-Za-z_][\w-]*)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\r?\n|$)/g;
const HERESTRING_BODY = /@(["'])[ \t]*\r?\n[\s\S]*?\r?\n\1@/g;
const QUOTED = /"(?:[^"\\`]|\\[\s\S]|`[\s\S])*"|'[^']*'/g;

function stripData(seg, { quotes }) {
  let t = seg.replace(HEREDOC_BODY, "<<x").replace(HERESTRING_BODY, "x");
  if (quotes) t = t.replace(QUOTED, "x");
  return t;
}

// 실행되는 글자만 남긴 세그먼트 목록
function executableSegments(raw) {
  const segs = splitCommand(raw);
  // 앞 명령의 출력이 셸로 흘러가는 경우(cat <<EOF | bash)는 heredoc 도 실행 글자다.
  const pipedToShell = segs.some((sg) => sg.sep === "|" && SHELLS.has(firstWord(sg.text)));
  return segs.map((sg) => {
    if (pipedToShell) return sg.text;
    // 따옴표·here-string 으로 시작하는 조각은 문자열 값이다(예: @"..."@ | Set-Content). 셸로 흘러가지 않으면 데이터다.
    if (/^\s*(@["']|["'])/.test(sg.text)) return stripData(sg.text, { quotes: true });
    const w = firstWord(sg.text);
    if (DATA_VERBS.has(w)) return stripData(sg.text, { quotes: true });
    if (w === "git" && GIT_TEXT_SUBS.has(gitSubcommand(sg.text))) return stripData(sg.text, { quotes: true });
    if (INTERPRETERS.has(w)) return stripData(sg.text, { quotes: false });
    return sg.text;
  });
}

const excerpt = (s, n = 140) => {
  const one = String(s ?? "").replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
};

// git 뒤에 올 수 있는 -c/-C 옵션(정규화 뒤에는 모두 소문자 -c)
const GIT = String.raw`(^|[\s(])git( -c [^ ]+)* `;
const gitRe = (body, flags = "") => new RegExp(GIT + body, flags);

// ---------------------------------------------------------------------------
// 위험 명령 규칙 (세그먼트 단위)
// ---------------------------------------------------------------------------
const RULES = [
  // ---- git: 원격·기록을 되돌릴 수 없게 바꾸는 것
  {
    level: "deny",
    test: (s) => gitRe("push\\b").test(s) && /( --force\b| --force-with-lease\b| --mirror\b| -f( |$)| \+[^\s]+)/.test(s),
    why: "차단됨: 강제 푸시(force push)는 하지 않습니다(원격 기록을 되돌릴 수 없게 바꿉니다). 일반 git push 만 사용자가 요청할 때 하세요.",
  },
  {
    level: "ask",
    test: (s) => gitRe("push\\b").test(s) && /( --delete\b| -d( |$)| :[\w./-]+)/.test(s),
    why: "원격 브랜치를 지우려는 명령입니다. 정말 진행할까요?",
  },
  {
    level: "deny",
    test: (s) => gitRe("(filter-branch|filter-repo|update-ref -d|reflog expire|gc --prune=now)\\b").test(s),
    why: "차단됨: 저장소 기록을 다시 쓰는 명령입니다. 히스토리 재작성은 하지 않습니다.",
  },
  {
    level: "deny",
    test: (s) => gitRe("reset\\b.* --hard\\b").test(s),
    why: "차단됨: git reset --hard 는 저장하지 않은 작업을 지웁니다. 되돌리기가 필요하면 Claude Code 의 /rewind 를 쓰거나 사용자에게 안내하세요.",
  },
  {
    level: "deny",
    test: (s) => gitRe("clean\\b").test(s) && /( -[a-z]*f|--force)/.test(s),
    why: "차단됨: git clean -f 는 추적하지 않는 파일(사용자가 만든 자료 포함)을 지웁니다.",
  },
  {
    level: "ask",
    test: (s) => gitRe("(checkout|restore)\\b").test(s) && /( -- \.| \.$| --source| --staged --worktree| -f\b| --force\b)/.test(s),
    why: "작업 폴더의 변경을 통째로 되돌리려는 명령입니다. 저장하지 않은 수정이 사라집니다. 정말 진행할까요?",
  },
  {
    level: "ask",
    test: (s) => gitRe("(stash (drop|clear)|branch -d\\b|branch --delete|tag -d\\b|rebase\\b|commit .*--amend)").test(s),
    why: "저장소 기록·브랜치·보관함을 바꾸는 명령입니다(되돌리기 어렵습니다). 정말 진행할까요?",
  },
  {
    level: "ask",
    test: (s) => gitRe("(commit|push)\\b").test(s) && /( --no-verify\b| -n( |$))/.test(s),
    why: "저장소의 안전 점검(pre-commit 훅)을 건너뛰려는 명령입니다. 정말 진행할까요?",
  },
  {
    level: "deny",
    // git add -A / --all / . / ./ / .\ / * / :/ / :(top) — 저장소 전체를 한꺼번에 올리는 모든 표기
    test: (s) => gitRe("add\\b").test(s) && /( -a\b| --all\b| \.\/?( |$)| \*+( |$)| :\/( |$)| :\(top\)( |$))/.test(s),
    why:
      "차단됨: git add -A / . / ./ / * 는 비밀 파일(.env 등)이나 사용자 자료를 함께 올릴 수 있습니다. " +
      "바꾼 파일을 하나씩 경로로 지정해서 git add -- <경로> 로 추가하세요.",
  },
  {
    level: "ask",
    test: (s) => gitRe("commit\\b").test(s) && /( -[a-z]*a[a-z]*( |$)| --all\b)/.test(s) && !/ --amend/.test(s),
    why: "git commit -a 는 관련 없는 수정까지 한꺼번에 저장합니다. 경로를 지정해 저장하는 편이 안전합니다. 그래도 진행할까요?",
  },

  // ---- 실행 중인 프로세스
  {
    level: "ask",
    test: (s) => /(^|[^\w-])(stop-process|taskkill|pkill|killall)( |$)/.test(s),
    why: "프로그램을 강제로 종료하려는 명령입니다. 사용자가 실행 중인 프로그램이 아닌지 확인하세요. 정말 진행할까요?",
  },

  // ---- 예약 작업·서비스·레지스트리·정책 (개인 PC 설정을 바꾸는 종류)
  {
    level: "ask",
    test: (s) => /(^|[^\w-])(schtasks|register-scheduledtask|new-scheduledtask\w*|set-scheduledtask|unregister-scheduledtask|new-service|set-service|sc create|sc config|sc delete|reg (add|delete|import|load)|regedit|set-itemproperty hk|new-itemproperty hk|remove-itemproperty hk|set-executionpolicy|bcdedit|netsh (advfirewall|interface)|new-netfirewallrule|set-mppreference|add-mppreference)( |$)/.test(s),
    why: "예약 작업·서비스·레지스트리·보안 정책은 사용자 PC 설정을 바꿉니다. 사용자가 요청한 작업이 맞나요?",
  },
  {
    level: "deny",
    test: (s) => /( -encodedcommand\b| -enc )/.test(s),
    why: "차단됨: 암호화(인코딩)된 명령은 무엇을 하는지 알 수 없어 실행하지 않습니다.",
  },

  // ---- 디스크·삭제
  {
    level: "deny",
    test: (s) => /(^|[^\w-])(format-volume|clear-disk|diskpart|mkfs\S*|dd if=)( |$)/.test(s) || /(^|[^\w-])format [a-z]:/.test(s),
    why: "차단됨: 디스크를 지우거나 포맷하는 명령입니다.",
  },
  {
    level: "deny",
    test: (s) =>
      /(^|[^\w-])(rm|remove-item|ri|del|erase|rd|rmdir)( |$)/.test(s) &&
      /( |^)(\/|~|\$home|\$env:userprofile|%userprofile%|[a-z]:\/?|\.git\/?|\.claude\/?|\.\/?|\*)( |$)/.test(s.replace(/-(recurse|force|r|rf|fr|s|q|literalpath|path)\b/g, "")),
    why: "차단됨: 루트·홈·저장소 전체(.git 포함)·설정 폴더를 통째로 지우려는 명령으로 보입니다.",
  },
  {
    level: "ask",
    test: (s) => /(^|[^\w-])(rm|remove-item|ri|del|erase|rd|rmdir)( |$)/.test(s) && /( -r\b| -rf\b| -fr\b| -recurse\b| \/s\b)/.test(s),
    why: "폴더를 통째로(재귀) 지우려는 명령입니다. 지우는 대상이 맞는지 확인하세요. 정말 진행할까요?",
  },
  {
    level: "ask",
    test: (s) => /(^|[^\w-])robocopy( |$)/.test(s) && /( \/mir\b| \/purge\b| \/move\b| \/mov\b)/.test(s),
    why: "대상 폴더의 파일을 지우거나 옮기는 robocopy 옵션(/MIR, /PURGE, /MOVE)입니다. 정말 진행할까요?",
  },
  {
    level: "ask",
    test: (s) => /(^|[^\w-])(npm|pnpm|yarn|pip3?|py -3 -m pip|winget|choco|scoop) (install|i|add|upgrade|update|uninstall)\b/.test(s) || /(^|[^\w-])(winget|choco|scoop) (install|upgrade|uninstall)\b/.test(s),
    why: "프로그램(패키지)을 설치·변경하려는 명령입니다. 새 의존성은 요청 없이 추가하지 않습니다. 정말 진행할까요?",
  },
];

// 파이프(|)로 이어진 여러 명령을 함께 봐야 하는 규칙
const WHOLE_RULES = [
  {
    level: "deny",
    test: (f) => /(iwr|irm|invoke-webrequest|invoke-restmethod|curl|wget)\b[^\n]*\|\s*(iex|invoke-expression|sh|bash|zsh|pwsh|powershell)\b/.test(f),
    why: "차단됨: 내려받은 내용을 바로 실행하는 방식(다운로드 | iex/sh)은 허용하지 않습니다.",
  },
  {
    level: "deny",
    test: (f) =>
      /(^|[^\w-])(invoke-expression|iex)( |\(|$)/.test(f) &&
      /(invoke-webrequest|invoke-restmethod|iwr|irm|downloadstring|downloadfile|curl|wget)/.test(f),
    why: "차단됨: 내려받은 내용을 Invoke-Expression 으로 실행하는 방식은 허용하지 않습니다.",
  },
];

function checkCommand(rawCommand) {
  const full = norm(rawCommand);
  if (!full) return null;
  const segs = executableSegments(rawCommand).map(norm).filter(Boolean);

  for (const rule of WHOLE_RULES) {
    try {
      if (rule.test(full)) return { level: rule.level, why: rule.why };
    } catch {
      /* 무시 */
    }
  }

  let asked = null;
  for (const seg of segs) {
    for (const rule of RULES) {
      let hit = false;
      try {
        hit = rule.test(seg);
      } catch {
        hit = false;
      }
      if (!hit) continue;
      if (rule.level === "deny") return { level: "deny", why: rule.why };
      if (!asked) asked = { level: "ask", why: rule.why };
    }
  }
  return asked;
}

// ---------------------------------------------------------------------------
try {
  const input = readInput();
  const tool = String(input.tool_name ?? "");

  if (tool === "Bash" || tool === "PowerShell") {
    const verdict = checkCommand(input.tool_input?.command);
    if (verdict) {
      if (verdict.level === "ask") verdict.why = `${verdict.why}\n(명령: ${excerpt(input.tool_input?.command)})`;
      respond(verdict.level, verdict.why);
    }
  }
} catch {
  // 훅 자체의 오류는 작업을 막지 않는다.
}
SAFE_EXIT();
