# XgenM Hand-Off

- Date: 2026-03-24
- Prepared for: hand-off to the next implementer
- Project: XgenM
- Repo state at hand-off: `staging` clean, latest verified commit `0510a09`

## 1. เป้าหมายของเอกสารนี้

เอกสารนี้สรุป "สภาพจริงล่าสุด" ของ XgenM, บทเรียนที่พิสูจน์แล้วจากการทำ Chrome extension ในรอบก่อน, และการแปลง requirement ใหม่ให้เป็นงานวิศวกรรมที่เพื่อนคุณนนท์สามารถรับไปทำต่อได้ทันทีโดยไม่ต้องย้อนอ่านประวัติทั้งหมด

เอกสารนี้ตั้งใจให้ตอบ 4 คำถามหลัก:

1. ตอนนี้ XgenM อยู่ตรงไหนแล้ว
2. อะไรคือสถาปัตยกรรมจริงที่ห้ามเข้าใจผิด
3. requirement ใหม่กระทบโค้ดส่วนไหนบ้าง
4. ถ้าจะทำต่ออย่างปลอดภัย ควรเดินลำดับไหน

## 2. Executive Summary

XgenM เป็น Chrome Extension แบบ Manifest V3 สำหรับดึงวิดีโอและข้อความจาก TikTok/Facebook Reel แล้ว cross-post ไป X ผ่าน browser session จริงของผู้ใช้ โดยไม่ใช้ official APIs

สภาพล่าสุดที่ยืนยันแล้ว:

- เส้นทางที่แข็งแรงสุดคือ `TikTok -> extract -> prepare text -> open X -> upload media -> verify composer text -> prepare draft / auto-post`
- สถาปัตยกรรมปัจจุบันยึดหลัก `browser truth > assumption`
- `background` เป็นตัวตัดสินใจหลัก ไม่ใช่ content script
- ฝั่ง X ผ่านการ harden มาแล้ว 2 รอบใหญ่:
  - Submit-Truth refactor
  - Xafi parity composer insertion + semantic proof softening
