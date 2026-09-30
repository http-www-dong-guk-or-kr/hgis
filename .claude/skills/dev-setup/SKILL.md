---
name: 개발설정
description: Claude Code 최신 개발설정(Opus 5.5, C++ 전용)을 전역(~/.claude)과 프로젝트(.claude)에 한 번에 적용·등록한다. 새 PC나 새 C++ 프로젝트의 초기 설정, "개발설정", "개발환경 설정", "claude 설정 적용", "초기 설정 해줘" 요청에 쓴다. 사용자가 직접 실행했을 때만 동작한다.
argument-hint: "[전부|전역|프로젝트|점검] [강제]"
disable-model-invocation: true
allowed-tools: PowerShell(node "${CLAUDE_SKILL_DIR}/apply.mjs" *) Bash(node "${CLAUDE_SKILL_DIR}/apply.mjs" *)
---

인자: $ARGUMENTS

사용자가 `/개발설정`을 실행했다. 설치기(`apply.mjs`)가 실제 작업을 하고, 당신은 결과를 쉬운 한국어로 전달한다. 설정 파일을 직접 손으로 고치지 않는다(설치기가 백업·병합·검증을 한다).

## 순서
1. 인자를 옮긴다. 없으면 `전부`. `전역`·`프로젝트`·`점검`(아무것도 쓰지 않음)·`강제`(내 값도 권장값으로 덮어씀)를 그대로 넘긴다.
2. 먼저 **점검**으로 무엇이 바뀔지 본다(인자가 `점검`이 아니어도 첫 실행이면 한 번 본다):
   `node "${CLAUDE_SKILL_DIR}/apply.mjs" 점검 --project "${CLAUDE_PROJECT_DIR}"`
3. 적용한다(사용자가 이미 실행을 요청했으므로 다시 묻지 않는다. 사용자 값은 설치기가 보존하고 덮어쓸 때는 백업한다):
   `node "${CLAUDE_SKILL_DIR}/apply.mjs" $ARGUMENTS --project "${CLAUDE_PROJECT_DIR}"`
4. 출력을 다음 네 덩어리로 짧게 요약한다: **적용된 것 / 내 값을 유지한 것(주의) / 건너뛴 것과 이유 / 백업 위치**. 백업(`*.bak-날짜-시각`)은 문제가 생기면 그 파일로 되돌리면 된다고 알린다.
5. `✘`가 있으면 원인을 쉬운 말로 설명한다(예: 설정 파일에 주석이 있어 자동 병합을 하지 않았다 → 파일을 고친 뒤 다시 실행).
6. 마지막에 **다음 할 일**을 알린다: Claude Code 를 다시 시작(또는 `/clear`)하면 새 설정이 모두 적용되고, `/status`·`/hooks`·`/permissions`로 확인할 수 있다. 프로젝트에 자체 설치 안내(예: `docs/` 의 개발 환경 문서)가 있으면 그것을 이어서 안내한다.

## 무엇이 등록되나
- **전역**(`~/.claude`): `settings.json`(모델 Opus 5.5·노력 high·한국어·시간 제한·안전 권한·시작 시 위험 명령 점검 훅·상태 줄), `CLAUDE.md`(C++ 개발 원칙, 관리 블록만 갱신), `hooks/`(guard·statusline), 그리고 이 스킬 자체(어느 프로젝트에서나 `/개발설정`).
- **프로젝트**(현재 폴더, C++ 프로젝트 또는 빈 폴더): `.claude/settings.json`·`hooks/`·`rules/cpp.md`, `CLAUDE.md`(빌드·시험 명령을 자동 감지), `.clangd`·`.clang-format`·`.clang-tidy`, `.gitignore` 관리 블록. 이미 있는 파일은 그대로 두고 없는 것만 만든다. 이미 전용 Claude 설정(`.claude/settings.json` 과 직접 쓴 `CLAUDE.md`)이 있는 프로젝트는 골격을 만들지 않고 전역 설정만 적용한다.
- **어느 프로젝트에도 묶이지 않는다.** 전역 설정·훅·지침에는 특정 프로젝트(GIS 등)의 규칙이 없다. 프로젝트 전용 규칙은 그 프로젝트의 `.claude/` 에 둔다(전역과 프로젝트 훅은 둘 다 실행된다).
- 여러 번 실행해도 같은 결과다(멱등). 새 C++ 프로젝트를 시작할 때마다 그 폴더에서 `/개발설정 프로젝트`를 실행하면 초기 설정이 갖춰진다.
