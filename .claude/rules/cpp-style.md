---
paths:
  - "src/**"
  - "tests/**"
  - "CMakeLists.txt"
  - "cmake/**"
---

# C++ 코드 규칙 (이 저장소에서 실제로 강제되는 것)

## 언어·빌드
- C++20, Qt6, CMake, MSVC(Windows). 대상 범위 CMake 옵션을 쓴다. MSVC 플래그(`/std:c++20 /Zc:__cplusplus /permissive- /EHsc /utf-8 /W4`)는 `CMakeLists.txt`에 이미 있으니 지우지 않는다. `-march=native`, `/fp:fast`, sanitizer, PGO, LTO 는 사용자가 요청한 빌드 정책 변경일 때만(MSVC 는 LTO 를 이미 끔).
- QGIS/Qt/GDAL/PROJ 를 다시 구현하지 않는다. `qgis_core`/`qgis_gui` 를 링크해서 쓴다. 새 의존성은 요청이 있거나 기존 코드가 이미 요구할 때만.

## 스타일 (`.clang-format`, `.clang-tidy`)
- 들여쓰기 2칸, 열 제한 120, 중괄호 Attach, 포인터·참조는 왼쪽(`QgsVectorLayer* layer`). 헤더는 `#pragma once`. include 순서: 자체(`"..."`) → 표준(`<...>`) → Qt(`<Q...>`) → QGIS(`<qgs...>`).
- 이름: 멤버 `m_`, 상수 `kName`, 앱 위젯 클래스 접두어 `Ka`. 정적 유틸은 `LayerOps::` 같은 클래스 정적 함수.
- 주석은 한국어로 "왜"를 쓴다. 공식 URL(예: QGIS API)을 근거로 다는 관행을 따른다.
- clang-tidy 는 변경한 줄만 `scripts/clang-tidy-changed.ps1`로 본다(`bugprone-*`, `performance-*`는 오류).

## 시험이 강제하는 규칙 (문서에 없던 것)
- `src/`의 모든 `catch (...)` 본문은 `logLine`·`KaSessionLog::line`·`appendUtf8` 중 하나로 **로그를 남긴다**(`catch_log` 시험).
- `src/app`에서 중첩 이벤트 루프(`QEventLoop`, `waitForFinished*`)는 허용 목록 파일만 쓴다(`KaApplication.cpp`, `MainWindow.cpp`, `KaTerrain3dStudio.cpp`).
- QSS 에 `url(`을 쓰지 않는다. VWorld 키는 URL 에만 주입하고 소스에 넣지 않는다.
- `src/`에 `D:/qgis` 문자열을 넣지 않는다(`e2e-smoke.ps1`이 실패 처리).
- UI 문자열은 한국어 `QStringLiteral("…")` 패턴(번역 파일 없음). 오류 안내는 `KaUserError`(무엇이·왜·어떻게) 형식.
- 조건부 컴파일 `KA_HGIS_HAS_QGIS`의 스텁 분기는 기존 패턴을 따라 유지한다.

## 커지지 않게
- `KaDrawingStudio.cpp`(약 4,300줄), `MainWindow.cpp`, `LayerOps.cpp`, `BasemapOps.cpp`를 더 키우지 않는다. 새 개념은 작은 서비스로 나눈다. 단 함수를 다른 파일로 옮기는 리팩터는 소스 텍스트를 읽는 시험을 깨뜨릴 수 있으니 `.claude/rules/tests.md`의 목록을 돌린다.
