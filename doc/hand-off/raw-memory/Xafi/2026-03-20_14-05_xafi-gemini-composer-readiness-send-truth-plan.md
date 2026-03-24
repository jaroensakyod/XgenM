# Snapshot: Xafi Gemini Composer Readiness and Send Truth Blueprint

**Time**: 2026-03-20 14:05 +0700
**Context**: grounded from cold-open Gemini queue failure, visible composer stays empty, first-item fail/second-item pass pattern, and current runtime readiness gap

---
type: plan
project: Xafi
task_id: "#plan-xafi-gemini-composer-readiness-send-truth-2026-03-20"
status: active
tags: [plan, blueprint, Xafi, gemini, composer-readiness, send-flow, queue, browser-truth]
related_files:
  - /Users/non/dev/opilot/projects/Xafi/content_ai.js
  - /Users/non/dev/opilot/projects/Xafi/background.js
  - /Users/non/dev/opilot/projects/Xafi/manifest.json
  - /Users/non/dev/opilot/projects/Xafi/doc/release_readiness.md
  - /Users/non/dev/opilot/ψ/memory/logs/Xafi/2026-03-20_10-49_xafi-gemini-runtime-wiring-v2-plan.md
  - /Users/non/dev/opilot/ψ/memory/logs/Xafi/2026-03-20_11-17_xafi-v2-phase34-hard-gate-browser-truth.md
  - /Users/non/dev/opilot/ψ/memory/retrospectives/2026-03/20/10.37_xafi-gemini-phase34-seam-close.md
---

## Objective
- แก้ปัญหา Gemini cold-open ที่ item แรกใน queue มักพังด้วยอาการ `ไม่พบปุ่มส่งของ Gemini` ทั้งที่ popup เปิดขึ้นแล้ว
- ทำให้ระบบแยกให้ออกระหว่าง `page loaded` กับ `composer พร้อมใช้งานจริง`
- ลด false negative ที่เกิดจากการจับ hidden/wrong textbox หรือการตรวจ send state จาก element ผิดตัว
- สร้าง test/verification net ที่พิสูจน์อาการ first-item fail, second-item pass ได้อย่าง deterministic เท่าที่ environment อนุญาต

## Context Grounding
- ช่องว่างเชิงสถาปัตย์ปัจจุบัน:
  - `content_ai.js` ส่ง `AI_PAGE_READY` หลังรอแค่ `window.load` ไม่ได้รอ composer ของ Gemini พร้อมจริง
  - `background.js` รับ `AI_PAGE_READY` แล้ว dispatch prompt ทันที
  - `waitForElement()` เลือก input ตัวแรกที่ match selectors โดยไม่กรอง visibility, active state, หรือ composer ownership
  - ถ้า script พิมพ์ลง editable node ผิดตัว UI ที่ผู้ใช้เห็นจะยังว่าง และ Gemini จะยังไม่เปิด send-ready state
- หลักฐานจาก manual truth ล่าสุด:
  - เมื่อกด `สร้างจากคิว` popup Gemini เปิดขึ้นและ status ใน extension ขึ้น `กำลังพิมพ์ Prompt...`
  - UI Gemini ที่เห็นยังว่างและแสดง microphone/idle state แทน send-ready state
  - item แรกใน queue พัง แต่ item ถัดไปมักผ่านบนแท็บเดิม
- ช่องว่างด้านเอกสาร:
  - Xafi ยังไม่มี `project_map.md`; แผนนี้จึงอิง README, runtime code, snapshots, และ retrospective ล่าสุดแทน

## Scope
- In Scope:
  - readiness contract ระหว่าง `background.js` กับ `content_ai.js` สำหรับ Gemini path
  - input targeting / visible composer validation ใน `content_ai.js`
  - send-state detection และ candidate selection เฉพาะที่จำเป็นเพื่อกัน false negative
  - targeted tests สำหรับ cold-open queue behavior และ warm-tab behavior
  - manual smoke checklist ที่วัด browser truth ของ Gemini send flow
- Out of Scope:
  - refactor `background.js` ใหญ่ทั้งไฟล์
  - เปลี่ยน contract ฝั่ง Grok ถ้าไม่จำเป็นกับ safety
  - แก้ flow ฝั่ง X/Twitter, sidepanel, หรือ Auto Quote อื่นนอกผลกระทบจาก error นี้
  - architecture rewrite ไปสู่ bundler/module runtime ใหม่ทั้งก้อน

## Phases