- Hard gate ล่าสุดผ่านครบ:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm run test` ✅
  - test ปัจจุบัน: `123 passed`

## 3. สภาพจริงล่าสุดของระบบ

### สิ่งที่ทำได้แล้ว

- มี side panel UI ใช้งานได้จริง
- รับ URL ต้นทางจาก TikTok/Facebook Reel ได้
- background service worker orchestrate งานทั้ง flow ได้
- TikTok extraction ค่อนข้าง mature แล้ว
- เปิด X, อัปโหลด media, ใส่ caption, verify caption, แล้วหยุดที่ draft หรือกด post ได้
- มี local persistence ด้วย `chrome.storage.local`
- มี unit/component tests คลุม logic สำคัญแล้ว

### สิ่งที่ยังไม่แข็งหรือยังไม่ทำ

- Facebook Reel ยังเป็น secondary path
- ยังไม่มี queue หลายโพสต์
- ยังไม่มี scheduled posting
- ยังไม่มี idle engagement engine
- ยังไม่มี quote automation ที่ทำงานบน topic-driven flow
- ยังไม่มี settings UI เต็มรูปแบบ

## 4. Architecture Truth ที่คนรับงานต่อควรรู้ก่อนแตะโค้ด

### 4.1 Background คือ authority

อย่าเอา logic การตัดสินใจขั้นสุดท้ายไปซ่อนไว้ใน content script

สิ่งที่ใช้จริงตอนนี้:

- content script ฝั่ง X ทำหน้าที่หา DOM, เขียนข้อความ, verify สภาพที่มองเห็น, และส่ง evidence กลับมา
- `src/background/x-post-session.ts` เป็นตัวประเมินว่า submit ได้จริงไหม, draft-ready ไหม, หรือควร fail

เหตุผล:

- X editor มีโอกาสแสดงข้อความใน DOM แต่ internal submit state ยังไม่พร้อม
- ถ้าให้ content script “เดาเอง” จะเกิด false success ได้ง่าย

### 4.2 Browser truth สำคัญกว่า test pass

บทเรียนจาก XgenM และ Xafi ตรงกัน:

- test ผ่าน ไม่ได้แปลว่า extension ทำงานจริงใน Chrome runtime
- โดยเฉพาะกรณี contenteditable, synthetic paste, upload completion, และ selector drift
- งานทุกชิ้นที่แตะ browser-heavy path ต้องจบด้วย manual smoke ใน Chrome จริง

### 4.3 X path ใช้ upload-first แบบตั้งใจ

ลำดับที่พิสูจน์ว่าเสถียรกว่าคือ:

1. เปิด X
2. upload media ก่อน
3. รอ upload heuristics
4. compose caption
5. proof / gating
6. prepare-draft หรือ auto-post

อย่าสลับลำดับนี้โดยไม่มีหลักฐานจาก browser truth ใหม่

### 4.4 Writer กับ Proof แยกหน้าที่กัน

- `composer-write.ts` รับผิดชอบ "ทำให้ข้อความเข้า editor"
- `composer-proof.ts` รับผิดชอบ "พิสูจน์ว่าข้อความที่เห็นตรงกับสิ่งที่เราต้องการ"
- `x-post-session.ts` รับผิดชอบ "ใช้ evidence ที่ได้มาตัดสินใจว่าปลอดภัยพอจะ post หรือไม่"

### 4.5 Build ไม่ได้มีแค่ Vite

XgenM เป็น extension ที่มี dual pipeline:

- Vite build popup + background
- esbuild bundle content scripts แยกเป็น standalone outputs

ดังนั้นถ้า bug อยู่ใน content script ต้องเช็กทั้ง source และ output behavior ของ bundle ที่ถูก inject จริง

## 5. ไฟล์ที่ต้องอ่านก่อนเริ่มทำงาน

อ่านตามลำดับนี้:

1. `project_map.md`
2. `doc/current-status-handoff.md`
3. `src/background/job-runner.ts`
4. `src/background/x-post-session.ts`
5. `src/content/x/composer.ts`
6. `src/content/x/composer-write.ts`
7. `src/content/x/composer-proof.ts`
8. `src/content/x/upload.ts`
9. `src/shared/types.ts`
10. `tests/component/content/x/composer.test.ts`

## 6. Requirement ใหม่จากผู้ส่งงาน

ต้นฉบับอยู่ใน `doc/hand-off/feature-requirements.md`

สรุปสาระ:

1. โพสต์หลายอัน และตั้งเวลาได้
2. ช่วงที่ไม่ได้โพสต์ ให้ไปหน้า inspiration บน X แล้วทำ engagement เช่นดูโพสต์, กดใจ, รีโพสต์
3. มี quote flow แบบสุ่มเวลาและอิงหัวข้อ

## 7. Gap Analysis เทียบกับของที่มีอยู่

### Requirement 1: โพสต์หลายอัน + ตั้งเวลา

สถานะปัจจุบัน:

- ระบบรองรับ single job เป็นหลัก
- มี job state และ history แต่ยังไม่มี queue scheduler
- ไม่มี persistence model สำหรับ scheduled jobs
- ไม่มี `chrome.alarms` orchestration

สิ่งที่ต้องเพิ่ม:

- queue model สำหรับหลายงาน
- schedule model ใน storage
- background scheduler ที่ใช้ `chrome.alarms`
- job locking / dedupe
- UI สำหรับดู queue, เวลา, สถานะ, retry
- validation ว่า tab/session/login พร้อมก่อนยิงงานตามเวลา

ข้อควรระวัง:

- MV3 service worker ไม่ได้รันค้างตลอดเวลา ต้องออกแบบให้ปลุกตัวเองจาก alarm แล้ว resume state ได้
- งาน scheduled ต้อง recover ได้แม้ browser reload หรือ service worker sleep

### Requirement 2: ช่วง idle ให้ไปทำ engagement บนหน้า inspiration

สถานะปัจจุบัน:

- ไม่มี flow แบบ browse/feed/engagement automation
- ไม่มี content script orchestration สำหรับหน้า `https://x.com/i/jf/creators/inspiration/top_posts`
- selector, action semantics, และ stop conditions ยังไม่ถูกออกแบบ

