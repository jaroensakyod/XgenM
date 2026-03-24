# XgenM Context And Evidence Pack

- Date: 2026-03-24
- Purpose: รวม context ที่เกี่ยวข้องจาก project docs, project map, git history, และ Oracle memory เพื่อให้คนรับงานต่อไม่ต้องไล่อ่านย้อนหลังทั้งโปรเจกต์

## 1. เอกสารที่ถือเป็น source of truth ตอนนี้

- `project_map.md`
- `doc/current-status-handoff.md`
- `doc/cross-post-extension-implementation-plan.md`
- `doc/hand-off/raw-memory/INDEX.md`
- `src/background/job-runner.ts`
- `src/background/x-post-session.ts`
- `src/content/x/composer-write.ts`
- `src/content/x/composer-proof.ts`
- `tests/component/content/x/composer.test.ts`

## 2. Oracle memory / lessons ที่เกี่ยวข้อง

### XgenM grounding

จาก memory ของโปรเจกต์:

- XgenM เป็น Chrome MV3 extension แบบ local-first
- background service worker คือ orchestration core
- popup เป็น operator console ไม่ใช่ application core
- TikTok เป็น path ที่แข็งแรงสุด
- Facebook Reel มีจริงแต่ยังอ่อนกว่า
- persistence อยู่ใน `chrome.storage.local`

### XgenM map lessons

สิ่งที่ตอกย้ำจาก map deep dive:

- browser truth สำคัญกว่า abstraction ที่สวย
- upload-first บน X เป็น reliability decision ที่พิสูจน์จาก runtime จริง
- dual-pipeline build ของ extension เป็นข้อเท็จจริงสำคัญของโปรเจกต์

### Cross-project extension lesson

บทเรียนจาก Xafi ที่ใช้ซ้ำได้:

- ถ้าเป็น browser-heavy extension work ต้องแยก local hard gate ออกจาก browser-truth validation ให้ชัด
- ถ้า local tests ผ่าน แต่ Chrome runtime fail ให้ยึด browser fail เป็น truth source
- งานที่เกี่ยวกับ content script, compose UI, upload, และ injected behavior ต้องมี manual smoke เสมอ

ไฟล์ raw ที่คัดมาให้แล้วอยู่ใน `doc/hand-off/raw-memory/` เพื่อใช้ search ต่อได้ทันที

## 3. Milestone commits ที่สำคัญ

### โครงสร้าง truth/evidence/gating

- `0882629` phase 1 truth contract and compose evidence boundary
- `fd4f4ef` decompose composer into target / write / proof / submit
- `a40e4ea` extract `x-post-session` from `job-runner`
- `51841ab` add safety gates and operator semantics

ความหมาย:

- จากเดิมที่ flow X ปนกันอยู่ใน job runner ถูกแยกออกเป็น state machine + modular composer
- ระบบเริ่มคิดด้วย evidence แทนการเดา

### การ harden ฝั่ง writer/proof

- `bfeb596` harden X typing state sync
- `b1c62dc` tighten typing sync assertions
- `30e08c2` switch composer to paste flow
- `3aa5149` port full Xafi insertion envelope for live X parity
- `0510a09` soften semantic auto-post matching

ความหมาย:

- มีรอบ refactor ที่ทำให้ compose flow สะอาดขึ้น แต่ browser จริงยัง expose gap
- จึงเกิด parity recovery โดยพอร์ต behavior ที่พิสูจน์แล้วจาก Xafi กลับมา
- proof layer ถูกทำให้ semantic มากขึ้นเพื่อลด false negative

## 4. Verified current runtime model

ลำดับงานหลักที่มีจริงตอนนี้:

1. operator เปิด side panel
2. popup ส่ง `START_JOB`
3. background detect platform
4. open/focus source tab
5. extract source data
6. retry / HTML fallback ถ้าเป็น TikTok แล้วข้อมูลอ่อน
7. download / reconstruct video
8. prepare final X text
9. open X
10. upload media first
11. compose + proof text
12. background gating ว่าจะ `awaiting-review`, `completed`, หรือ `failed`

## 5. Extension patterns ที่ควร reuse ในงานใหม่

### Pattern A: แยก job types ชัดเจน

งานใหม่ไม่ควรยัดลง job เดิมแบบ if-else ยาวๆ

ควรแยกอย่างน้อย:

- cross-post job
- scheduled-post job
- idle-engagement job
- quote-post job

### Pattern B: explicit state machine

อย่าซ่อน phase transitions ไว้ใน side effects ของ content script

ควรมี:

- state entry
- action
- evidence result
- next state
- failure reason

### Pattern C: evidence-first browser actions

ทุก action ฝั่ง X ควรคืนข้อมูลอย่างน้อย:

- target found หรือไม่
- action attempted หรือไม่
- visible evidence อะไรเปลี่ยน
- mismatch reason ถ้ามี

### Pattern D: local-first persistence

ถ้ายังไม่เพิ่ม backend ควรเก็บสิ่งเหล่านี้ใน storage อย่างเป็นระเบียบ:

- queue entries
- schedules
- last run state
- last engagement state
- failure snapshots / counters

### Pattern E: manual smoke เป็น release gate

สำหรับ browser-heavy work อย่าจบที่ unit test

ขั้นต่ำต้องมี:

- load unpacked extension
- run real Chrome scenario
- capture logs / blockers

## 6. Known risks ที่เกี่ยวกับงานใหม่โดยตรง

### Scheduling

- MV3 service worker sleep/wake behavior
- clock drift / alarm overlap
- duplicate execution ถ้า resume logic ไม่ดี

### Idle engagement

- selector drift สูงมาก
- action semantics เปลี่ยนได้บ่อย
- เสี่ยงทำ action ผิด post ถ้า target resolution ไม่แม่น

### Quote flow

- quote surface อาจไม่เหมือน normal composer
- semantic proof ต้องระวังไม่ให้ loose เกินไป
- topic-driven text ต้องนิยามแหล่งข้อมูลให้ชัด

## 7. Hard gate ล่าสุดที่ยืนยันแล้ว

จาก repo state ตอน hand-off:

- `npm run build` ผ่าน
- `npm run lint` ผ่าน
- `npm run test` ผ่าน
- test total: `123 passed`

## 8. คำแนะนำสั้นสำหรับคนเริ่มสานต่อ

ถ้าจะเริ่มงานจริงพรุ่งนี้:

1. อ่าน `project_map.md`
2. อ่าน `doc/hand-off/README.md`
3. รัน hard gate
4. smoke current TikTok -> X draft flow ใน Chrome จริง
5. ออกแบบ scheduler/queue เป็น foundation ก่อนแตะ engagement และ quote

## 9. สิ่งที่ควรอัปเดตต่อหลังเริ่มลงมือ

เมื่อเริ่ม implement requirement ใหม่แล้ว ควรอัปเดตเอกสารเหล่านี้ตามจริง:

- `project_map.md`
- `doc/current-status-handoff.md`
- `doc/hand-off/README.md`

ถ้ามี browser blocker ใหม่ ให้เขียน snapshot ใหม่ทันที อย่าปล่อยให้ความรู้ค้างอยู่ในแชตอย่างเดียว