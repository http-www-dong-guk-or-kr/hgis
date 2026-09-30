#!/usr/bin/env python3
"""claude-dev-global-setup.zip 을 만든다(또는 --check 로 원본과 같은지만 검사한다).

내용: dev-setup 스킬 폴더(시험 파일·bundle 폴더·백업 제외) + bundle 의 설치 파일 4개(루트에 둔다).
.bat/.ps1/.txt 는 Windows 메모장·PowerShell 을 위해 CRLF 로 넣는다. 저장소의 원본은 바꾸지 않는다.

  python3 make-zip.py            # docs/downloads/claude-dev-global-setup.zip 을 만든다
  python3 make-zip.py --check    # 그 ZIP 이 원본과 같은지 검사(다르면 종료 코드 1)
  python3 make-zip.py <출력경로>
"""
import pathlib
import re
import sys
import zipfile

HERE = pathlib.Path(__file__).resolve().parent  # .../.claude/skills/dev-setup/bundle
SKILL = HERE.parent
REPO = SKILL.parents[2]
DEFAULT_OUT = REPO / "docs" / "downloads" / "claude-dev-global-setup.zip"
ROOT = "claude-dev-global-setup"
CRLF_EXT = {".bat", ".ps1", ".txt"}
TOP_FILES = ["INSTALL-GLOBAL.bat", "CHECK-ONLY.bat", "install-global.ps1", "README-ko.txt"]


def data_for(path: pathlib.Path) -> bytes:
    b = path.read_bytes()
    if path.suffix.lower() in CRLF_EXT:
        b = re.sub(rb"\r?\n", b"\r\n", b)
    return b


def expected_entries():
    entries = [(f"{ROOT}/{n}", data_for(HERE / n)) for n in TOP_FILES]
    for p in sorted(SKILL.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(SKILL)
        if rel.parts[0] == "bundle":
            continue
        if re.match(r"^test-.*\.mjs$", p.name) or ".bak-" in p.name:
            continue
        entries.append((f"{ROOT}/dev-setup/{rel.as_posix()}", data_for(p)))
    return entries


def build(out: pathlib.Path):
    out.parent.mkdir(parents=True, exist_ok=True)
    entries = expected_entries()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for arc, data in entries:
            info = zipfile.ZipInfo(arc, date_time=(2026, 9, 30, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data)
    print(f"wrote {out} ({out.stat().st_size} bytes, {len(entries)} files)")


def check(zpath: pathlib.Path) -> int:
    if not zpath.exists():
        print(f"MISSING {zpath}")
        return 1
    want = dict(expected_entries())
    with zipfile.ZipFile(zpath) as z:
        have = {n: z.read(n) for n in z.namelist()}
    bad = 0
    for n in sorted(set(want) | set(have)):
        if n not in have:
            print(f"ZIP 에 없음: {n}")
            bad += 1
        elif n not in want:
            print(f"원본에 없음(ZIP 에만 있음): {n}")
            bad += 1
        elif have[n] != want[n]:
            print(f"내용이 다름: {n}")
            bad += 1
    print("ZIP 이 원본과 같음" if not bad else f"ZIP 이 원본과 다름({bad}개) — python3 make-zip.py 로 다시 만드세요")
    return 1 if bad else 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["--check"]:
        sys.exit(check(DEFAULT_OUT))
    build(pathlib.Path(args[0]) if args else DEFAULT_OUT)
