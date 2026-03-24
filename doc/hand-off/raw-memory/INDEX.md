# Raw Memory Index

- Purpose: raw reference pack สำหรับคนรับงานต่อ ให้ค้นและเปิด memory ต้นฉบับที่เกี่ยวข้องได้จากใน `doc/hand-off` โดยไม่ต้องออกไปค้นใน `ψ/memory` เอง
- Selection rule: คัดเฉพาะไฟล์ที่ช่วยเรื่อง architecture, browser-truth, state-machine discipline, และ pattern ของ extension automation ที่นำไป reuse ได้กับ XgenM

## Learnings

- [learnings/2026-01-18_strict-workflow-dom-automation.md](learnings/2026-01-18_strict-workflow-dom-automation.md)
  - บทเรียนระดับกฎเหล็กสำหรับ DOM automation
  - ใช้ตอนออกแบบ flow ที่ต้องแตะ complex web app, tab switching, หรือ state-machine UI

## XgenM

- [XgenM/2026-03-21_22-35_xgenm-map-deep-dive.md](XgenM/2026-03-21_22-35_xgenm-map-deep-dive.md)
  - grounding snapshot ของระบบทั้งก้อน
  - ใช้เพื่อเข้าใจ philosophy, runtime flow, และ risk หลักของ XgenM

- [XgenM/2026-03-22_22-49_xgenm-submit-truth-refactor-plan.md](XgenM/2026-03-22_22-49_xgenm-submit-truth-refactor-plan.md)
  - แผน refactor สำคัญที่ทำให้ background authority และ evidence contract ชัดเจน
  - ใช้ตอนต้องต่อยอด state machine หรือออกแบบ job kinds ใหม่

- [XgenM/2026-03-23_21-48_xgenm-xafi-parity-v2-plan.md](XgenM/2026-03-23_21-48_xgenm-xafi-parity-v2-plan.md)
  - root-cause และแผนแก้ปัญหา X composer insertion จาก browser truth จริง
  - ใช้ตอนแตะ quote flow, compose flow, หรือ selector/typing behavior ใหม่

- [XgenM/2026-03-23_23-00_xgenm-auto-post-proof-softening-done.md](XgenM/2026-03-23_23-00_xgenm-auto-post-proof-softening-done.md)
  - snapshot สรุปการทำ semantic proof ให้แคบและปลอดภัยขึ้น
  - ใช้ตอนต้องออกแบบ matching logic ที่ไม่ strict เกินไปแต่ยังไม่หลวมเกินไป

## Xafi

- [Xafi/2026-03-20_09-06_xafi-gemini-truth-first-test-harness-plan.md](Xafi/2026-03-20_09-06_xafi-gemini-truth-first-test-harness-plan.md)
  - วิธีคิดเรื่อง truth-first harness และการแยก local hard gate ออกจาก browser validation
  - useful มากสำหรับงาน browser-heavy ที่ test ผ่านแต่ runtime อาจยัง fail

- [Xafi/2026-03-20_11-17_xafi-v2-phase34-hard-gate-browser-truth.md](Xafi/2026-03-20_11-17_xafi-v2-phase34-hard-gate-browser-truth.md)
  - ตัวอย่างชัดเจนของ boundary ระหว่างสิ่งที่พิสูจน์ได้ในเครื่องกับสิ่งที่ต้องพิสูจน์ใน Chrome จริง
  - ใช้เป็นแม่แบบ validation protocol

- [Xafi/2026-03-20_14-05_xafi-gemini-composer-readiness-send-truth-plan.md](Xafi/2026-03-20_14-05_xafi-gemini-composer-readiness-send-truth-plan.md)
  - แนวคิดเรื่อง readiness/send truth ที่นำไป reuse กับ quote/send surfaces ได้
  - useful เวลาคิด auto-post gating ที่ละเอียดกว่าแค่ visible text

## TikTok Shop Automation

- [tiktok-shop-automation/2026-01-12_22-20_deep-dive-automation-flow.md](tiktok-shop-automation/2026-01-12_22-20_deep-dive-automation-flow.md)
  - อธิบาย dual-pipeline, router pattern, และ state isolation ของ extension automation ขนาดใหญ่
  - useful สำหรับออกแบบ `scheduled-post`, `idle-engagement`, `quote-post` ให้ไม่ปนกัน

- [tiktok-shop-automation/2026-01-13_00-00_mission-blueprint-soc-separation.md](tiktok-shop-automation/2026-01-13_00-00_mission-blueprint-soc-separation.md)
  - reference เรื่อง separation of concerns และการแยก pipeline ให้ชัด
  - useful ตอนวาง module boundaries สำหรับ scheduler/engagement/quote

- [tiktok-shop-automation/2026-01-18_09-13_chain-of-failures-postmortem.md](tiktok-shop-automation/2026-01-18_09-13_chain-of-failures-postmortem.md)
  - postmortem ที่ดีมากเรื่อง API assumption, React side-effects, และ patch-loop anti-pattern
  - useful ทุกครั้งที่ต้องแตะ DOM automation บนเว็บ third-party

- [tiktok-shop-automation/2026-01-18_09-23_final-plan-page-reload-strategy.md](tiktok-shop-automation/2026-01-18_09-23_final-plan-page-reload-strategy.md)
  - reference เรื่อง recovery strategy เมื่อ state/UI เปราะและ tab switch เสี่ยงเกินไป
  - useful สำหรับ scheduler resume, inspiration page recovery, และ quote surface normalization

## Search Tip

- ถ้าหาเรื่อง state machine ให้ค้นคำว่า `state`, `router`, `transition`, `proof`, `gating`
- ถ้าหาเรื่อง browser truth ให้ค้นคำว่า `browser-truth`, `hard-gate`, `manual`, `Chrome`
- ถ้าหาเรื่อง DOM fragility ให้ค้นคำว่า `selector`, `reload`, `context dies`, `postmortem`