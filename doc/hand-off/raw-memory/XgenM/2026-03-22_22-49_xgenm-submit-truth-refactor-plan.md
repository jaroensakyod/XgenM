---
type: plan
project: XgenM
task_id: "#x-post-missing-text-submit-truth"
status: active
tags: [plan, blueprint, x, composer, refactor]
related_files:
  - projects/XgenM/src/background/job-runner.ts
  - projects/XgenM/src/content/x/composer.ts
  - projects/XgenM/src/content/x/upload.ts
  - projects/XgenM/src/content/x/selectors.ts
  - projects/XgenM/src/shared/messages.ts
  - projects/XgenM/src/shared/types.ts
  - projects/XgenM/tests/component/content/x/composer.test.ts
  - projects/XgenM/tests/unit/background/job-runner-orchestration.test.ts
---

# XgenM /ppp: Submit-Truth Safe Refactor For X Posting

Timestamp: 2026-03-22 22:49 +0700

## Objective

Refactor เฉพาะ X posting boundary เพื่อแก้ risk class ที่พิสูจน์แล้วว่าเกิดได้จริง: composer แสดงข้อความใน DOM แต่ payload ตอน submit อาจยังว่างหรือไม่ตรงกับข้อความที่ operator เห็น โดยต้องลด monolithic branching ใน `job-runner.ts` และ `composer.ts` พร้อมรักษาเสถียรภาพของ flow อื่นให้มากที่สุด.

## Grounded Facts

- `preparedPost.text` ไม่ใช่ต้นเหตุหลัก; characterization tests พิสูจน์แล้วว่า pipeline สร้างข้อความได้จริง.
- `upload-first` เป็น bias ที่ตั้งใจไว้ในระบบและยังไม่มีหลักฐานว่าควรถูกเปลี่ยน.
- blind spot ปัจจุบันคือ `COMPOSE_POST` success อิง DOM-visible verification มากกว่าหลักฐาน submit-truth.
- `job-runner.ts` ถือ orchestration มากเกินไป: extract, merge fallback, download, open X, upload, compose, verify, post.
- `composer.ts` ยังรวมหลาย responsibility ไว้ไฟล์เดียว: target selection, insertion, verification, submit.
- `selectors.ts`, `upload.ts`, `tab-manager.ts`, `storage.ts` มี boundary ชัดพอและไม่ควรถูก refactor ถ้าไม่มี evidence ใหม่.

## Scope

### In Scope

- แยก X compose/post orchestration ออกจาก background monolith แบบไม่แตะ source extraction path.
- ยกระดับ message/result contract ให้ส่ง evidence มากกว่า boolean success.
- แตก responsibility ใน X composer เป็นโมดูลย่อยที่ทดสอบได้.
- เพิ่ม gating ระหว่าง `prepare-draft` กับ `auto-post` ตามระดับความเชื่อมั่นของ submit-truth.
- เพิ่ม characterization และ orchestration tests ที่ป้องกัน regression class นี้.

### Out Of Scope

- ไม่ refactor TikTok extraction.
- ไม่ harden Facebook Reel flow ในแผนนี้.
- ไม่เปลี่ยน persistence model หรือ popup UX ใหญ่.
- ไม่เปลี่ยน `upload-first` sequencing เว้นแต่ browser-truth ใหม่พิสูจน์ว่าจำเป็น.
- ไม่แตะ `tab-manager.ts` / `storage.ts` นอกจาก type adaptation เล็กน้อยที่หลีกเลี่ยงไม่ได้.

## Recommended Architecture

### Option A: Boundary Refactor แบบแยก X Posting Session ออกจาก job-runner

แนะนำ.

- เพิ่ม background-side X posting module เช่น `src/background/x-post-session.ts` เพื่อรับผิดชอบเฉพาะ:
  - open/focus X
  - upload media
  - request compose proof
  - decide draft-ready vs eligible-to-post
  - request final submit only when proof threshold ผ่าน
- ให้ `job-runner.ts` เหลือบทบาท orchestration ระดับสูง: extract -> prepare assets/text -> delegate X posting -> persist result.
- แตก `composer.ts` เป็นโมดูลย่อยเชิงหน้าที่ เช่น:
  - composer-target.ts
  - composer-write.ts
  - composer-proof.ts
  - composer-submit.ts
- ขยาย message contract จาก `X_ACTION_RESULT.success` ไปเป็น evidence object เช่น:
  - composer target meta
  - normalized visible text
  - insertion strategy used
  - submit readiness signal
  - confidence / proof status

