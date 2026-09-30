@AGENTS.md

# Claude Code 운영 지침 (ka-hgis)

위 `AGENTS.md`가 제품 불변식·GIS 규칙·검증 게이트의 정본이다. 아래는 Claude Code(Opus 5.5)로 일할 때의 운영 규칙이다.

## 사용자와 말하는 법
- 사용자는 비개발자인 고고학 현장 전문가다. 한국어로, 전문용어 없이, **결론부터** 쓴다. 코드·경로·식별자는 영어 그대로 둔다.
- 모든 보고는 세 가지를 담는다: 무엇을 했는가 / 무엇이 통과했는가(실제로 돌린 명령과 결과) / **사용자가 눈으로 확인할 것 한 가지**.
- 사용자는 증상으로 말한다("잘려요", "안 돼요", 스크린샷). 증상 제기는 수정 요청으로 본다. 원인·방식이 정말 불분명할 때만 한 줄로 되묻는다. 설명·조사·리뷰만 요청했으면 편집하지 않는다.
- EPSG·WMS·QGIS provider·CRS 진단을 사용자에게 시키지 않는다. 직접 확인한다.
- 비자명한 구현 전에는 증상/목표, 추정 원인, 손댈 파일, 사용자가 볼 완료 조건을 짧게 적고 바로 진행한다(승인 대기는 사용자가 "계획 먼저"라고 할 때만).

## 완료의 정의
- `src/`·`tests/` C++ 를 고쳤다면 이 세션에서 Graft·clangd·Archify·대응 ctest 를 실제로 돌리고 입력·결과를 답에 적고 `.codex/NOW.md` 맨 위 항목에 기록한 뒤에만 "완료"라고 한다. Stop 훅(`.claude/hooks/dev-loop.mjs`)이 확인하고, 없는 도구는 "검증 미완료"로 적게 한다. 문서·설정·규칙만 고친 경우는 빌드·ctest 없이 diff·텍스트 검사로 확인한다.
- **ctest 통과 기준은 "새 실패 없음"**이다(알려진 실패는 `docs/ctest-baseline.txt`). 전부 초록일 거라 가정하지 않는다.
- Linux/클라우드 세션(`CLAUDE_CODE_REMOTE=true`)에는 OSGeo4W·Visual Studio·qgis-dev 가 없다. 거기서 빌드·ctest·smoke 를 하지 않고 통과했다고 쓰지 않는다. 빌드 게이트는 Windows PC.
- 시작·UI·메뉴·지도·프로젝트 열기 변경은 `scripts\ka-smoke.ps1`(앱이 꺼져 있을 때만)도 돌린다. 사용자가 실행 중인 앱은 요청 없이 끄거나 다시 열지 않는다.