สิ่งที่ต้องเพิ่ม:

- new idle-engagement job type
- content script / action layer สำหรับ inspiration page
- state machine สำหรับ `open -> scan cards -> decide action -> execute -> cool down -> continue/stop`
- rate limit และ safety guardrails
- operator visibility/logging แยกจาก post job ปกติ

ข้อควรระวังเชิงผลิตภัณฑ์:

- งานประเภทนี้เสี่ยงเรื่อง platform policy และ false-positive actions สูงกว่าโพสต์ปกติ
- ควรเริ่มจาก operator-assisted mode ก่อน เช่น review action plan ก่อน run จริง
- อย่าทำแบบ fire-and-forget ตั้งแต่รอบแรก

### Requirement 3: quote แบบสุ่มเวลาและตามหัวข้อ

สถานะปัจจุบัน:

- ยังไม่มี quote composer flow เป็น first-class feature
- ยังไม่มี topic engine หรือ quote text policy
- current text-preparation logic ยังโฟกัส source caption เป็นหลัก

สิ่งที่ต้องเพิ่ม:

- quote job type
- strategy สำหรับเลือก source post จาก inspiration/feed
- topic-to-text mapping หรือ operator-provided templates
- quote composer targeting/verification แยกจาก normal compose
- randomized delay window ที่ตรวจสอบได้จาก config ไม่ใช่ hardcode กระจัดกระจาย

ข้อควรระวัง:

- quote surface ของ X อาจต่างจาก normal composer และอาจต้องใช้ selector/flow คนละชุด
- ถ้าจะให้ “ตามหัวข้อ” ต้องนิยามแหล่งหัวข้อให้ชัด เช่น template ต่อ topic, operator prompt, หรือ curated text blocks

## 8. Recommendation เรื่องการแปลง requirement เป็น scope ที่ทำได้จริง

อย่ากระโดดทำครบทั้ง 3 requirement พร้อมกัน

ลำดับที่แนะนำ:

### Phase A: Scheduling + queue พื้นฐาน

เป้าหมาย:

- รองรับหลายโพสต์แบบ sequential
- รองรับ schedule ด้วย `chrome.alarms`
- ใช้ flow เดิมที่พิสูจน์แล้วก่อน ไม่แตะ engagement และ quote ใน phase แรก

เหตุผล:

- leverage ของเดิมได้มากที่สุด
- ความเสี่ยงต่ำกว่า
- เป็นฐานให้ requirement 2 และ 3 ใช้ orchestration เดียวกันภายหลัง

### Phase B: Idle engagement แบบ operator-visible

เป้าหมาย:

- มี state machine แยกชัดเจน
- มี action log ทุกครั้ง
- จำกัด action types ก่อน เช่น view / like อย่างระวัง
- เปิด review mode หรือ dry-run ได้

เหตุผล:

- งานนี้ fragile กว่า post flow มาก
- ต้องเห็น behavior ใน log อย่างละเอียดก่อนค่อยขยาย

### Phase C: Quote automation ตาม topic

เป้าหมาย:

- สร้าง quote flow แยกจาก normal posting
- รองรับ topic configuration และ time window
- verify จริงว่า quote text อยู่ใน composer ที่ถูกต้อง

เหตุผล:

- quote มีทั้ง selector drift และ semantic risk
- ต้องทำหลังจากมี scheduler + engagement framework แล้ว

## 9. โครงสร้างระบบที่น่าจะต้องเพิ่ม

ตัวอย่าง module ที่คาดว่าจะต้องมี:

- `src/background/scheduler.ts`
- `src/background/job-queue.ts`
- `src/background/alarm-manager.ts`
- `src/background/idle-session.ts`
- `src/content/x/inspiration.ts`
- `src/content/x/engagement.ts`
- `src/content/x/quote.ts`
- `src/shared/schedule.ts`
- `src/shared/engagement.ts`