### Phase 1: Freeze Ground Truth and Failure Model
- Deliverables:
  - สรุป failure model แบบชัดเจนในโค้ด/plan ว่าอาการปัจจุบันคือ `cold-open composer readiness gap`, ไม่ใช่แค่ selector send button หาย
  - ระบุสัญญาณที่ต้องใช้ตัดสินว่าระบบคุยกับ visible active composer จริง
  - ระบุจุด log/debug ที่ต้องเพิ่มหรือตรวจเพื่อแยก stage `page-ready`, `composer-found`, `prompt-visible`, `send-ready`, `send-started`
- Exit Criteria:
  - ไม่มี ambiguity ว่า bug หลักคืออะไร และ success condition ของการแก้คืออะไร
  - ทุกคนใน thread ใช้คำเดียวกันกับปัญหา: page-ready ไม่เท่ากับ composer-ready
- Critical Test Cases:
  - cold-open Gemini popup: page complete แล้ว แต่ visible composer ยังไม่พร้อม
  - visible composer ว่าง ขณะที่ script ถือ editable node อื่นอยู่
  - item แรก fail / item ที่สอง pass ถูกอธิบายได้ด้วย warm-tab timing ไม่ใช่ด้วย random selector luck

### Phase 2: Composer Readiness and Input Ownership Hardening
- Deliverables:
  - ปรับการหา input ให้เลือก `visible, writable, active-composer candidate` แทน first-match heuristic อย่างเดียว
  - เพิ่ม validation หลัง fill ว่า text อยู่ใน composer ที่ผู้ใช้เห็นจริง ไม่ใช่แค่ใน node ที่ script ถือ
  - แยก helper สำหรับ readiness เช่น `waitForComposerReady`, `findVisibleComposerInput`, หรือ equivalent seam ที่ test ได้
- Exit Criteria:
  - item แรกบน cold-open Gemini ไม่เดินต่อจนกว่าจะมี composer ที่พร้อมจริง
  - ถ้า text ไม่เข้า visible composer ให้ fail ด้วย error ที่ตรง root cause มากกว่า `ไม่พบปุ่มส่ง`
- Critical Test Cases:
  - hidden/offscreen textbox match selectors แต่ต้องไม่ถูกเลือกเป็น target หลัก
  - visible composer ยังไม่พร้อม -> flow ต้องรอ/timeout ด้วย error readiness ที่ชัด
  - หลัง fill prompt แล้ว visible composer ต้องมี text สะท้อนใน DOM ที่ผู้ใช้เห็น

### Phase 3: Send-State and First-Run Queue Recovery Hardening
- Deliverables:
  - ปรับ send detection ให้ดูจาก send-ready control หรือ composer state ที่สอดคล้องกับ Gemini UI ปัจจุบัน ไม่พึ่ง `aria-label` legacy อย่างเดียว
  - ลด false negative จากกรณีที่ click ส่งแล้วแต่ `waitForSendStart()` ยังอ่าน state ผิด input
  - ทบทวนการปิด popup หลัง error ให้เหมาะกับ debugging truth หรืออย่างน้อยต้องมี evidence พอก่อนปิด
- Exit Criteria:
  - เมื่อ prompt อยู่ใน visible composer จริง ระบบต้องหาทางส่งได้ หรือให้ error ที่บอก stage จริง
  - item แรกที่ fail ต้องทิ้ง evidence เพียงพอว่า fail ที่ readiness / send detection stage ไหน
- Critical Test Cases:
  - send button ไม่ใช้ข้อความ `Send` แบบเดิม แต่ยังเป็น send-ready control ได้
  - Enter fallback ไม่ทำงาน แต่ระบบยังไม่รายงานผิดว่า `ไม่พบปุ่มส่ง` ถ้ายังเป็น readiness problem
  - queue มากกว่า 1 รายการ: item แรก cold-open, item ถัดไป warm-tab ต้องไม่พฤติกรรมต่างกันเพราะ race condition เดิม

### Phase 4: Regression Net and Hard Gate
- Deliverables:
  - เพิ่ม targeted test fixtures สำหรับ Gemini composer DOM, hidden textbox trap, warm vs cold tab, และ send-ready state
  - รัน hard gate ที่พิสูจน์โค้ดที่แตะไม่ทำให้ runtime wiring เดิม regress
  - บันทึกว่าปัจจุบัน project ไม่มี lint script และใช้ build/test/check เป็น canonical hard gate แทน
- Exit Criteria:
  - regression test ครอบ known failure classes ของรอบนี้ได้
  - build/test/syntax ผ่านครบใน scope ที่แตะ
- Critical Test Cases:
  - cold-open fixture ต้องไม่ dispatch send ก่อน composer ready
  - wrong textbox fixture ต้อง fail ด้วย readiness/input ownership error ไม่ใช่ send button error
  - existing Gemini response-selection parity tests ยังผ่าน
  - Grok path ยังไม่ regress

