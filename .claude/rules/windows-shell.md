---
paths:
  - "scripts/**"
  - "**/*.ps1"
  - "**/*.bat"
  - "**/*.cmd"
  - "**/*.vbs"
  - "launch.ps1"
---

# 스크립트(PowerShell·bat)를 다룰 때

## 인코딩·줄바꿈
- **Windows PowerShell 5.1은 BOM 없는 UTF-8을 CP949 로 읽는다.** 한글이 든 새 `.ps1`은 **UTF-8 BOM**으로 저장하거나(권장) 한글 없이 ASCII 로 쓴다. 이미 BOM 이 있는 파일(`dev-env-lock.ps1`, `e2e-smoke.ps1`, `load-git-env.ps1`, `osgeo4w-bundle.ps1`, `setup-dev-paths.ps1`, `update-app-icon.ps1`)은 편집 뒤에도 첫 3바이트(`EF BB BF`)가 남아 있는지 확인한다. BOM 이 없는 파일에 BOM 을 새로 붙이지 않는다.
- 저장소는 LF 로 저장한다. `.bat`/`.cmd`/`.vbs`는 CRLF 로 체크아웃된다(`.gitattributes`). `.bat` 안의 한글은 콘솔 코드 페이지 때문에 깨질 수 있으니 새 `.bat`은 ASCII 로 쓰고 한글 안내는 `.ps1`이 한다.
- 새 스크립트는 PowerShell 5.1 호환으로 쓴다: `-LiteralPath`, `$ErrorActionPreference = 'Stop'`, `?.`·`??`·삼항 같은 PowerShell 7 문법 금지, 끝에서 `exit $LASTEXITCODE`.

## 환경
- 빌드·시험 스크립트는 `. "$PSScriptRoot\dev-env.ps1"`(점 소스)로 환경을 준비한다. Claude Code 는 도구 호출마다 새 프로세스라 앞 호출의 환경변수가 이어지지 않는다. `claude-dev` 실행기로 시작했다면 이미 준비되어 있다.
- 사용자의 진입점은 바탕화면 **고고학 전용 HGIS** 바로가기 → `scripts/start-ka-hgis.vbs` → `launch.ps1` → `build/Release/ka-hgis.exe` 다. 이 연결을 유지하고 옛 exe 로 조용히 폴백하지 않는다. `launch.ps1`이 앱을 WMI 로 분리 실행하는 이유는 에이전트 셸의 Job Object 가 자식 프로세스를 죽이기 때문이다.
- 복원·복사한 옛 소스(`Copy-Item`)는 원래의 옛 수정 시간을 유지해 증분 빌드가 재컴파일을 건너뛴다. 수정 시간을 갱신하고 대상 타깃을 다시 빌드한 뒤 로그로 재컴파일을 확인한다(`heritage-intranet` 스킬 참고).

## 하지 않는 것
- 사용자의 실행 중인 앱을 끄거나 다시 열지 않는다(`Get-Process ka-hgis` 확인 후에만 smoke).
- 예약 작업·서비스·레지스트리·실행 정책을 바꾸는 스크립트를 만들지 않는다. 숨은 자동 푸시 금지.
- `scripts/`를 바꾸면 `verify-release.ps1`의 지문이 달라진다. 포터블을 만들기 전에 다시 검증해야 한다.
