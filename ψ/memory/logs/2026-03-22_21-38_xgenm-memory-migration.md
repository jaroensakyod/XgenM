---
type: snapshot
project: XgenM
task_id: "#xgenm-memory-migration-2026-03-22"
status: completed
tags: [snapshot, migration, memory, xgenm, retrospective, oracle]
related_files:
  - /Users/non/dev/opilot/projects/XgenM/project_map.md
  - /Users/non/dev/opilot/projects/XgenM/ψ/memory/logs/2026-03-21_22-35_xgenm-map-deep-dive.md
  - /Users/non/dev/opilot/projects/XgenM/ψ/memory/logs/2026-03-21_23-12_xgenm-test-suite-bootstrap-plan.md
  - /Users/non/dev/opilot/projects/XgenM/ψ/memory/logs/2026-03-21_23-49_xgenm-phase1-vitest-bootstrap.md
  - /Users/non/dev/opilot/projects/XgenM/ψ/memory/logs/2026-03-22_00-03_xgenm-phase234-popup-harness.md
  - /Users/non/dev/opilot/projects/XgenM/ψ/memory/retrospectives/2026-03/22/00.10_xgenm-test-suite-bootstrap-session-close.md
---

# Snapshot: XgenM Memory Migration

**Time**: 2026-03-22 21:38 +0700
**Context**: ย้าย legacy HQ memory ของโปรเจกต์ XgenM กลับเข้า site repo ตาม workflow แบบ project-by-project โดย review retrospective ก่อนย้าย

## Decision
- ย้าย HQ logs ของ XgenM ทั้งหมดเข้า `projects/XgenM/ψ/memory/logs/`
- ย้าย retrospective 1 ไฟล์ที่ระบุ `project: XgenM` และมี related files ผูกกับ XgenM โดยตรง
- ไม่แตะ retrospective อื่นที่ไม่ match project field โดยตรง

## Evidence
- `project_map.md` ของ XgenM ระบุสถานะและสถาปัตยกรรมของ extension ตรงกับเนื้อหาใน log/retrospective ที่ย้าย
- HQ logs ที่ย้ายมีทั้งหมด 4 ไฟล์ และทั้งหมดอยู่ใต้ `ψ/memory/logs/XgenM/`
- retrospective ที่ย้ายมี 1 ไฟล์ และ frontmatter ระบุ `project: XgenM` ชัดเจน

## Result
- Site logs migrated: 4
- Site retrospectives migrated: 1
- HQ XgenM logs remaining: 0
- HQ XgenM retrospectives remaining with direct `project: XgenM` match: 0

## Apply When
- เมื่อต้องการย้าย memory ของโปรเจกต์ที่มี log แยกโฟลเดอร์ชัดใน HQ
- เมื่อต้องการย้าย retrospective ที่มี frontmatter ชี้ project เดียวแบบไม่ ambiguous

## Next Actions
- หากต้องการปิดรอบ git ให้ commit ใน `projects/XgenM` แยกจาก HQ cleanup
- โปรเจกต์ถัดไปให้ใช้ pattern เดียวกัน: list candidates -> review retrospective -> move -> snapshot
