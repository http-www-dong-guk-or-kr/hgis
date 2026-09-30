# HGIS 개발 도구

체크아웃은 클론한 폴더다. SDK는 `scripts/dev-env.ps1`이 `OSGEO4W_ROOT` → `C:\OSGeo4W` → `D:\OSGeo4W` → `A:\OSGeo4W` 순으로 찾는다. 패키지·MSVC·CMake·Windows SDK 판은 `dev-env.lock.json` 하나다. 도구별로 실제 검증된 작업을 맡기고, 원본 코드와 컴파일러·테스트로 결론을 확인한다.

**2026-09-15 사용자 지정 필수 조합 (하네스: 2026-09-18 Cursor, 2026-09-29 사용자 요청으로 Claude Code): `Claude Code + CLAUDE.md + clangd + Graft + Archify + CMake/CTest`.** 제품 코드 구현·수정에는 작은 변경도 이 조합을 모두 사용한다. 도구 이름만 언급하지 말고 실제 조회·산출물·검증 결과를 계획 또는 QA 기록에 남긴다.

| 도구 | 실제 개발에서 사용 | 범위 |
| --- | --- | --- |
| Claude Code (Opus 5.5) | Agent·서브에이전트·MCP·훅·스킬로 조사·계획·수정·검증 실행 | 모델 `claude-opus-5-5`와 노력 수준 `high`는 `.claude/settings.json`에 고정. 설정 설명: [claude-code-settings.md](claude-code-settings.md) |
| CLAUDE.md + AGENTS.md | 작업 시작 전 제약·순서·완료 기준 확인. `CLAUDE.md`가 `@AGENTS.md`를 가져온다 | 현재 상태·handoff·소스와 함께 확인 |
| clangd + 실제 컴파일 DB | 진단, 호출 위치의 선언·정의 확인 | [탐색 명령](clangd-navigation.md), 표본 정의 조회 10/10 |
| Graft MCP | 후보 정의 검색, 파일 구조, 인덱싱된 파일의 문자열 검색 | `src/`, `tests/`; 전체 호출/영향 분석 제외 |
| Archify | 소스로 확인한 구조를 독립 HTML로 검토 | [설치·실행](archify-setup.md), 구조도 품질·브라우저 검증 |
| CMake / CTest | Release 컴파일과 동작 검증 | `scripts\ka-build.ps1`, `scripts\ka-test.ps1`; 도구 결과로 대체하지 않음 |
| ka-hgis-verify | 화면에서 보던 확인을 측정값으로 돌린다. 주변유적 받기는 `파일 수신 시작` 다음 `받음`과 0보다 큰 크기만 통과 | `.claude/skills/ka-hgis-verify/SKILL.md`. 다른 PC는 이 저장소를 받으면 같은 스킬을 쓴다 |

## Claude Code 설정

처음 한 번: `scripts\setup-claude-dev.bat`을 더블클릭한다(전역 개발설정·Archify·Graft·바탕화면 아이콘). 이후에는 바탕화면 **Claude 개발 (ka-hgis)** 아이콘(`scripts\claude-dev.bat`)으로 시작한다. 이 아이콘은 개발 환경(`dev-env.ps1`)을 준비한 뒤 저장소 루트에서 `claude`를 실행하므로, Claude 가 부르는 빌드·시험 명령이 그 환경을 그대로 물려받는다. 사용법은 [claude-code-guide.md](claude-code-guide.md).

