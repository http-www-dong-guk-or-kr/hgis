# Archify 개발용 구조도

Archify는 실제 소스에서 확인한 구조를 JSON으로 작성하고 독립 HTML로 검토하는 프로젝트 로컬 스킬이다. 호출 관계의 의미와 누락 여부는 현재 코드에서 확인한다. 그래프나 HTML 검증이 C++ 분석, 영향 범위 완전성, 빌드·테스트를 대신하지 않는다.

## 설치와 고정 버전

- upstream: <https://github.com/tt-a1i/archify> (README가 Claude Code의 `.claude/skills/` 위치를 공식 지원한다)
- revision: `a07fa1d5b2a10cbea110c5a2be2817397a301cdc`
- package version: `2.17.0-dev.1` — 검증한 개발 커밋이며 안정판이라는 의미가 아니다.
- 위치: `.claude/skills/archify/` (저장소에는 커밋하지 않는다. `.gitignore`에 있고 PC마다 설치한다)
- 실행 조건: PATH의 Node.js >=18. CLI 사용에는 npm 설치가 필요 없다.

권장: `scripts\setup-claude-dev.bat`(또는 `scripts\setup-claude-dev.ps1`)이 아래 과정을 자동으로 한다. 이미 설치되어 있으면 건너뛴다.

수동 설치(저장소 루트, PowerShell):

```powershell
$rev = 'a07fa1d5b2a10cbea110c5a2be2817397a301cdc'
git clone --no-checkout https://github.com/tt-a1i/archify build\tooling\archify-src
git -C build\tooling\archify-src checkout --detach $rev
git -C build\tooling\archify-src rev-parse HEAD        # 위 revision 과 같아야 한다
Copy-Item -Recurse build\tooling\archify-src\archify .claude\skills\archify
.\scripts\archify.ps1 doctor
```

재설치가 필요하면 기존 `.claude\skills\archify` 폴더를 `build/tooling/` 아래 별도 백업 경로로 옮긴 뒤 같은 고정 커밋을 설치한다. 무조건 최신 브랜치로 바꾸지 않는다(`npx skills add`는 고정 리비전을 지원하지 않는 최신판을 받는다). upstream `SKILL.md`, renderer, assets는 직접 수정하지 않는다. 설치된 스킬은 Claude Code 를 다시 시작하면 `archify` 스킬로 보인다. 옛 위치 `.agents/skills/archify`에 설치본이 남아 있으면 `scripts/archify.ps1`이 그것도 인식하지만, 새로 설치할 때는 `.claude/skills/archify`를 쓴다.

## 사용

`scripts/archify.ps1`는 어느 작업 디렉터리에서 호출하든 저장소 루트에서 실행하며 CLI 종료 코드를 전달한다. 상대 입력·출력 경로 역시 저장소 루트 기준이다. 실행 동안만 업데이트 확인을 끄고 TEMP/TMP를 정규 경로 `build/tooling/tmp`로 설정한 뒤 원래 환경을 복원한다. 브라우저를 자동으로 열거나 업데이트를 설치하지 않는다. 인수는 upstream CLI에 그대로 전달하므로 `--open`은 사용자가 미리보기를 요청한 경우에만 명시한다.

```powershell
.\scripts\archify.ps1 doctor
.\scripts\archify.ps1 validate architecture build/qa/my-map.json --repo-root . --quality showcase --json
.\scripts\archify.ps1 deliver architecture build/qa/my-map.json build/qa/my-map.html --repo-root . --quality showcase --json
.\scripts\archify.ps1 visual-check build/qa/my-map.html --json
```

먼저 `.claude/skills/archify/SKILL.md`의 해당 스키마·작성·전달 절차를 따른다. `meta.quality_profile`은 `showcase`로 설정하고 소스 근거를 현재 커밋과 파일·줄에 연결한다. `validate`가 통과한 JSON으로 `deliver`를 실행한다. 전달 실패 시 기존 HTML은 이전 정상 결과일 수 있으므로 새 후보의 성공 근거로 사용하지 않는다. `visual-check`는 전달된 HTML의 브라우저 측정이며, 이미지에 대한 실제 육안 검토는 별도로 기록한다.

추적할 필요가 있는 구조 JSON은 목적에 맞는 `docs/architecture/` 위치에 둔다. 수시 검증 결과·스크린샷은 `build/qa/` 아래에 둔다. 현재 코드에 없는 계획 단계 컴포넌트는 구현된 것처럼 표시하지 않는다. `docs/architecture/*.html`은 각 0.8MB 안팎이므로 에이전트가 열어 읽지 않는다(원천은 같은 이름의 `.json`).

## 확인한 제한

- 한국어 작성 내용은 표시되지만 고정 Viewer UI와 `<html lang>`은 English로 fallback한다. 스킬이 지원하지 않는 `meta.locale: ko`를 추가하지 않는다.
- Windows의 짧은 8.3 임시 경로와 Git 정규 경로 비교 문제를 피하기 위해 wrapper가 프로세스 실행 중 정규 TEMP/TMP를 사용한다.
- 이 버전의 Windows preview 테스트는 SIGTERM 종료 반환값 검사에서 실패했다. 검증된 기본 경로는 `validate` → `deliver` → `visual-check`다. preview의 정상 종료·정리는 보장하지 않는다.
- `visual-check`에는 Chrome/Chromium이 필요하다. 실행 실패·생략을 성공으로 기록하지 않는다. 직접 확인하지 않은 전체 Viewer 기능까지 검증됐다고 표현하지 않는다.
- 자동 C++ 코드 인덱싱이나 Graft 연동은 이 스킬의 설치로 생기지 않는다. 기존 AGENTS.md와 컴파일 DB·clangd·저장소 검증 절차를 따른다.
- Archify 단계가 필수인지(모든 C++ 수정 vs 다중 모듈 변경만)는 사용자가 정한다. 현재는 AGENTS.md 그대로 "모든 제품 코드 변경"이다.
