---
name: ka-run
description: 방금 만든 앱(고고학 전용 HGIS)을 열어 사용자가 눈으로 확인하게 한다. 이미 실행 중이면 끄거나 다시 열지 않는다. "앱 열어줘", "실행해봐", "화면 확인할게" 요청에 쓴다.
disable-model-invocation: true
---

Windows 에서만 한다(Linux/클라우드에서는 "앱은 Windows PC 에서 열어 확인해야 한다"고 알리고 끝낸다).

1. `Test-Path build\Release\ka-hgis.exe` — 없으면 "아직 빌드되지 않았다"고 알리고 `scripts\ka-build.ps1` 실행을 제안한다(오래 걸리면 백그라운드).
2. `Get-Process ka-hgis -ErrorAction SilentlyContinue` — **이미 실행 중이면 아무것도 하지 않고** "앱이 이미 켜져 있습니다. 다시 열려면 직접 닫아 주세요"라고 알린다(사용자의 실행 중인 앱은 요청 없이 끄지 않는다).
3. 꺼져 있으면 `powershell -NoProfile -File scripts\run-ka-hgis.ps1` 로 연다(내부적으로 `launch.ps1`이 앱을 분리 실행해서 Claude 세션이 닫혀도 앱이 유지된다). 사용자가 평소 쓰는 바탕화면 **고고학 전용 HGIS** 바로가기와 같은 `build\Release\ka-hgis.exe` 를 연다.
4. 사용자에게 **눈으로 확인할 것을 한두 개만** 알려 준다. 방금 바꾼 동작에 맞는 시나리오를 `docs/user/gui-scenario-checklist.md`(S1~S9…)에서 골라 "무엇을 눌러서 무엇이 보이면 됨/안 됨" 형태로 쓴다. 판정은 "됨" 또는 "안 됨"으로만 받는다. 에이전트가 대신 클릭해 기록을 채우지 않는다.
5. 시작 시 조사·배경지도가 자동으로 열리면 안 된다(홈 화면만). 자동으로 열렸다면 그 자체가 결함이므로 알려 달라고 한다.