- **프로젝트 설정(커밋됨)**: `CLAUDE.md`, `.claude/settings.json`(모델·권한·훅·상태 줄), `.claude/rules/`(경로별 규칙), `.claude/skills/`(도메인 스킬과 `/ka-*` 명령), `.claude/agents/`, `.claude/output-styles/`, `.mcp.json`(Graft).
- **전역 설정(PC마다)**: `~/.claude/`. Claude 안에서 `/개발설정`을 실행하면(또는 `setup-claude-dev`가) 설정 병합·전역 지침·훅·이 스킬 자체가 등록된다. 새 C++ 프로젝트에서도 같은 명령으로 초기 설정을 만든다.
- **훅**: `guard.mjs`(위험 명령 점검), `dev-loop.mjs`(C++ 수정 뒤 Graft·clangd·Archify·ctest 증거 게이트), `statusline.mjs`(상태 줄). 시험: `node .claude/hooks/test-hooks.mjs`.
- clangd는 저장소 `.clangd`의 `CompilationDatabase: build`를 쓴다(`build/compile_commands.json`은 `scripts/gen-compile-commands.ps1`로 만든다). Archify는 `scripts/archify.ps1`로 실행한다. CMake는 `CMakePresets.json`의 `vs`(Visual Studio 17 2022 x64)와 기존 `build/`를 유지한다. `.vscode/settings.json`은 `cmake.useCMakePresets: always`이고 폴더를 열 때 자동 구성하지 않는다. `compiledb` 프리셋만 `build-clangd`에 Ninja를 쓴다.

## Graft 설치와 재현

