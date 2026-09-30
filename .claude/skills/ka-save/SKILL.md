---
name: ka-save
description: 바꾼 파일을 골라 저장(git 커밋)한다. 계정 파일이 섞이지 않게 경로를 하나씩 지정하고, 비밀 검사 뒤 프로젝트 커밋 형식으로 남긴다. 푸시는 따로 요청할 때만 한다. 사용자가 "/ka-save", "저장해줘", "커밋해줘"라고 말했을 때만 쓴다.
argument-hint: "[푸시]  (생략하면 커밋만)"
disable-model-invocation: true
allowed-tools: PowerShell(git add -- *) PowerShell(git commit -F *) PowerShell(git status *) PowerShell(git diff *) PowerShell(git log *) Bash(git add -- *) Bash(git commit -F *) Bash(git status *) Bash(git diff *) Bash(git log *)
---

사용자가 저장을 요청한 것이므로 커밋한다. **푸시는 인자에 "푸시"가 있을 때만** 한다.

1. **무엇을 저장할지 정한다** — `git status --short`. 이 세션에서 한 작업의 파일만 고른다. 관련 없는 수정(사용자가 따로 하던 작업)은 빼고 "이 파일들은 저장하지 않았다"고 알린다. `git add -A`·`git add .`·`git commit -a` 는 쓰지 않는다(훅이 막는다).
2. **비밀 검사** — `py -3 scripts\secret-scan.py`(Linux 는 `python3 scripts/secret-scan.py`). 실패하면 멈추고 원인을 쉬운 말로 설명한다. 미추적 계정 파일(`config\*.ini`, `.env*`)이 보여도 스테이징하지 않는다.
3. **바꾼 내용 다시 보기** — `git diff -- <경로들>`(또는 `--cached`)로 의도한 변경뿐인지 확인한다. 큰 변경이면 파일별 한 줄 요약을 준비한다.
4. **메시지 작성** — `build\qa\commit-msg.txt`(UTF-8)에 쓴다. 형식:
   - 제목: `type(scope): 한국어 요약` (type = feat/fix/style/test/chore/build/ci/docs)
   - 본문: 한국어로 무엇을 왜 바꿨는지(사용자에게 보이는 결과 중심)
   - 트레일러(실제로 한 것만): `Constraint:` `Confidence:`(high/medium) `Scope-risk:` `Reversibility:` `Directive:` `Tested:`(실제로 돌린 명령·결과) `Not-tested:`(못 한 것) `Related:`
5. **커밋** — `git add -- <경로1> <경로2> ...` → `git commit -F build/qa/commit-msg.txt`. `.githooks`가 설치된 PC 에서는 `docs/COMMIT_STATUS.md`가 자동 갱신·포함되고 커밋 뒤 수정 상태로 보일 수 있다(정상, 손대지 않는다). 훅이 실패하면 `--no-verify`로 우회하지 말고 원인을 알린다.
6. **푸시(요청 시에만)** — `git push -u origin HEAD`. force 는 절대 하지 않는다. 권한 창이 뜨면 정상이다.
7. **보고** — `git log -1 --stat` 결과, 저장하지 않은 파일 목록, 푸시 여부를 결론 먼저 쓴다. `.codex/NOW.md`의 이번 작업 항목에 "커밋 <해시>, 푸시 여부"를 적는다.
