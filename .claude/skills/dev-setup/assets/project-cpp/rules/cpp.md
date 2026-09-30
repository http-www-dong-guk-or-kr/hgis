---
paths:
  - "**/*.{cpp,cc,cxx,h,hpp,hxx}"
  - "CMakeLists.txt"
  - "cmake/**"
---

# C++ 코드를 만질 때

- 새 코드는 이 프로젝트가 정한 표준(`CMAKE_CXX_STANDARD`)을 따른다. 기존 스타일·헬퍼·이름 규칙을 먼저 따르고, `.clang-format`이 있으면 그것이 권위다(대량 재포맷은 요청이 있을 때만).
- 수명·소유권을 코드에 드러낸다: RAII, `std::unique_ptr`/`std::shared_ptr`, 값 전달 후 `std::move`, `const`·`[[nodiscard]]`. 원시 `new/delete`, 손으로 쓴 `malloc/free`, C 스타일 캐스트는 피한다.
- 예외 안전과 오류 처리를 기존 방식(예외/오류 코드/`std::expected`)에 맞춘다. `catch (...)`를 쓰면 반드시 기록한다. 빈 catch 금지.
- 스레드·정수 오버플로·부호 있는/없는 비교·문자 인코딩(UTF-8/UTF-16) 문제가 보이면 고치지 않더라도 알린다.
- 함수를 옮기거나 이름을 바꾸기 전에 그 이름을 텍스트로 검사하는 시험이 있는지 `grep`으로 찾는다.
- 빌드는 CMake 프리셋 우선. 경고를 숨기려고 끄지 않는다. 고친 뒤에는 관련 시험(`ctest`)을 실제로 돌리고 결과를 보고한다. 시험을 끄거나 건너뛰어 초록으로 만들지 않는다.
- clangd 진단이 새로 생기면 고친 코드 때문인지 확인한다(`compile_commands.json`은 `CMAKE_EXPORT_COMPILE_COMMANDS=ON`으로 만든다).