검증한 upstream은 [NanoNets/Graft](https://github.com/NanoNets/Graft/tree/f9e65396e638e517aecae0d731017f53084d70ed), 버전 표기 `0.18.0`, 고정 커밋 `f9e65396e638e517aecae0d731017f53084d70ed`다. npm 최신 패키지와 동일한 소스라는 뜻은 아니다.

```powershell
.\scripts\setup-claude-dev.ps1        # Graft 를 포함한 전체 설치(권장)
# 또는 Graft 만:
.\scripts\setup-graft.ps1
node --test scripts/graft-mcp.test.mjs
# 설치된 의존성/생성 파일 손상 시 고정 소스를 유지한 재빌드
# .\scripts\setup-graft.ps1 -Rebuild
```

Git, Node.js/npm, Python, VS C++ 도구가 필요하다. 설치 스크립트는 `build/tooling/graft-source`에 고정 소스를 받아 lockfile 의존성을 설치하고 필요한 native parser만 빌드한다. 기존 소스가 다른 커밋이거나 수정되어 있으면 중단한다. 인덱스는 `build/tooling/graft-index`에 생성한다. 재실행은 설치된 빌드를 재사용하며 인덱스를 새로 만든다. 두 폴더 모두 기존 build ignore 정책에 포함된다.

Claude Code 연결은 저장소 `.mcp.json`의 서버 `hgis_graft`(`node scripts/graft-mcp.mjs`)다. 첫 실행에서 서버 승인 창이 한 번 뜨면 승인한다(`.claude/settings.json`의 `enabledMcpjsonServers`가 이를 미리 허용한다). 서버가 연결되지 않으면 `/mcp`로 상태를 보고, Graft 엔진이 없으면 `/ka-doctor`가 설치 방법을 알려 준다. 전역 설정·모델 선택은 이 설치가 바꾸지 않는다. Graft는 잠금의 Node 주 판이 같다.

서버는 `scripts/graft-mcp.mjs`를 실행한다. upstream MCP 조회 함수와 동일한 줄 단위 JSON-RPC 전송 방식을 사용하며 네 가지 도구만 노출한다.

- `graft_find_code`: 관련 정의 후보를 좁힌다.
- `graft_file_api`: 한 파일의 정의 목록을 살핀다.
- `graft_find_all`: 인덱싱된 소스/테스트에서 문자열을 찾는다.
- `graft_check_freshness`: 필요하면 구조 인덱스를 갱신하고 현재 파일 지문과 일치하는지 확인한다.

조회 전에 내용 해시까지 비교하여 구조 인덱스를 갱신하고, 갱신 실패·누락·조회 중 소스 변경은 오류로 반환한다. 생성물은 로컬 build 아래에만 쓴다. 최초 설치·의존성 다운로드에는 네트워크를 쓰지만 이후 구조 인덱싱과 조회에는 모델 API를 쓰지 않는다. upstream 자동 초기화, 자동 업데이트, 전역 hook, 토큰 절감 홍보 문구는 연결하지 않는다.

Graft의 기본 추출은 실제 호출 표본 10개 중 1개, Windows clangd 탐지만 보정한 실험도 6개만 찾았다. 따라서 `graft_trace_calls`와 graph 기반 영향 범위 판단을 제외했다. 파일·줄 범위와 오버로드는 원본 또는 clangd로 확인한다. 검색 결과가 없다는 이유로 사용처가 없다고 판단하지 않는다.

## 작업 순서

1. Claude Code 에서 `CLAUDE.md`(→`AGENTS.md`), `.codex/NOW.md`, 관련 handoff·소스·테스트를 확인하고 필요한 작업 계획을 기록한다(`/ka-work`).
2. Graft로 관련 정의/파일을 조회하고 Grep·원본으로 확인한다. 작은 알려진 파일 수정도 해당 파일의 API 조회로 근거를 남긴다.
3. 실제 컴파일 DB를 사용하는 clangd로 구체적 호출의 선언/정의와 진단을 확인한다.
4. Archify로 변경 대상의 구조 또는 흐름을 검토한다. 변경 범위에 맞는 작은 도표를 사용한다. 기존 도표도 현재 소스 근거를 대조하고 필요한 부분을 갱신한 뒤 `validate` → `deliver` → `visual-check`를 실행한다.
5. 최소 변경을 구현하고 관련 CMake 빌드와 CTest를 실행한다(`/ka-check`, `scripts\ka-test.ps1`). UI/지도 변경의 시작 smoke와 바로가기 연결은 `AGENTS.md`의 검증 규칙을 따른다. 변경 후 코드·도표 근거가 여전히 일치하는지 확인한다.
6. 각 도구의 입력 위치·산출물·결과와 남은 실패를 기록한다. 도구 부재 시 문서의 복구 절차를 시도하고, 불가능한 필수 검증은 미완료로 명시한다. 도구 결과가 소스·컴파일러·실제 동작 검증을 대신하지 않는다.

제품 코드나 C++ 빌드 동작을 바꾸지 않는 문서·규칙만의 수정은 기존 `AGENTS.md` 지침대로 파일 읽기·diff·대상 텍스트 검사로 검증한다. 포터블 생성은 계속 별도의 명시적 배포 요청이 있어야 한다.

## 검증 기록과 남은 사항

로컬 QA 결과는 `build/qa/`에 쌓이고 저장소에 커밋되지 않는다(`scripts\ka-build.ps1`·`ka-test.ps1`이 날짜별 폴더에 로그와 `summary.txt`를 남긴다). ctest 통과 기준은 "전부 통과"가 아니라 "새 실패 없음"이며, 알려진 실패는 `docs/ctest-baseline.txt`에 있다. 2026-09-14의 43개 중 39개 실패 기록은 현재 기준이 아니다. 2026-09-20에 `save_open_drawing`과 `heritage_style`은 통과했고 smoke는 0이었다. clangd 헤더 삽입은 `never`다. 변경 줄 clang-tidy는 `scripts/clang-tidy-changed.ps1`다.

모델이 여섯 도구를 빠뜨려도 턴이 그냥 끝나 버리는 문제는 지시만으로 막을 수 없어 기계적으로 막는다. `src/`·`tests/` C++ 를 고친 Windows 세션은 `.claude/settings.json`의 `Stop` 훅(`.claude/hooks/dev-loop.mjs`)이 Graft·clangd·Archify·ctest 증거가 없을 때 Claude 에게 마저 실행하도록 되돌린다. 증거는 성공한 호출만 인정하되 ctest 는 알려진 실패가 있어 실패한 실행도 "실행했다"로 보고 경고한다. ctest 는 마지막 C++ 수정 이후에 돌린 것만 인정한다. 이 PC 에 없는 도구는 요구하지 않고 "검증 미완료"로 적게 하며, 최대 2번만 되돌리고 그 뒤에는 경고와 함께 푸는 무한 루프 방지 장치가 있다. Linux/클라우드에서는 빌드·ctest 를 요구하지 않고 "통과 보고 금지"만 안내한다.

클라우드(Claude Code on the web) 세션은 Ubuntu다. 그 VM에는 OSGeo4W와 Visual Studio가 없다. Release·CTest·smoke는 Windows PC에서만 한다. 클라우드에 비밀키를 파일로 넣지 않는다.

Windows CI는 self-hosted runner다(`.github/workflows/ci.yml`). https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners 실제 이 PC의 유효 설정과 실행 결과를 우선한다.