## 명령 (Windows, PowerShell 도구)
- 사용자용 슬래시 스킬: `/ka-help` 사용법 · `/ka-status` 현재 상태 · `/ka-doctor` 환경 점검 · `/ka-work` 작업 시작 · `/ka-check` 검증 루프 · `/ka-save` 저장(커밋) · `/ka-undo` 되돌리기 · `/ka-run` 앱 열기 · `/개발설정` 전역+프로젝트 개발설정 적용.
- 래퍼(환경을 스스로 준비하고 로그를 `build\qa\`에 남김): `scripts\ka-doctor.ps1`, `scripts\ka-build.ps1`, `scripts\ka-test.ps1 -Area <영역>|-Regex <정규식>|-All`, `scripts\ka-smoke.ps1`. 직접 cmake/ctest 를 쓸 때는 `claude-dev` 실행기로 시작한 셸(환경 준비됨)이어야 하고, 아니면 앞에 `. .\scripts\dev-env.ps1;`를 붙인다.
- 전체 빌드·전체 ctest(약 220~290초)는 백그라운드로 돌리고 로그 요약만 읽는다. 파일명으로 ctest 이름을 추측하지 말고 `ctest --test-dir build -C Release -N`으로 확인한다.
- 정의 조회: `python scripts\clangd-definition.py <저장소 상대 파일> <줄> <열(UTF-16)>`. Graft 는 `hgis_graft` MCP(4개 도구). Archify 는 `scripts\archify.ps1`(도표 검증은 C++ 의미 검증이 아니다).

## 작업 규칙
- 충돌 시 우선순위: 사용자 최신 요구 > `.codex/NOW.md` 맨 위 > `docs/HANDOFF.md` > 실제 코드 > 옛 문서. `README.md`·`PROJECT.md`·`TEST_*.md`·`docs/user/*`의 "기본 5179", "참조 지도 안 지적도" 같은 서술은 구식일 수 있다(현행: AGENTS.md와 코드).
- 테스트가 `src/app/MainWindow*.cpp`·`LayerOps.cpp` 등을 텍스트로 읽어 함수 본문을 단언한다. 함수를 옮기거나 이름을 바꾸면 관련 시험(`.claude/rules/tests.md`)을 돌린다. `src/`의 모든 `catch (...)`는 로그를 남긴다.
- 복원·복사한 옛 소스는 수정 시간을 갱신하고 대상 타깃을 다시 빌드한다(Copy-Item 은 옛 mtime 을 유지해 증분 빌드가 건너뛴다). 한글이 든 `.ps1`은 UTF-8 BOM 을 유지한다(PowerShell 5.1). 사용자 경로에 한글이 있을 수 있다.
- 지속되는 프로젝트 지식은 `.codex/NOW.md`(현행 일지, 폴더 이름만 낡음)와 `docs/HANDOFF.md`에만 남긴다. 자동 메모리에는 이 PC에만 해당하는 사실(경로·설치 위치)만 쓴다.
- 훅·권한이 막으면 우회하지 말고, 무엇이 왜 막혔는지 쉬운 말로 설명한 뒤 안전한 대안을 제시한다. 훅·설정·권한 파일을 스스로 느슨하게 고치지 않는다(사용자가 그 파일을 고치라고 분명히 말했을 때만).

## 비밀·git
- 계정·키 파일(`config/*.ini`, `secrets.ini`, `.env*`, `%LOCALAPPDATA%\ka-hgis\`, 크래시 덤프, 바탕화면 포터블 폴더)의 내용은 읽거나 출력하거나 커밋하지 않는다. 값이 필요하면 사용자가 직접 설정하도록 안내한다.
- 커밋·푸시는 사용자가 명시적으로 요청할 때만(`/ka-save`가 절차를 따른다). `git add -A`/`git add .` 금지: 바꾼 파일을 경로로 지정하고, 커밋 전 `py -3 scripts\secret-scan.py`를 돌린다. force-push·`reset --hard`·히스토리 재작성 금지.
- 커밋 제목은 `type(scope): 한국어 요약`(feat/fix/style/test/chore/build/ci), 본문은 한국어, 트레일러는 `Constraint:`·`Confidence:`·`Scope-risk:`·`Reversibility:`·`Directive:`·`Tested:`(실제로 돌린 것만)·`Not-tested:`·`Related:`. 커밋 직후 `docs/COMMIT_STATUS.md`가 수정 상태로 보이는 것은 `.githooks` 때문에 정상이며 손대지 않는다.
- 포터블 생성·`publish-desktop.ps1`·`dist/`·L: 복사는 사용자가 명시적으로 요청할 때만 한다.

## 스킬·규칙 안내
- 도메인 스킬: `ka-hgis-gis`(GIS 구현·진단·리뷰) · `ka-hgis-sheet`(조판·정합·유적번호 회귀와 완료 계약) · `heritage-intranet`(주변유적 받기) · `ka-hgis-verify`(화면 확인을 측정으로) · `archify`(구조도, PC에 설치된 경우).
- 경로별 규칙(`.claude/rules/`)은 해당 파일을 다룰 때만 로드된다: `gis-layers`(레이어·범례·QGIS 수명), `cpp-style`, `tests`, `windows-shell`.
- 서브에이전트: `ka-reviewer`(불변식 위반 리뷰, 읽기 전용), `ka-verifier`(검증 증거 누락 점검, 읽기 전용). 국소 수정에 에이전트를 억지로 쓰지 않는다.
