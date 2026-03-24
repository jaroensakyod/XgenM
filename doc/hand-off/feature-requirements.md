# XgenM Additional Feature Requirements

- Source: hand-off from คุณนนท์
- Date copied: 2026-03-24

## 1. Requirement ต้นฉบับ

1. โพสหลายๆอัน และมีตั้งเวลา
2. ในช่วงเวลาที่ไม่ได้โพส ให้ไปกดตรง https://x.com/i/jf/creators/inspiration/top_posts แล้วไปไล่ดู ไล่กดใจ ไล่ รีทวิต
3. สุ่มเวลากด quote เพื่อให้โพส ตามหัวข้อ เหมือนคนโพส

## 2. Engineering Interpretation

### Requirement A: Multi-post + schedule

ความหมายเชิงระบบ:

- ต้องมี queue ของโพสต์มากกว่า 1 งาน
- แต่ละงานต้องมีเวลาที่จะเริ่มทำงาน
- background ต้องปลุกงานตามเวลาได้ แม้ service worker จะ sleep ไปแล้ว
- ระบบต้องกันงานชนกันเอง และรู้ว่ากำลัง run job ไหนอยู่

องค์ประกอบขั้นต่ำ:

- schedule model
- queue persistence
- alarm orchestration
- retry / resume model
- operator-visible status

### Requirement B: Idle engagement

ความหมายเชิงระบบ:

- เมื่อไม่มี scheduled post ที่ต้องยิง ระบบมีอีกชนิดของงานคือ idle engagement
- งานนี้ต้องเปิดหน้า inspiration, หา post cards, ตัดสินใจ action, execute, แล้ว cool down
- ควรมี stop conditions เช่น run budget, action budget, time window, หรือ manual cancel

องค์ประกอบขั้นต่ำ:

- inspiration page targeting
- card discovery
- action executor
- cooldown/random delay policy
- logs และ evidence per action

### Requirement C: Topic-driven quote flow

ความหมายเชิงระบบ:

- ต้องมี quote-specific workflow ไม่ใช่ reuse normal posting แบบตรงๆ
- ต้องรู้ว่า source post ไหนจะ quote
- ต้องมีข้อความตาม topic หรือ template ที่ใช้กับ quote
- ต้องมี scheduling/randomization ที่ config ได้

องค์ประกอบขั้นต่ำ:

- quote candidate discovery
- quote compose action
- topic config / template source
- quote-specific composer verification

## 3. Assumptions ที่เอกสารนี้ใช้

- ระบบยังคงเป็น local-first Chrome extension
- ยังไม่เพิ่ม backend/server
- งานใหม่ทั้งหมดต้อง reuse orchestration กลางของ XgenM ให้มากที่สุด
- ทุก flow ใหม่ต้องมี draft-like safety mode หรืออย่างน้อย reviewable logging

## 4. Open Questions สำหรับคนรับงานต่อ

คำถามเหล่านี้ยังไม่มีคำตอบชัดจาก requirement ต้นฉบับ แต่ต้องตอบก่อน implement จริง:

1. schedule ระดับนาทีพอไหม หรืออยากได้ cron-like flexibility
2. multi-post มาจาก input แบบไหน: manual queue, import list, หรือ generated drafts
3. idle engagement ต้องทำ action อะไรได้บ้างแน่: view, like, repost, quote, follow
4. action budget ต่อชั่วโมง/วันต้องมีเพดานเท่าไร
5. quote “ตามหัวข้อ” จะดึงหัวข้อจากไหน
6. ต้องมี review mode ก่อน execute engagement/quote หรือไม่
7. ถ้า X login หลุด, DOM เปลี่ยน, หรือ rate-limited จะให้ behavior เป็นอย่างไร

## 5. Scope Recommendation

แนะนำให้ตี requirement เป็น 3 epic แยก:

1. Scheduling & Queue Foundation
2. Idle Engagement Engine
3. Topic-Driven Quote Engine

อย่ารวมทั้ง 3 เรื่องไว้ใน PR เดียว

## 6. Acceptance Direction แบบคร่าวๆ

### Epic 1: Scheduling & Queue

- ผู้ใช้สร้างงานหลายรายการได้
- แต่ละงานมีเวลาที่กำหนดได้
- background ปลุกงานตามเวลาได้จริง
- งานไม่ชนกัน
- state recover ได้หลัง service worker sleep/wake

### Epic 2: Idle Engagement

- ระบบเข้า inspiration page ได้
- สแกน post candidates ได้
- ทำ action ที่กำหนดได้อย่างมี log
- มี cooldown/random delay ที่ config ได้
- หยุดได้เมื่อถึง budget หรือเมื่อมี scheduled post รออยู่

### Epic 3: Quote Engine

- ระบบหา quote target ได้
- เปิด quote composer ได้ถูก surface
- เติมข้อความตาม topic/template ได้
- verify ได้ว่าข้อความเข้า quote composer จริง
- schedule/random window ทำงานได้ตาม config