### Phase 5: Browser Truth Validation and Rollout Decision
- Deliverables:
  - manual smoke script สำหรับ Chrome unpacked extension จาก `dist/`
  - validate สองเคสหลัก: single queue item cold-open และ multi-item queue warm-tab continuation
  - สรุปผลเป็น go / iterate / rollback พร้อม evidence ว่าอะไรพิสูจน์แล้วใน browser และอะไรยังเป็น assumption
- Exit Criteria:
  - browser truth ยืนยันว่า first-item send flow เสถียรขึ้นจริง หรือมี blocker evidence ที่ precise พอสำหรับรอบถัดไป
- Critical Test Cases:
  - queue 1 item: Gemini cold-open ต้องพิมพ์เข้า visible composer และส่งได้
  - queue 2 items: item แรกและ item ที่สองต้อง behavior สม่ำเสมอ ไม่ใช่ fail-then-pass จาก timing
  - error path ต้องไม่ปิด popup เร็วจนเก็บ evidence ไม่ทัน ถ้ายังอยู่ในช่วง debug-focused rollout

## Risks and Countermeasures
- Risk: แก้ readiness แล้วไปกระทบ Grok path โดยไม่ตั้งใจ
  - Countermeasure: แยก provider branch ชัดเจนและใช้ regression tests ของ Grok path เป็น guard
- Risk: Gemini DOM ปัจจุบันใช้ send-ready signal ที่เปลี่ยนบ่อย
  - Countermeasure: อย่าผูกกับ label เดียว; ใช้ visible composer state + nearby actionable control + focused error staging
- Risk: เพิ่ม wait มากเกินไปจน queue latency แย่
  - Countermeasure: วัด cold-open vs warm-tab timing แยกกัน และกำหนด timeout ที่ bounded พร้อม evidence
- Risk: manual smoke ยัง fail เพราะ browser truth มี DOM/state ที่ jsdom จำลองไม่ครบ
  - Countermeasure: treat browser smoke as truth source; ถ้า test ผ่านแต่ browser fail ให้ snapshot blocker โดยไม่ claim success เกินจริง

## Rollback Strategy
- Trigger rollback if:
  - item แรกยัง fail ใน browser ด้วยอาการเดิมหลัง readiness patch
  - warm-tab behavior regress จน item ถัดไปแย่ลงกว่า baseline
  - Grok path หรือ response extraction path regress
- Rollback steps:
  - revert เฉพาะ commit ของ readiness/send-flow รอบนี้
  - เก็บ snapshot ของ browser evidence และ exact failure stage ไว้ใน `ψ/memory/logs/Xafi/`
  - คง Phase 0-4 runtime wiring assets เดิมไว้เป็นฐาน

## Verification Strategy
- Build:
  - `cd /Users/non/dev/opilot/projects/Xafi && npm run build:dist`
- Tests:
  - `cd /Users/non/dev/opilot/projects/Xafi && npm run test:unit`
- Syntax sanity:
  - `cd /Users/non/dev/opilot/projects/Xafi && node --check content_ai.js`
  - `cd /Users/non/dev/opilot/projects/Xafi && node --check background.js`
- Diagnostics:
  - check editor diagnostics on touched files
- Browser smoke:
  - โหลด unpacked extension จาก `dist/`
  - เคส A: queue 1 item บน Gemini cold-open
  - เคส B: queue 2 items เพื่อตรวจ first-run vs second-run consistency
  - บันทึก screenshot/console evidence เมื่อ visible composer ยังว่าง, send-ready control ไม่ขึ้น, หรือ popup ถูกปิดหลัง error

## Expected Outcome
- Xafi จะไม่ dispatch prompt ไปยัง Gemini ก่อน composer พร้อมจริง
- อาการ `item แรก fail / item ที่สอง pass` จะหายหรือถูกลดลงจนเหลือ evidence ที่ pinpoint stage ชัดเจน
- ถ้ายัง fail ผู้ใช้จะได้ error ที่ตรง root cause กว่าเดิม เช่น readiness/input ownership แทน `ไม่พบปุ่มส่งของ Gemini`
- thread นี้จะจบด้วย browser-truth decision ที่แยกว่าอะไรพิสูจน์แล้วกับอะไรยังค้าง assumption

## Execution Update: 2026-03-20 19:12 +0700
- **Phase 1: DONE**
  - ล็อก failure model ใน runtime code ว่า bug นี้คือ `cold-open composer readiness gap`
  - เพิ่ม stage logging ใน `content_ai.js` สำหรับ `page-ready`, `composer-found`, และ `prompt-visible`