เหตุผล:

- ลด blast radius โดยไม่แตะ extraction และ upload internals.
- ทำให้ auto-post ไม่ต้องพึ่ง boolean coarse result.
- ทำให้ tests ผูกกับ evidence-based behavior แทน DOM illusion.

### Option B: Patch composer.ts อย่างเดียว แล้วคง job-runner เดิม

ไม่แนะนำเป็นแผนหลัก.

- เปลี่ยนน้อยกว่า แต่ยังทิ้ง orchestration ambiguity เดิม.
- auto-post flow จะยังอ่านผลลัพธ์แบบ coarse อยู่ ทำให้ false positive กลับมาได้.

### Option C: Rewrite X flow ใหม่ทั้งหมด

ปฏิเสธ.

- เสี่ยงเกิน scope.
- จะกระทบ stability ของ flow ที่ตอนนี้ใช้งานได้อยู่จริง.

## Phases

### Phase 1: Truth Contract And Probe Boundary

Deliverables:

- นิยาม result/evidence contract ใหม่ใน shared layer สำหรับ X compose/post.
- เพิ่ม explicit proof statuses เช่น `visible-only`, `draft-ready`, `submit-ready`, `proof-failed`.
- ผูก current submit-semantics harness เข้ากับ contract ใหม่โดยยังไม่เปลี่ยน runtime behavior เยอะ.

Exit Criteria:

- background และ content script เข้าใจ contract เดียวกัน.
- tests พิสูจน์ได้ว่าเคส visible-text-but-empty-submit ถูก represent ด้วย status ที่ไม่ใช่ success ตรงๆ.

Critical Test Cases:

- visible text ตรง expected แต่ submit proof ไม่ผ่าน ต้องได้ status `visible-only` หรือ equivalent.
- insert สำเร็จและ proof ผ่าน ต้องได้ structured evidence object ครบ field หลัก.
- legacy failure path ยัง map เป็น `proof-failed` ได้โดยไม่กลืน error detail.

### Phase 2: Composer Decomposition Without Behavioral Expansion

Deliverables:

- แยก `composer.ts` ตาม responsibility โดย preserve selector knowledge ใน `selectors.ts`.
- ให้ `applyComposerTextInsertion()` และ verification/proof อยู่คนละ boundary ที่ทดสอบแยกกันได้.
- คง upload logic ใน `upload.ts` เดิม.

Exit Criteria:

- ไม่มี logic สำคัญหายจาก current compose path.
- component tests ใหม่ครอบทั้ง target selection, insertion strategy, proof classification.

Critical Test Cases:

- candidate scoring ยังเลือก composer ตัวเดิมใน DOM fixtures เดิม.
- insertion strategy ที่ใช้ปัจจุบันยังทำให้ visible text สำเร็จใน happy path.
- proof classifier แยก `visible-only` ออกจาก `submit-ready` ได้ใน harness เดิม.

### Phase 3: Background X Posting Session Extraction

Deliverables:

- สร้าง X posting session/background adapter ใหม่ แทนการกระจุกอยู่ใน `job-runner.ts`.
- ย้ายการตัดสินใจเรื่อง compose/post eligibility เข้า module ใหม่.
- `job-runner.ts` เหลือการเรียก orchestration step แบบ high-level.

Exit Criteria:

- auto-post path ไม่ rely on double `COMPOSE_POST` แบบเดิม.
- background อ่าน structured evidence แล้วตัดสินใจได้ชัดว่า stop-at-draft หรือ post ได้.

Critical Test Cases:

- `prepare-draft` หยุดที่ review state แม้ proof จะยังไม่ถึง submit-ready.
- `auto-post` ต้องไม่ click post ถ้า evidence ยังเป็น `visible-only`.
- upload success + submit-ready proof = post path เดินต่อได้.

### Phase 4: Safety Gates And Operator Semantics

Deliverables:

- เพิ่ม log markers ที่แยก visible verification ออกจาก submit proof.
- ปรับ error surface ให้ operator เห็นชัดว่า fail เพราะ selector, insertion, proof, หรือ submit gating.
- ตรึง non-goal ด้วย tests ว่า TikTok/Facebook extraction path ไม่โดน behavior change.

Exit Criteria:

- operator log อ่านสาเหตุ failure ได้ชัดขึ้น.
- regression net ครอบ risk class หลักครบ.

Critical Test Cases:

