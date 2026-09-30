---
name: ka-doctor
description: 이 PC에서 빌드·검증에 필요한 도구가 준비됐는지 점검하고, 없는 것은 설치 방법을 쉬운 말로 알려 준다(읽기 전용). "환경 점검", "안 돼요 설치", "도구가 없대", "처음 세팅" 요청에 쓴다.
---

1. **Windows**: `powershell -NoProfile -File scripts\ka-doctor.ps1` 을 실행한다(읽기 전용, 몇 초). 결과 줄은 `[OK]` 준비됨 / `[X]` 없음 / `[!]` 확인 필요 로 나온다.
   **Linux/클라우드**: 빌드 도구가 없는 것이 정상이다. "이 환경에서는 빌드·ctest·smoke 를 하지 않는다"고만 알리고, Claude Code 설정(`.claude/`, `.mcp.json`)이 읽혔는지만 확인한다.
2. `[X]`/`[!]` 항목마다 **다음에 할 일 한 가지**를 말한다. 자주 나오는 것:
   - Claude Code 버전이 낮음(2.1.280 미만) → `claude update` 실행 후 다시 시작.
   - Graft 엔진/Archify/컴파일 DB 없음 → 한 번만: `scripts\setup-claude-dev.bat` 더블클릭(설치와 전역 설정까지 한 번에). 자세한 설명은 `docs/claude-code-guide.md`.
   - OSGeo4W·Visual Studio·CMake 없음 → `docs/other-pc-setup.md` 의 순서. 이 도구들은 설치 크기가 커서 Claude 가 대신 설치하지 않는다.
   - Claude 전역 설정 없음 → `/개발설정`.
   - 예약 작업 `ka-hgis-auto-git-push` 발견 → 30분마다 작업 폴더 전체를 원격 백업 브랜치로 **강제 푸시**하는 옛 자동화다(이 프로젝트 규칙과 충돌). 끄려면 `scripts\uninstall-auto-push-task.ps1`. 지우기 전에 사용자에게 백업이 필요한지 물어본다.
3. 사용자가 판단할 필요가 없게 **번호 순서**로 답한다(1번부터 하나씩). 고칠 수 있는 것은 사용자 허락 후에만 고친다.
4. 결과를 표로 다시 적지 말고, 준비된 것은 "N개 준비됨"으로 접고 문제가 있는 것만 자세히 쓴다.
