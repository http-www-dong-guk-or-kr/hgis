---
paths:
  - "src/core/LayerOps*"
  - "src/core/BasemapOps.cpp"
  - "src/core/LabelOps.cpp"
  - "src/core/SurveyProjectFactory.*"
  - "src/core/SurveyStorage.*"
  - "src/core/SurveySession.*"
  - "src/app/MainWindow*.cpp"
---

# 레이어·범례·저장 코드를 만질 때 (AGENTS.md 불변식의 실제 위치)

AGENTS.md 의 "Product Invariants"와 "QGIS Behavior Rules"가 정본이다. 이 파일은 그 규칙이 코드 어디에 살고 있는지, 어디서 시험이 지키는지를 적는다(소스로 확인한 사실만).

## 도메인 레이어 추가 경로
- `LayerOps::ensureDomainLayer`(`src/core/LayerOps.h` 선언, `LayerOps.cpp` 정의)가 도메인 레이어를 프로젝트·범례에 올리는 **유일한 경로**다. 편집 화면은 `MainWindow::ensureDomainLayerForEdit`(`MainWindowSession.cpp`)을 거쳐 여기로 온다. GPKG 에 테이블이 있다는 이유로 레이어를 프로젝트에 추가하지 않는다.
- 논리 신원은 `ka_hgis/layer_key`(`LayerOps::kPropLayerKey`)이고 한글 제목은 UI 라벨이다. 도메인 키는 `survey_area`, `feature_poly`, `feature_line`, `section_line`, `control_points`, `trial_trench`, `artifact_point`.
- 상수(`kGroupSurveyData`·`kGroupReference`·`kGroupCadastral`, `kPropLayerKey`·`kPropLayerRole`, `kRoleSurvey/Cadastral/Reference`)는 `LayerOps.h` 앞부분에 있다. 새 문자열을 흩어 쓰지 말고 이 상수를 쓴다.

## 범례 그룹
- **조사 데이터**와 **참조 지도**를 섞지 않는다. 받은 지적도(**지적도 · 조사 주변 5km**)와 VWorld 지적 그림(**지적 본번/부번**)은 레이어 트리 **루트**에 둔다. `placeCadastralLayer`(`LayerOps.cpp`)는 예전 "지적도" 그룹을 해체해 각 줄을 루트로 올린다(`kGroupCadastral`은 그 마이그레이션 때문에만 남아 있다).
- 그룹에서 레이어를 뺄 때 `takeChild`를 쓰면 `QgsLayerTreeRegistryBridge`가 레이어를 프로젝트에서 지운다. 복제를 먼저 올리고 원래 줄을 지운다(위 함수의 주석 참고).
- VWorld 지적 WMS 는 그림이라 스냅할 수 없다.

## 조사 열기·저장
- `loadSurveyLayers`는 `removeAllMapLayers()`를 부르지 않고(소스 전체에서 호출 0건 유지) 빈 도메인 레이어를 자동으로 올리지 않는다. 도메인 레이어만 정리하고 배경·참조 레이어는 남긴다.
- 시작은 홈 화면만이다. 마지막 조사·배경지도·WMS/XYZ·워크스페이스를 자동 복원하지 않는다.
- 편집은 `startEditing` → 수정·추가 → `commitChanges` 또는 `rollBack`. 피처는 `QgsFeature(layer.fields())` + `setGeometry` + `addFeature`. 그리는 동안 속성 대화상자를 띄우지 않는다.

## 시험이 지키는 것 (고치면 이 시험들을 돌린다)
- `workflow_engine`, `layer_state_regressions`, `parallel_render`, `save_open_*`, `storage_safety`, `cadastral`. 이 중 일부는 소스 파일을 **텍스트로 읽어** 함수 본문을 단언한다. 함수 이름·순서·파일 위치를 바꾸면 동작이 같아도 깨진다(`.claude/rules/tests.md`).
- 지도·CRS·WMS·레이어 순서 버그는 고치기 전에 프로젝트 CRS·레이어 CRS·변환·캔버스 레이어 순서·축척·provider URI 를 직접 확인한다. 작업 CRS 는 5186/5187이고 내보내기만 5179 다.