- error จาก proof layer ต้องถูก log ด้วย phase/context ที่ชัด.
- orchestration tests เดิมของ text prep และ upload ordering ยังผ่าน.
- unsupported/weak proof path ต้อง degrade ไป draft-review หรือ fail-safe โดยไม่ post เปล่า.

## Verification Strategy

Hard Gate ก่อนปิด implementation:

1. `npm run build`
2. `npm run lint`
3. `npm run test -- composer`
4. `npm run test -- job-runner`
5. ถ้ามี targeted live validation: TikTok -> X `prepare-draft` ก่อน แล้วค่อย `auto-post`

Definition of Done:

- ไม่มีเส้นทางที่ `auto-post` post ออกไปได้เมื่อ evidence ยังต่ำกว่า `submit-ready`.
- `job-runner.ts` และ `composer.ts` ลด responsibility ลงแบบอ่านได้ชัด ไม่ใช่เพียงย้าย if/else เฉยๆ.
- Existing upload-first behavior และ extraction behavior ยังไม่ regress.

## Risks

- X ไม่มี public submit-truth API; proof อาจยังเป็น heuristic เพียงแต่ชัดและปลอดภัยกว่าเดิม.
- การแตก module อาจทำให้ event timing บางเส้นทางเปลี่ยน ถ้า tests ไม่ครอบ DOM sequencing มากพอ.
- ถ้า contract เปลี่ยนกว้างเกินไป อาจกระทบ popup/background logging chain.

## Rollback Strategy

- แยก refactor เป็น phase-scoped commits.
- ถ้า Phase 2 แตก module แล้ว runtime drift ให้ revert เฉพาะ composer decomposition โดยไม่แตะ Phase 1 contract tests.
- ถ้า Phase 3 orchestration extraction เพิ่ม instability ให้ fallback ไปใช้ old posting branch ชั่วคราวหลัง contract layer เดิม.
- ห้ามรวม Facebook/TikTok hardening เข้ามาใน same branch ระหว่างงานนี้.

## Guardrails

- Preserve `upload-first`.
- Preserve `selectors.ts` as single selector source of truth.
- No new monolithic fallback ladder inside new module; prefer small pure helpers + explicit status mapping.
- Background should treat content-script evidence as report, not truth-by-assertion.

## Suggested Execution Order

1. Phase 1 ก่อนเพื่อ lock vocabulary และ proof model.
2. Phase 2 แตก composer โดยใช้ tests เดิมเป็น characterization net.
3. Phase 3 ค่อยย้าย orchestration ออกจาก `job-runner.ts`.
4. Phase 4 ปิด observability + operator semantics + final hard gate.

## Handoff Note

แผนนี้ intentionally เลือก refactor แบบแคบและพิสูจน์ได้ ไม่ใช่ rewrite. ถ้าระหว่าง Phase 1 พบ browser-truth ใหม่ที่หักล้างสมมติฐาน submit-truth gap ให้หยุดและออก snapshot ใหม่แทนการดันทุรัง refactor ต่อ.

## Execution Status Update

Timestamp: 2026-03-22 23:46 +0700

- Phase 1: DONE
  - Commit: `0882629`
  - Result: truth contract เพิ่ม `ComposeEvidence`, proof status mapping, background/content shared vocabulary.
- Phase 2: DONE
  - Commit: `fd4f4ef`
  - Result: `composer.ts` ถูกแยกเป็น `composer-target.ts`, `composer-write.ts`, `composer-proof.ts`, `composer-submit.ts`.
- Phase 3: DONE
  - Commit: `a40e4ea`
  - Result: สร้าง `x-post-session.ts`, ย้าย compose/post eligibility ออกจาก `job-runner.ts`, ตัด double `COMPOSE_POST` ออก.
- Phase 4: IN PROGRESS
  - Goal: เพิ่ม safety gates, operator semantics, clearer failure markers, และ regression net โดยไม่แตะ TikTok/Facebook extraction behavior.

## Execution Status Update

Timestamp: 2026-03-22 23:48 +0700

- Phase 4: DONE
  - Commit: `51841ab`
  - Result: เพิ่ม `Visible verification [proof]` และ `Submit gate [gating]` markers, restore `posting` phase callback, classify compose failures ตาม layer (`selector/login`, `insertion`, `proof`, `gating`), และเพิ่ม regression tests สำหรับ operator semantics.
- Hard Gate: DONE
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm run test` ✅ (115/115)