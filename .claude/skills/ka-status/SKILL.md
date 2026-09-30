---
name: ka-status
description: 프로젝트의 현재 상태를 한눈에 보여 준다(브랜치·바뀐 파일·최근 기록·마지막 시험 결과·도구 준비 여부). "지금 상태", "어디까지 했어", "현황", "뭐가 바뀌었어" 요청에 쓴다. 읽기 전용이다.
---

읽기만 한다(파일을 고치거나 시험을 새로 돌리지 않는다). 아래를 모아 한국어 여덟 줄 이내로 요약한다.

1. `git status --short`, `git log -3 --oneline`, `git diff --stat` — 브랜치, 바뀐 파일 수, 최근 커밋 세 개. 커밋 직후 `docs/COMMIT_STATUS.md`가 수정으로 보이는 것은 정상이다.
2. `.codex/NOW.md` 맨 위 항목(약 40줄만 읽는다) — 마지막으로 무엇을 했고 어떤 현장 제약이 있는지 한두 문장.
3. 마지막 시험 결과 — `build\qa\` 아래 가장 최근 폴더의 `summary.txt`가 있으면 읽는다(없으면 "기록 없음").
4. 도구 준비 — Windows 에서는 `powershell -NoProfile -File scripts\ka-doctor.ps1 -Quick` 결과의 ✘ 항목만. Linux/클라우드 세션이면 "이 환경은 빌드·시험을 할 수 없다"고 한 줄.
5. 검증 대기 — 이 세션에서 C++ 를 고쳤다면 Graft·clangd·Archify·ctest 증거가 남았는지(상태 줄의 "⚠ C++ 수정 N개 검증 대기").

마지막에 "다음에 하면 좋은 것" 한 가지를 제안한다(예: `/ka-check`, `/ka-run`, `/ka-save`).
