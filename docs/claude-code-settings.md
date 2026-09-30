# Claude Code 설정 설명서 (2026-09-30 기준)

각 설정이 **무엇인지, 왜 그렇게 정했는지, 바꾸는 법**을 적었습니다. 근거는 Claude Code v2.1.285 공식 문서입니다(https://code.claude.com/docs/en/…). 사용법은 [claude-code-guide.md](claude-code-guide.md).

## 검증 상태 (정직하게)

- **확인함(Linux 클라우드)**: 훅 시험 `node .claude/hooks/test-hooks.mjs`(157건), `/개발설정` 설치기 시험 `node .claude/skills/dev-setup/test-apply.mjs`(65건), 모든 JSON 파싱, PowerShell 7 구문 검사, 스킬·규칙·에이전트·출력 스타일·SessionStart 훅이 실제 Claude Code 세션에서 로드되는 것.
- **확인 못 함(Windows PC에서만 가능)**: 실행기·설치 스크립트(`claude-dev`, `setup-claude-dev`)와 `ka-doctor/ka-build/ka-test/ka-smoke` 실제 실행, Graft·Archify 설치, 한글 경로 동작, 빌드·ctest·smoke. 이 저장소는 C++ 소스를 바꾸지 않았으므로 CMake/ctest 대상이 아닙니다.

## 파일 지도

| 파일 | 범위 | 역할 |
|---|---|---|
| `CLAUDE.md` | 프로젝트(커밋) | Claude 운영 지침. 첫 줄 `@AGENTS.md`로 제품 불변식을 가져옴 |
| `AGENTS.md` | 프로젝트(커밋) | 제품 불변식·GIS 규칙·검증 게이트의 정본 |
| `.claude/settings.json` | 프로젝트(커밋) | 모델·권한·훅·상태 줄·환경변수 |
| `.claude/settings.local.json` | 이 PC만(무시됨) | 내 승인 기록·개인 조정 |
| `.mcp.json` | 프로젝트(커밋) | Graft(`hgis_graft`) MCP 서버 |
| `.claude/rules/*.md` | 프로젝트 | 해당 파일을 다룰 때만 로드되는 규칙 |
| `.claude/skills/` | 프로젝트 | 도메인 스킬 4개, `/ka-*` 명령 8개, `/개발설정` |
| `.claude/agents/` | 프로젝트 | 읽기 전용 검토자 `ka-reviewer`·`ka-verifier` |
| `.claude/output-styles/ka-easy.md` | 프로젝트 | 결론부터 쉬운 한국어로 보고하는 말투 |
| `.claude/hooks/` | 프로젝트 | `guard.mjs`·`dev-loop.mjs`·`statusline.mjs`·시험 |
| `~/.claude/settings.json`·`CLAUDE.md`·`hooks/`·`skills/dev-setup/` | 전역(PC마다) | `/개발설정`이 만든 모든 프로젝트 공통 기본값 |

우선순위: 프로젝트 `.claude/settings.local.json` > 프로젝트 `.claude/settings.json` > 전역 `~/.claude/settings.json`. 같은 값이 여러 곳에 있으면 가까운 쪽이 이깁니다(배열형 권한 규칙은 합쳐집니다).

## 모델·노력

| 설정 | 값 | 이유 | 바꾸는 법 |
|---|---|---|---|
| `model` | `claude-opus-5-5` | Anthropic이 대부분의 작업에 권장하는 기본 모델. 별칭 `opus` 대신 전체 이름으로 고정해 세션 중 바뀌지 않게 함(v2.1.280 이상 필요) | `/model` 또는 파일 수정 |
| `modelSettings.claude-opus-5-5.effortLevel` | `high` | 기본은 `medium`. 이 프로젝트는 숨은 규칙(소스를 텍스트로 읽는 시험 등)이 많고 소유자가 코드를 못 읽어 정확성을 우선. 비용은 `medium`보다 약 1.4배 | `/effort medium`(빠르게) |
| `language` | `korean` | 응답 언어 기본값 | — |
| `outputStyle` | `ka-easy` | 결론부터·3덩어리 보고·쉬운 말. 코딩 지침은 유지(`keep-coding-instructions`) | `/output-style default` |

참고: Opus 5.5 는 사고(thinking)를 끌 수 없고(항상 적응형), 사용자 전역 최상위 `effortLevel` 키는 무시하므로 노력 수준은 `modelSettings`로 저장합니다. `max`는 설정 파일에 저장할 수 없고 세션에서 `/effort max`로만 씁니다.

## 권한

- `defaultMode: acceptEdits` — 파일 수정은 묻지 않고, 명령 실행은 묻습니다. "적용해라"에 곧바로 움직이고 위험한 것은 막기 위한 선택입니다. 매번 계획 승인을 원하면 `"plan"`으로 바꾸거나 세션 중 `Shift+Tab`.
- `disableBypassPermissionsMode: disable` — 모든 확인을 끄는 `--dangerously-skip-permissions` 모드를 쓸 수 없게 함(비개발자 안전).
- **허용(묻지 않음)**: `mcp__hgis_graft`, `scripts\ka-*.ps1` 래퍼, `cmake`·`ctest`, `clangd-definition.py`, `secret-scan.py`, `git add -- <경로>`, 공식 문서 사이트 몇 곳(QGIS·Qt·GDAL·PROJ·CMake·cppreference·clangd·Claude Code) 읽기.
- **항상 묻기**: `git push`(force 아님도 확인).
- **거부**: 강제 푸시·`reset --hard`·`git clean`·`git add -A`/`.`·`ka-hgis` 프로세스 종료·`schtasks`, 그리고 Read/Edit 도구로 계정 파일(`config/*.ini`, `secrets.ini`, `.env*`, `%LOCALAPPDATA%\ka-hgis`, 크래시 덤프, 바탕화면 포터블 폴더)과 `docs/architecture/*.html`(각 0.8MB) 읽기.
- 한계: 거부 규칙은 보안 경계가 아닙니다(다른 형태의 명령은 못 막음). Windows 에는 Claude Code 의 OS 샌드박스가 없어서 아래 훅이 한 번 더 점검합니다. `%LOCALAPPDATA%\ka-hgis\`의 주변유적 `receipts` 진단을 읽어야 하는 `ka-hgis-verify` 스킬은 Read 도구 거부에 걸릴 수 있으니, 필요하면 그 거부 규칙을 `*.ini`로 좁히는 결정을 사용자가 합니다.

## 훅 (자동 점검)

| 훅 | 시점 | 하는 일 | 끄는 법 |
|---|---|---|---|
| `dev-loop.mjs session-start` | 세션 시작 | 브랜치·도구 설치 상태·Linux 여부를 Claude 에게 알림, 상태 폴더 정리 | settings 의 `SessionStart` 삭제 |
| `guard.mjs` | 셸 명령·파일 읽기 직전 | 위험 명령을 막거나(강제 푸시·`reset --hard`·`git add -A`·앱 종료·예약 작업·다운로드 실행·디스크 지우기) 확인창으로 돌림(재귀 삭제·`.gpkg` 삭제/이동·포터블·`git commit -a` 등) | settings 의 `PreToolUse` 삭제 |
| `dev-loop.mjs after-*` | 편집·명령·MCP 호출 뒤 | C++ 수정과 Graft·clangd·Archify·ctest 실행 기록을 남김 | 위와 함께 삭제 |
| `dev-loop.mjs stop` | Claude 가 끝내려 할 때 | C++ 를 고쳤는데 증거가 없으면 최대 2번 되돌려 보내고 그 뒤엔 "검증 미완료" 경고와 함께 풀어 줌 | settings 의 `Stop` 삭제 |
| `statusline.mjs` | 화면 아래 줄 | 모델·노력·컨텍스트·브랜치·검증 대기 표시(토큰을 쓰지 않음) | `statusLine` 삭제 |

- **계정 파일 경로 점검은 꺼져 있습니다**(2026-09-30 소유자 승인). 다시 켜려면 환경변수 `KA_GUARD_SECRETS=1`. 그 밖의 위험 명령 점검은 그대로입니다.
- 훅 스크립트가 고장 나면 작업을 막지 않고 통과시킵니다(권한 규칙은 그대로 적용).
- `dev-loop.mjs`는 ctest 를 "마지막 C++ 수정 뒤에 돌린 것"만 인정하고, 알려진 실패 때문에 실패로 끝난 실행도 "실행했다"로 인정하되 경고합니다. `docs/ctest-baseline.txt`의 알려진 실패와 비교하는 것은 `scripts\ka-test.ps1`입니다.
- 시험: `node .claude/hooks/test-hooks.mjs`.

## 환경변수 (`.claude/settings.json`의 `env`)

| 변수 | 값 | 이유 |
|---|---|---|
| `CLAUDE_CODE_ENABLE_TODO_TOOLS` | `1` | Opus 5.5 는 기본으로 작업 목록 도구가 꺼져 있음. 진행 상황이 눈에 보이도록 켬 |
| `CLAUDE_CODE_GLOB_NO_IGNORE` | `false` | 파일 검색이 `.gitignore` 대상(`build/`, `dist/` 등)을 건너뛰게 해 컨텍스트 낭비를 줄임 |
| `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` | `3` | 종료 게이트가 무한히 되돌리지 않도록 상한(기본 8) |
| `BASH_DEFAULT_TIMEOUT_MS` / `BASH_MAX_TIMEOUT_MS` | 10분 / 30분 | 빌드·전체 ctest(약 220~290초)가 기본 2분에 잘리지 않도록 |

Windows 전역 설정에는 `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`도 들어갑니다(`/개발설정`이 Windows 에서만 추가). 이 프로젝트의 빌드 명령은 PowerShell 문법이라 PowerShell 도구를 기본 셸로 쓰게 하기 위해서입니다.

## MCP (Graft)

`.mcp.json`의 `hgis_graft`는 `node scripts/graft-mcp.mjs`를 `alwaysLoad`로 시작합니다(도구 4개가 처음부터 보이게). 엔진(`build/tooling/graft-source`)이 없으면 서버 연결이 실패로 나옵니다(설치는 `scripts\setup-claude-dev.bat`). 자세한 것은 [developer-tools.md](developer-tools.md).

## 스킬·에이전트·규칙

- 스킬 폴더 이름이 명령 이름입니다. `disable-model-invocation: true`인 것(`/ka-save`, `/ka-undo`, `/ka-run`, `/개발설정`)은 사용자가 직접 부를 때만 동작합니다.
- `/ka-save`는 `allowed-tools`로 "경로를 지정한 `git add`·`git commit -F`"만 그 턴에 한해 미리 허용합니다. 푸시는 항상 확인창이 뜹니다.
- 경로별 규칙(`.claude/rules/`)은 해당 파일을 읽을 때만 컨텍스트에 들어와 평소 낭비가 없습니다.
- `.claude/skills/archify/`는 PC마다 설치하는 고정 리비전이라 `.gitignore`에 있습니다([archify-setup.md](archify-setup.md)).

## 전역 설정과 `/개발설정`

`/개발설정`(또는 `node .claude/skills/dev-setup/apply.mjs`)은 다음을 **멱등**으로 적용합니다: 없는 키만 넣고 내 값은 유지, 덮어쓸 때는 `*.bak-날짜-시각` 백업, 설정 JSON 에 주석이 있으면 손대지 않고 알림, `점검`은 아무것도 쓰지 않음, `강제`는 내 값도 권장값으로. 새 C++ 프로젝트에서는 `프로젝트`로 초기 설정을 만듭니다. ka-hgis 저장소는 이미 전용 설정이 있어 골격을 만들지 않습니다.

## 자동 메모리

Claude Code 의 자동 메모리는 기본(켜짐)으로 두었습니다. 이 PC 에만 해당하는 사실(경로·설치 위치)을 기억하는 데 좋습니다. 프로젝트 지식은 `.codex/NOW.md`와 `docs/HANDOFF.md`에만 남기도록 `CLAUDE.md`에 적었습니다. 끄려면 설정에 `"autoMemoryEnabled": false`.

## 정리한 옛 설정

Cursor(`.cursor/`), Codex 잔재, Grok 4.7 고정 문구, `.agents/skills`(→`.claude/skills`)를 정리했습니다. 남긴 것: `.codex/NOW.md`(현행 일지, 폴더 이름만 낡음), `.githooks`(커밋 장부), 자동 푸시 스크립트(폐기 예정이지만 이 PC의 예약 작업을 먼저 확인해야 해서 삭제하지 않음).
