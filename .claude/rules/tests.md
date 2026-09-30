---
paths:
  - "tests/**"
  - "CMakeLists.txt"
  - "cmake/**"
  - "docs/testing-map.md"
---

# 시험(CTest)을 다룰 때

## 구조
- **소스 하나 = 실행 파일 하나 = ctest 1~10개.** `tests/test_<영역>.cpp` → `ka_<영역>_tests` → ctest 이름은 영역마다 다르다(`test_theme.cpp`→`theme_qss`, `test_layer_state.cpp`→`layer_state_regressions`, `test_recent`→`recent_surveys` …). **파일명으로 ctest 이름을 추측하지 말고** `ctest --test-dir build -C Release -N` 또는 `CMakeLists.txt`의 `ka_add_qtest` 줄로 확인한다.
- `ka_add_qtest_filter`는 한 실행 파일의 QtTest 함수 일부만 ctest 로 등록한다(`save_open_*` 10개). 직접 돌릴 때는 `build\Release\ka_save_open_tests.exe -o log,txt <함수명>`.
- 새 시험을 더할 때: `add_executable` + `${KA_TEST_LIBS}`·`${KA_INCLUDES}`·`${KA_LIBDIRS}`·`${KA_TEST_DEFS}` + `ka_add_qtest(<이름> <타깃>)`. 상태를 남기는 시험은 `ENVIRONMENT` 목록과 TEMP 격리 목록(`CMakeLists.txt`의 `ka-hgis-tests-<sha>/<test>`)에 이름을 더한다. GUI 를 여는 시험은 `RESOURCE_LOCK`·`TIMEOUT` 을 확인한다.
- `tests/test_heritage_browser.cpp`는 어느 타깃에도 등록되지 않은 고아 파일이다(빌드·실행 안 됨).

## 소스 텍스트를 읽는 시험 (함수를 옮기거나 이름을 바꾸면 깨진다)
함수 시그니처 문자열로 본문을 잘라 `contains`/`!contains` 로 단언한다. 아래 시험이 읽는 소스를 리팩터하면 동작이 같아도 실패할 수 있으니 **반드시 돌린다**.

| 시험 소스 | ctest 이름 | 읽는 소스 |
|---|---|---|
| `test_workflow.cpp` | `workflow_engine` | `LayerOps.cpp`, `BasemapOps.cpp`, `LabelOps.cpp`, `ControlPointCsv.cpp`, `MainWindow.cpp`, `MainWindowExport.cpp` |
| `test_dem_trench.cpp` | `dem_trench_engine` | `MainWindow.cpp`, `MainWindowContextMenus/Editing/Ribbon.cpp` |
| `test_georef.cpp` | `georef_engine` | `MainWindow.cpp`, `MainWindowAlign.cpp`, `KaAlignMapTool.cpp` |
| `test_parallel_render.cpp` | `parallel_render` | `KaApplication.cpp`, `MainWindow.cpp`, `LayerOps.cpp`, `BasemapOps.cpp` |
| `test_recent.cpp` | `recent_surveys` | `MainWindow.cpp/.h`, `MainWindowSession.cpp`, `SurveySession.cpp` |
| `test_terrain_3d.cpp` | `terrain_3d_engine` | `MainWindow.cpp`, `KaTerrain3dStudio.cpp`, `LayerOps.h`, `MainWindowExport.cpp` |
| `test_theme.cpp` | `theme_qss` | `MainWindow.cpp`, `MainWindowRibbon.cpp`, `KaFileBrowserPanel.cpp`, `KaBeginnerRibbon.cpp`, `KaDrawingStudio.cpp` |
| `test_catch_log.cpp` | `catch_log` | `src/` 전체(`catch (...)` 로그) |

## 통과 기준: "새 실패 없음"
- 알려진 실패(기준선)는 `docs/ctest-baseline.txt`에 있다. `scripts\ka-test.ps1`이 이 목록과 비교해 **새 실패**만 실패로 센다. 알려진 실패가 아니면(또는 목록의 시간 흔들림 후보가 아니면) 이 변경 탓인지부터 확인한다.
- 병렬 실행 60초 한도 때문에 `heritage_style`·`save_open_saveas` 등이 가끔 흔들린다. 의심스러우면 그 시험만 다시 돌리고(`-R '^heritage_style$'`), 5회 반복은 `scripts\ctest-flake.ps1 -Repeat 5`.
- 시험을 건너뛰거나 끄거나 격리해서 초록으로 만들지 않는다.

## 시험이 쓰는 환경
- Qt 6.11 빌드는 QtTest 결과를 stdout 으로 내지 않아 `cmake/run_qtest.cmake`가 `build/test-logs/<test>.txt`에 받는다(실패했을 때만 ctest 출력에 찍힌다). 앱 로그는 `build/test-logs/app-logs/<test>/`.
- 화면은 `QT_QPA_PLATFORM=offscreen:configfile=cmake/offscreen-1920.json`(1920 폭). 조사 원본 GPKG 는 쓰지 않는다(`tests/fixtures`·`samples`만).