- **Phase 2: DONE**
  - เพิ่ม visible composer guard ใน `content_ai.js` ผ่าน `waitForComposerReady()`, `findVisibleComposerInput()`, และ `waitForVisiblePrompt()`
  - ย้าย flow จาก first-match input ไปเป็น visible/writable/high-score composer candidate
  - ถ้า prompt ไม่เข้า visible composer จริง จะ fail ด้วย error ฝั่ง readiness/input ownership แทนการไหลต่อไปเจอ `ไม่พบปุ่มส่งของ Gemini`
- **Verification**
  - `npm run test:unit` ✅ (`125/125` tests, `8/8` files)
  - `npm run build:dist` ✅
  - `node --check content_ai.js` ✅
  - `node --check background.js` ✅
  - `npm run lint` ❌ missing script in project context; hard gate รอบนี้จึงใช้ build + tests + syntax checks ตามสภาพจริงของ repo และตามแผน Phase 4
- **Files Added/Changed in repo scope**
  - `content_ai.js`
  - `lib/composer-readiness.js`
  - `tests/gemini/composer-readiness.test.js`
  - `tests/gemini/runtime-parity.test.js`
- **Next Phase**
  - Phase 3 จะโฟกัส send-ready / send-start truth หลังจาก input ownership และ visible composer readiness ถูกล็อกแล้ว

## Execution Update: 2026-03-20 19:26 +0700
- **Phase 3: DONE**
  - harden send-state detection ใน `content_ai.js` ให้แยก `send-ready control ยังไม่พร้อม` ออกจาก `พยายามส่งแล้วแต่ send-start ไม่เกิด`
  - เพิ่ม `buildSendStateSnapshot()`, `collectSendControls()`, และ scoring ที่ตัด stop/disabled/microphone controls ออกจาก actionable path
  - เพิ่ม stage logging สำหรับ `send-ready` และ `send-start` เพื่อให้ browser truth ชี้ stage failure ได้ตรงกว่าเดิม
- **Phase 4: DONE**
  - เพิ่ม seam ฝั่ง testable module ใน `lib/send-readiness.js`
  - เพิ่ม regression suite ใน `tests/gemini/send-readiness.test.js` ครอบ send-ready state, hidden trap class เดิม, และ cold-to-warm control progression
  - ขยาย parity guard ใน `tests/gemini/runtime-parity.test.js` ให้เช็ก markers ของ phase 3,4 ใน runtime จริง
- **Verification**
  - `npm run test:unit` ✅ (`131/131` tests, `9/9` files)
  - `npm run build:dist` ✅
  - `node --check content_ai.js` ✅
  - `node --check background.js` ✅
  - `npm run lint` ❌ missing script in project context; hard gate รอบนี้ยังคงใช้ build + tests + syntax checks ตาม repo reality และบันทึกไว้แล้วใน Phase 4
- **Commit**
  - `0675b91` `feat: harden Gemini send truth #plan-xafi-gemini-composer-readiness-send-truth-2026-03-20`
- **Files Added/Changed in repo scope**
  - `content_ai.js`
  - `lib/send-readiness.js`
  - `tests/gemini/runtime-parity.test.js`
  - `tests/gemini/send-readiness.test.js`
- **Next Phase**
  - Phase 5 จะต้องยืนยัน browser truth บน unpacked extension จาก `dist/` ทั้ง single-item cold-open และ multi-item warm-tab continuation

## Execution Update: 2026-03-20 19:30 +0700
- **Phase 5: VALIDATION KIT READY**
  - เพิ่ม runbook manual smoke สำหรับ Gemini browser truth ที่ `doc/2026-03-20-gemini-browser-truth-phase5.md`
  - อัปเดต `doc/release_readiness.md` และ `README.md` ให้สะท้อนว่า repo นี้มี unit tests แล้ว แต่ยังไม่มี browser automation harness แบบ deterministic
  - เพิ่ม decision matrix `go / iterate / rollback` และ evidence template เพื่อให้เก็บ browser truth ได้สม่ำเสมอ
- **Verification**
  - `npm run test:unit` ✅ (`131/131` tests, `9/9` files)
  - `npm run build:dist` ✅
  - `node --check content_ai.js` ✅
  - `node --check background.js` ✅
  - `npm run lint` ❌ missing script in project context; hard gate รอบนี้ยังคงใช้ build + tests + syntax checks ตาม repo reality
- **Commit**
  - `ee3db9f` `docs: add Gemini phase5 browser truth kit #plan-xafi-gemini-composer-readiness-send-truth-2026-03-20`
- **Current Truth**
  - phase 5 ฝั่งเอกสารและ validation kit พร้อมแล้ว
  - browser truth single-item / multi-item บน Chrome จริงยังต้องให้ operator รันตาม runbook ก่อนจะปิด phase นี้เป็น `DONE`