และอาจต้องขยาย type ใน `src/shared/types.ts` เช่น:

- `JobKind = 'cross-post' | 'scheduled-post' | 'idle-engagement' | 'quote-post'`
- schedule payload
- queue entry
- engagement action result
- quote job config

## 10. ข้อแนะนำด้าน implementation สำหรับเพื่อนที่รับงานต่อ

### ทำสิ่งเหล่านี้ก่อน

- รัน hard gate ปัจจุบันให้ผ่านก่อนแตะโค้ด
- โหลด extension จาก `dist/` ใน Chrome จริง
- smoke test TikTok -> X draft flow ก่อน
- ตรวจว่า current composer path ยังผ่านใน browser จริง

### ห้าม assume สิ่งเหล่านี้

- อย่าคิดว่า test pass แปลว่า X runtime pass
- อย่าคิดว่า quote surface ใช้ logic เดียวกับ normal compose ได้ทันที
- อย่าคิดว่า MV3 service worker จะอยู่รอ scheduler ตลอดเวลา
- อย่าฝัง random delay ไว้กระจัดกระจายตามไฟล์ ให้รวมศูนย์ใน config

### pattern ที่ควรยึด

- Background authority
- Content script returns evidence, not business truth
- Browser-truth smoke after every browser-heavy change
- Local-first persistence
- Small explicit state machines instead of giant implicit flows

## 11. Milestone สำคัญที่ควรรู้

- `0882629` phase 1 truth contract / compose evidence boundary
- `fd4f4ef` refactor composer into 4 modules
- `a40e4ea` extract `x-post-session` from `job-runner`
- `51841ab` add safety gates and operator semantics
- `bfeb596` harden X typing state sync
- `b1c62dc` tighten typing sync assertions
- `30e08c2` switch composer to paste flow
- `3aa5149` port full Xafi insertion envelope for live X parity
- `0510a09` soften semantic auto-post matching

อ่าน commit เหล่านี้เพื่อเข้าใจว่าทำไม X flow ปัจจุบันหน้าตาแบบนี้

## 12. Validation Protocol ที่ควรทำทุกครั้ง

### hard gate

- `npm run build`
- `npm run lint`
- `npm run test`

### browser truth

- โหลด `dist/` เป็น unpacked extension
- ทดสอบ `prepare-draft` ก่อน `auto-post`
- จับ log และ phase progression ทุกครั้ง
- ถ้า browser fail แต่ test pass ให้เชื่อ browser แล้วเขียน blocker snapshot ใหม่

## 13. เอกสารประกอบในโฟลเดอร์นี้

- `README.md` ไฟล์นี้: executive hand-off
- `feature-requirements.md`: ต้นฉบับ requirement + engineering interpretation
- `context-and-evidence.md`: สรุปบริบทจาก memory, docs, และ git
- `raw-memory/INDEX.md`: สารบัญ raw memory references ที่ copy มาจาก `ψ/memory`
- `raw-memory/`: ชุดข้อมูลต้นฉบับจาก XgenM, Xafi, และ tiktok-shop-automation สำหรับ full-text search และ trace-back

## 14. สรุปสั้นที่สุดสำหรับคนรับงานต่อ

ถ้าจะเริ่มทำต่อทันที ให้เริ่มจาก:

1. ยืนยันว่า current X flow ยังผ่านใน Chrome จริง
2. ทำ scheduler + queue ให้ได้ก่อน
3. ค่อยแยก idle engagement เป็น state machine ใหม่
4. ทำ quote flow เป็นงานแยก ไม่ผสมกับ normal compose ตั้งแต่แรก

ฐานระบบตอนนี้ดีพอสำหรับการต่อยอด แต่ต้องรักษาหลัก `browser truth`, `background authority`, และ `small explicit state machines` ไว้ ไม่งั้น regression จะกลับมาเร็วมาก