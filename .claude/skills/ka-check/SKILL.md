---
name: ka-check
description: C++(src/·tests/)를 고친 뒤의 검증 루프를 실행한다: Graft 조회 → clangd 정의·진단 → Archify 구조도 → 대응 ctest(→ 화면 변경이면 smoke). "검증해줘", "시험 돌려줘", "됐는지 확인", "완료해도 돼?" 요청에 쓴다.
argument-hint: "[영역 또는 ctest 정규식 — 생략하면 바뀐 파일로 고른다]"
---

인자: $ARGUMENTS

**Linux/클라우드 세션이면** 빌드·ctest·smoke 를 하지 않는다. Graft·clangd 조회와 소스 읽기만 하고 "빌드·시험은 Windows PC 에서 확인 필요"라고 분명히 보고한다(통과라고 쓰지 않는다).

Windows 에서 순서대로 한다. 각 단계의 **입력과 결과**를 답에 적는다(도구 이름만 적는 것은 증거가 아니다).

1. **바뀐 것 파악** — `git status --short`, `git diff --stat`. `src/`·`tests/` 아래 `.cpp/.h` 가 없으면 "문서·설정만 변경: 빌드·ctest 면제"로 끝낸다.
2. **Graft** — 바뀐 파일마다 `mcp__hgis_graft__graft_file_api`, 심볼은 `graft_find_code`. 파서가 준 줄·시그니처는 소스로 다시 확인한다(교차 파일 영향이 완전하다고 말하지 않는다). Graft 가 연결되지 않았으면 그 사실을 적고 Grep 으로 대신하되 "Graft 검증 미완료"로 표시한다.
3. **clangd** — 호출 위치 하나 이상에 `python scripts\clangd-definition.py <저장소 상대 파일> <줄> <열(UTF-16)>`. 선언 위치와 `diagnostic_error_count` 를 적는다(QGIS 헤더 때문에 14~17건은 상시). `build\compile_commands.json` 이 없으면 `scripts\gen-compile-commands.ps1` 로 만든다.
4. **Archify** — 변경한 동작·구조만 담은 작은 도표 JSON 을 `build\qa\<이름>.json` 에 쓰고 모든 관계에 현재 소스 근거를 단다(계획 중인 것은 구분). `powershell -NoProfile -File scripts\archify.ps1 validate architecture build/qa/<이름>.json --repo-root . --quality showcase --json` → `deliver` → 화면 변경이면 `visual-check`. 형식은 `docs/architecture/*.workflow.json` 중 가까운 것을 본뜬다. 도표 검증은 C++ 의미 검증이 아니다.
5. **ctest** — `powershell -NoProfile -File scripts\ka-test.ps1 -Area <영역>` (또는 `-Regex '^(a|b)$'`). 영역은 `ka-hgis-gis/references/task-map.md`와 `.claude/rules/tests.md`의 "소스 텍스트를 읽는 시험" 표에서 고른다. 통과 기준은 **새 실패 없음**(알려진 실패는 `docs/ctest-baseline.txt`). 새 실패가 있으면 이 변경 때문인지 확인하고 고친 뒤 다시 돌린다.
6. **smoke** — 시작·UI·메뉴·지도·프로젝트 열기를 바꿨을 때만, 앱이 꺼져 있으면 `powershell -NoProfile -File scripts\ka-smoke.ps1`(종료 코드 0). 실행 중이면 건너뛰고 그렇게 적는다.
7. **기록·보고** — `.codex/NOW.md` 맨 위에 증거를 남기고, 사용자에게는 결론 먼저 + 표(항목·입력·결과) + 눈으로 확인할 한 가지. 못 돌린 것은 "검증 미완료: <항목>"으로 쓴다.
