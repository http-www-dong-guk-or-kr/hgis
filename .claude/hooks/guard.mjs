#!/usr/bin/env node
// PreToolUse 안전 검사 — Bash | PowerShell | Read | Grep | Glob
//
// 왜 필요한가
//   - Windows 에는 Claude Code 의 OS 샌드박스가 없다. 그래서 위험한 명령·비밀 파일 접근을
//     도구 실행 직전에 한 번 더 걸러 준다. 비개발자가 승인 창의 영어 명령을 읽고 판단하는 일을 줄이는 것이 목적이다.
//   - permissions.deny 와 같은 방향의 "두 번째 방어선"이다. 보안 경계는 아니다(우회하려는 악의적 명령은 못 막는다).
//
// 동작
//   - stdin 으로 훅 JSON 을 받는다. 위험하면 hookSpecificOutput.permissionDecision 을 deny 또는 ask 로 낸다.
//   - deny 사유는 Claude 에게 보여 대안을 찾게 한다. ask 사유는 사용자(소유자)에게 한국어로 보여 준다.
//   - 이 스크립트 안의 오류는 조용히 통과시킨다(fail-open). 권한 규칙(settings.json)은 그대로 적용된다.
//
// 시험: node .claude/hooks/test-hooks.mjs

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

// ---------------------------------------------------------------------------
// 정규화: 역슬래시→슬래시, 따옴표·백틱 제거, 공백 정리, 소문자
// ---------------------------------------------------------------------------
function norm(text) {
  return String(text ?? "")
    .replace(/\\/g, "/")
    .replace(/[`'"]/g, "")
    .replace(/[ \t\r]+/g, " ")
    .toLowerCase()
    .trim();
}

// 명령을 ; && || | 줄바꿈 단위로 자른다.
function segments(normalized) {
  return normalized
    .split(/\n|;|&&|\|\||\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const excerpt = (s, n = 140) => {
  const one = String(s ?? "").replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
};

// ---------------------------------------------------------------------------
// 1) 비밀·계정·개인정보 경로
//    (config/*.ini 에는 password= 평문이 들어 있을 수 있다. .gitignore 로도 다 못 막는다.)
// ---------------------------------------------------------------------------
const SENSITIVE_PATH = [
  /(^|[\s/=:(])config\/[^\s/*?]+\.ini\b/, // config/xxx.ini  (config/*.ini 같은 글롭 문자열은 제외)
  /(^|[\s/=:(])secrets\.ini\b/,
  /(^|[\s/=:(])\.env(?!\.example\b)(\.[\w.-]+)?(?=$|[\s;|&)>])/, // .env, .env.local (예시 파일 제외)
  /appdata\/local\/ka-hgis/, // 앱 설정·계정·주변유적 자료
  /localappdata%?\/ka-hgis/,
  /appdata\/local\/crashdumps/, // 크래시 덤프(메모리 조각 포함 가능)
  /localappdata%?\/crashdumps/,
  /\.config\/ka-hgis/, // GitHub 토큰 등
  /(^|[\s/=:(])git\.env\b/,
  /\.cursor\/mcp\.json/, // 다른 서버의 비밀이 섞여 있을 수 있는 사용자 MCP 설정
  /desktop\/hgis-/, // 바탕화면 포터블 폴더(계정 평문 포함 가능)
];

// 비밀 경로를 언급해도 되는 "내용을 읽지 않는" 동사
const SAFE_FIRST = /^(git (check-ignore|ls-files|status)\b|ls\b|dir\b|gci\b|get-childitem\b|test-path\b|get-item\b|resolve-path\b|split-path\b|join-path\b)/;

// 내용을 읽거나·복사하거나·보내거나·실행하는 동사(전체 명령 어디에 있어도 안전 판정을 취소한다)
const READERS =
  /(^|[^\w-])(cat|type|gc|get-content|more|less|head|tail|sls|select-string|findstr|grep|egrep|rg|awk|sed|cut|sort|uniq|tee|cp|copy|copy-item|cpi|xcopy|robocopy|mv|move|move-item|mi|ren|rename-item|rm|del|remove-item|ri|erase|set-content|add-content|out-file|clear-content|iwr|curl|wget|invoke-webrequest|invoke-restmethod|certutil|base64|python3?|py|node|ruby|perl|php|powershell|pwsh|cmd|bash|sh|zsh|import-csv|convertfrom-json|convertfrom-stringdata|get-filehash|compress-archive|tar|zip|7z|start|start-process|notepad|code|explorer|invoke-item|ii|open|scp|ftp|nc|ncat)(?![\w-])/;

function touchesSensitive(seg) {
  return SENSITIVE_PATH.some((re) => re.test(seg));
}

// 계정·키 파일 경로 차단(아래 checkSensitiveInCommand / checkFileTool).
// 2026-09-30 소유자가 "guard.mjs 계정 파일 차단을 꺼도 된다"고 승인해 기본은 꺼 둔다(차단하지 않음).
// 문서·스크립트 편집 명령의 글자를 계정 파일 접근으로 오인해 작업이 막히는 일이 있었다.
// 다시 켜려면 환경변수 KA_GUARD_SECRETS=1. (Read/Edit 도구의 계정 파일 거부 규칙은
// .claude/settings.json 의 permissions.deny 에 그대로 있다. 강제 푸시·삭제 등 다른 점검은 그대로다.)
const STRICT_SECRETS = process.env.KA_GUARD_SECRETS === "1";

// 저장소 config/ 폴더 자체를 읽는 명령(예: Get-ChildItem config/ | Select-String password, rg password ./config/)
// (git config, -Pattern config/ 처럼 폴더가 아니라 글자로 쓰인 경우는 제외)
const DIR_CONFIG = /(^|[\s=:(])(?<!git )(?<!-pattern )(?<!-match )(?<!-value )(?:[\w.:~-]*\/)*config\/(?:\*\S*)?(?=$|[\s;|&)])/;

function readsConfigDir(full) {
  if (!READERS.test(full.replace(SAFE_FIRST, ""))) return false;
  if (DIR_CONFIG.test(full)) return true;
  return /(^|\s)config(\s|$)/.test(full) && /\.ini\b/.test(full); // Get-ChildItem config *.ini | Select-String …
}

function checkSensitiveInCommand(full, segs) {
  if (!STRICT_SECRETS) return null;
  if (readsConfigDir(full)) {
    return {
      level: "deny",
      why:
        "차단됨: config/ 폴더에는 계정·키 파일(password= 평문)이 있을 수 있어 내용을 읽거나 복사하지 않습니다. " +
        "파일이 있는지만 보려면 Get-ChildItem/Test-Path 를, 설정 방법은 docs/user 와 코드(VworldSettings)를 근거로 안내하세요.",
    };
  }
  const hits = segs.filter(touchesSensitive);
  if (!hits.length) return null;
  const onlyMetadata =
    hits.every((s) => SAFE_FIRST.test(s) && !/>/.test(s)) && !READERS.test(full.replace(SAFE_FIRST, ""));
  if (onlyMetadata) return null;
  return {
    level: "deny",
    why:
      "차단됨: 계정·키·개인정보 파일(config/*.ini, secrets.ini, .env, 사용자 앱 설정 폴더 %LOCALAPPDATA%\\ka-hgis, 크래시 덤프, 바탕화면 포터블 폴더)은 " +
      "읽거나 바꾸거나 복사하지 않습니다. 파일이 있는지만 보려면 Test-Path, 무시 규칙은 git check-ignore 를 쓰세요. " +
      "값이 필요하면 값을 묻지 말고 사용자에게 직접 설정하도록 안내하세요. 문서에 파일 이름만 적는 일은 Edit 도구로 하세요.",
  };
}

// ---------------------------------------------------------------------------
// 2) 위험 명령 규칙 (세그먼트 단위)
// ---------------------------------------------------------------------------
const RULES = [
  // ---- git: 원격·기록을 되돌릴 수 없게 바꾸는 것
  {
    level: "deny",
    test: (s) => /(^|[\s(])git( -c [^ ]+| -C [^ ]+)* push\b/.test(s) && /( --force\b| --force-with-lease\b| --mirror\b| -f( |$)| \+[^\s]+)/.test(s),
    why: "차단됨: 강제 푸시(force push)는 하지 않습니다(원격 기록을 되돌릴 수 없게 바꿉니다). 일반 git push 만 사용자가 요청할 때 하세요.",
  },
  {
    level: "ask",
    test: (s) => /(^|[\s(])git( -c [^ ]+| -C [^ ]+)* push\b/.test(s) && /( --delete\b| -d( |$)| :[\w./-]+)/.test(s),
    why: "원격 브랜치를 지우려는 명령입니다. 정말 진행할까요?",
  },
  {
    level: "deny",
    test: (s) => /(^|[\s(])git( -c [^ ]+| -C [^ ]+)* (filter-branch|filter-repo|update-ref -d|reflog expire|gc --prune=now)\b/.test(s),
    why: "차단됨: 저장소 기록을 다시 쓰는 명령입니다. 이 프로젝트는 히스토리 재작성을 하지 않습니다.",
  },
  {
    level: "deny",
    test: (s) => /(^|[\s(])git( -c [^ ]+| -C [^ ]+)* reset\b.* --hard\b/.test(s),
    why: "차단됨: git reset --hard 는 저장하지 않은 작업을 지웁니다. 되돌리기가 필요하면 /ka-undo 스킬(또는 Claude Code 의 /rewind)을 쓰세요.",
  },
  {
    level: "deny",
    test: (s) => /(^|[\s(])git( -c [^ ]+| -C [^ ]+)* clean\b/.test(s) && /( -[a-z]*f|--force)/.test(s),
    why: "차단됨: git clean -f 는 추적하지 않는 파일(사용자가 만든 자료 포함)을 지웁니다.",
  },
  {
    level: "ask",
    test: (s) => /(^|[\s(])git( -c [^ ]+| -C [^ ]+)* (checkout|restore)\b/.test(s) && /( -- \.| \.$| --source| --staged --worktree| -f\b| --force\b)/.test(s),
    why: "작업 폴더의 변경을 통째로 되돌리려는 명령입니다. 저장하지 않은 수정이 사라집니다. 정말 진행할까요?",
  },
  {
    level: "ask",
    test: (s) => /(^|[\s(])git( -c [^ ]+| -C [^ ]+)* (stash (drop|clear)|branch -d\b|branch --delete|tag -d\b|rebase\b|commit .*--amend)/.test(s),
    why: "저장소 기록·브랜치·보관함을 바꾸는 명령입니다(되돌리기 어렵습니다). 정말 진행할까요?",
  },
  {
    level: "ask",
    test: (s) => /(^|[\s(])git( -c [^ ]+| -C [^ ]+)* (commit|push)\b/.test(s) && /( --no-verify\b| -n( |$))/.test(s),
    why: "저장소의 안전 점검(pre-commit 훅)을 건너뛰려는 명령입니다. 정말 진행할까요?",
  },
  {
    level: "deny",
    test: (s) => /(^|[\s(])git( -c [^ ]+| -C [^ ]+)* add\b/.test(s) && /( -a\b| --all\b| \.( |$)| \*( |$))/.test(s),
    why:
      "차단됨: git add -A / . / * 는 계정 파일(config/*.ini 등)이나 사용자 자료를 함께 올릴 수 있습니다. " +
      "바꾼 파일을 하나씩 경로로 지정해서 git add -- <경로> 로 추가하세요(/ka-save 스킬이 이 순서를 따릅니다).",
  },
  {
    level: "ask",
    test: (s) => /(^|[\s(])git( -c [^ ]+| -C [^ ]+)* commit\b/.test(s) && /( -[a-z]*a[a-z]*( |$)| --all\b)/.test(s) && !/ --amend/.test(s),
    why: "git commit -a 는 관련 없는 수정까지 한꺼번에 저장합니다. 경로를 지정해 저장하는 편이 안전합니다. 그래도 진행할까요?",
  },

  // ---- 사용자의 실행 중인 앱·프로세스
  {
    level: "deny",
    test: (s) => /(^|[^\w-])(stop-process|taskkill|pkill|killall|kill)( |$)/.test(s) && /ka-hgis/.test(s),
    why: "차단됨: 사용자가 실행 중인 고고학 전용 HGIS(ka-hgis)는 요청 없이 끄거나 다시 시작하지 않습니다. 사용자에게 앱을 닫아 달라고 안내하세요.",
  },
  {
    level: "ask",
    test: (s) => /(^|[^\w-])(stop-process|taskkill|pkill|killall)( |$)/.test(s),
    why: "프로그램을 강제로 종료하려는 명령입니다. 어떤 프로그램인지 확인하세요. 정말 진행할까요?",
  },

  // ---- 예약 작업·서비스·레지스트리·정책·원격 실행 (개인 PC 설정을 몰래 바꾸는 종류)
  {
    level: "deny",
    test: (s) => /(^|[^\w-])(schtasks|register-scheduledtask|new-scheduledtask\w*|set-scheduledtask|unregister-scheduledtask|new-service|set-service|sc create|sc config|sc delete|reg (add|delete|import|load)|regedit|set-itemproperty hk|new-itemproperty hk|remove-itemproperty hk|set-executionpolicy|bcdedit|netsh (advfirewall|interface)|new-netfirewallrule|set-mppreference|add-mppreference)( |$)/.test(s),
    why: "차단됨: 예약 작업·서비스·레지스트리·보안 정책은 사용자 PC 설정을 바꿉니다. 이 프로젝트는 숨은 자동화를 만들지 않습니다.",
  },
  {
    level: "deny",
    test: (s) => /( -encodedcommand\b| -enc )/.test(s),
    why: "차단됨: 암호화(인코딩)된 명령은 무엇을 하는지 알 수 없어 실행하지 않습니다.",
  },
  {
    level: "deny",
    test: (s) => /auto-git-push|install-auto-push-task|run-auto-push-now|start-cursor-worker|orca-worktree-setup/.test(s) && !/uninstall-auto-push-task/.test(s),
    why: "차단됨: 숨은 자동 푸시·원격 실행 워커 스크립트는 이 프로젝트 규칙(숨은 auto-push 금지, force-push 금지)과 충돌합니다. 폐기 예정입니다(docs/claude-code-guide.md 참고).",
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
    test: (s) => /(^|[^\w-])(rm|del|erase|remove-item|ri|mv|move|move-item|mi|ren|rename-item)( |$)/.test(s) && /\.(gpkg|qgz|qgs|gpkg-wal|gpkg-shm)\b/.test(s),
    why: "조사 원본(.gpkg/.qgz)을 지우거나 옮기거나 이름을 바꾸려는 명령입니다. 원본은 저장·내보내기·편집 요청이 아니면 건드리지 않습니다. 정말 진행할까요?",
  },

  // ---- 배포·포터블 (사용자가 명시적으로 요청할 때만)
  {
    level: "ask",
    test: (s) => /(publish-desktop|make-portable|verify-portable-pack|sign-release)\.ps1/.test(s) || /dist\/ka-hgis-portable/.test(s),
    why: "포터블 생성·바탕화면/L: 복사·배포 작업입니다. 사용자가 직접 요청했을 때만 진행합니다. 요청하신 작업이 맞나요?",
  },
  {
    level: "ask",
    test: (s) => /(^|[^\w-])(npm|pnpm|yarn|pip3?|py -3 -m pip|winget|choco|scoop) (install|i|add|upgrade|update|uninstall)\b/.test(s) || /(^|[^\w-])(winget|choco|scoop) (install|upgrade|uninstall)\b/.test(s),
    why: "프로그램(패키지)을 설치·변경하려는 명령입니다. 이 프로젝트는 새 의존성을 요청 없이 추가하지 않습니다. 정말 진행할까요?",
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
  const segs = segments(full);

  const sensitive = checkSensitiveInCommand(full, segs);
  if (sensitive) return sensitive;

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

// 파일 도구(Read/Grep/Glob)의 경로 검사
function checkFileTool(input) {
  if (!STRICT_SECRETS) return null;
  const ti = input.tool_input ?? {};
  // Grep 의 pattern 은 "찾을 글자"이지 경로가 아니다. 경로로 쓰이는 필드만 본다.
  const fields = input.tool_name === "Glob" ? [ti.pattern, ti.path] : input.tool_name === "Grep" ? [ti.path, ti.glob] : [ti.file_path];
  const candidates = fields.filter((v) => typeof v === "string");
  for (const c of candidates) {
    const n = norm(c);
    if (touchesSensitive(` ${n}`) || touchesSensitive(n)) {
      return {
        level: "deny",
        why:
          "차단됨: 계정·키·개인정보 파일은 열지 않습니다(config/*.ini, secrets.ini, .env, %LOCALAPPDATA%\\ka-hgis, 크래시 덤프). " +
          "설정 방법이 궁금하면 문서(docs/user)와 코드의 VworldSettings 를 근거로 안내하세요.",
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
try {
  const input = readInput();
  const tool = String(input.tool_name ?? "");
  let verdict = null;

  if (tool === "Bash" || tool === "PowerShell") {
    verdict = checkCommand(input.tool_input?.command);
    if (verdict?.level === "ask") {
      verdict.why = `${verdict.why}\n(명령: ${excerpt(input.tool_input?.command)})`;
    }
  } else if (tool === "Read" || tool === "Grep" || tool === "Glob") {
    verdict = checkFileTool(input);
  }

  if (verdict) respond(verdict.level, verdict.why);
} catch {
  // 훅 자체의 오류는 작업을 막지 않는다.
}
SAFE_EXIT();
