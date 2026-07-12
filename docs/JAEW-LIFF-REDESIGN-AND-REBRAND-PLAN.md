# อีแจ๋ว LIFF Redesign and Rebrand Plan

## 1. เป้าหมาย

ปรับประสบการณ์จาก `โฮชิ` เป็น `อีแจ๋ว` โดยให้ LINE เป็นช่องทางสั่งงานหลัก และ LIFF เป็นพื้นที่ตรวจสอบ จัดการ และตั้งค่าที่เปิดแล้วเข้าใจได้ทันที

ปัญหาหลักของหน้าปัจจุบัน:

- ข้อมูล 9 หมวดถูกยกขึ้นเป็นเมนูระดับเดียวกัน จึงแน่นและเลือกยากบนมือถือ
- หน้าแรกพยายามสรุปทุกระบบพร้อมกัน ทำให้สิ่งที่ต้องทำตอนนี้ไม่เด่น
- bottom navigation มี 5 จุด แต่ `เพิ่มเติม` ซ่อนอีก 5 หมวดไว้ในชั้นที่สอง
- hero และ metric cards ใช้พื้นที่เหนือ fold มาก ขณะที่ข้อมูลสำคัญยังอยู่ด้านล่าง
- หน้าทั้งหมดอยู่ใน `Dashboard.tsx` ไฟล์เดียว ทำให้ปรับ IA, lazy loading และทดสอบแต่ละส่วนยาก
- ชื่อแบรนด์ สี ข้อความ และ persona กระจายหลายไฟล์ ยังไม่มี brand token กลาง

## 2. Brand Direction

### ชื่อและบุคลิก

- ชื่อทางการ: **อีแจ๋ว**
- ชื่อเรียกสั้นใน UI: **แจ๋ว**
- English descriptor: **Personal LINE AI Secretary**
- Brand promise: **เรื่องจุกจิก ให้แจ๋วจัดการ**
- Persona: เลขาส่วนตัวหญิงไทย ฉลาด คล่องงาน จำรายละเอียดดี พูดตรง สุภาพแบบเป็นกันเอง ไม่ประจบ ไม่ทำเกินคำสั่ง
- สรรพนาม: เรียกตัวเองว่า `แจ๋ว`; ใช้ `ค่ะ` เท่าที่เป็นธรรมชาติ ไม่ลงท้ายทุกประโยค
- ห้ามใช้ภาพจำแม่บ้าน คนรับใช้ หรือการแต่งกายเชิงชนชั้น ชื่อ “อีแจ๋ว” ต้องถูกตีความใหม่เป็นผู้ช่วยมืออาชีพที่มีไหวพริบ

### Visual language

- Mood: Thai contemporary, lively, capable, calm under pressure
- Base: warm off-white, charcoal, soft jade green
- Accent: coral-red เล็กน้อยสำหรับการเตือนและจุดสนใจ
- งด: AI purple, neon glow, glassmorphism หนัก, gradient text, card ซ้อน card
- รูปทรง: card radius 16px, action/button แบบ pill เฉพาะจุด, เส้น 1px แทน shadow หนัก
- Icon: ใช้ `@phosphor-icons/react` ต่อให้เป็นระบบเดียว
- Typography: โหลดฟอนต์ไทยจริงด้วย `next/font`; ตัวเลือกแรก `Noto Sans Thai` หรือ `IBM Plex Sans Thai`; ตัวเลขใช้ Geist Mono ได้
- Accessibility: body text อย่างน้อย 14px, touch target อย่างน้อย 44x44px, WCAG AA, รองรับ reduced motion

### Design dials

- Design variance: 5/10
- Motion intensity: 3/10
- Visual density: 4/10

ใช้ motion เฉพาะ feedback, loading, sheet transition และ state change ไม่ใช้ decorative loop

## 3. Information Architecture ใหม่

ลดจาก 9 top-level destinations เหลือ 4 destinations หลัก:

| Destination | หน้าที่ | รวมข้อมูลเดิม |
|---|---|---|
| `วันนี้` | สิ่งที่ต้องรู้และทำตอนนี้ | overview, urgent tasks, next event, due reminder, one recommendation |
| `งาน` | สิ่งที่ต้องลงมือและติดตาม | tasks, follow-ups, reminders, goals, commitments, decisions |
| `ชีวิต` | เวลา เงิน คน และเอกสารอ้างอิง | calendar, meetings, finance, people, travel, documents |
| `แจ๋ว` | ความจำและการควบคุมผู้ช่วย | memory, knowledge, corrections, operating rhythm, settings, integrations, privacy |

Bottom navigation ใช้ 4 รายการเท่านั้น: `วันนี้`, `งาน`, `ชีวิต`, `แจ๋ว`

ไม่ใช้ปุ่ม `เพิ่มเติม` ใน bottom bar. หน้าย่อยภายใน `งาน`, `ชีวิต`, `แจ๋ว` ใช้ segmented tabs หรือรายการ grouped rows และจำ tab ล่าสุดของผู้ใช้

## 4. Screen Plan

### 4.1 วันนี้

ลำดับจากบนลงล่าง:

1. Compact header: avatar แจ๋ว, คำทักตามเวลา, refresh/status icon
2. `สิ่งถัดไป`: การ์ดเด่นเพียงใบเดียว แสดงงานหรือนัดที่สำคัญที่สุด พร้อมเหตุผลและ CTA
3. Quick capture: `พิมพ์หาแจ๋วใน LINE` และ shortcuts `จด`, `เตือน`, `เพิ่มงาน`
4. Timeline วันนี้: นัด งานครบกำหนด และ reminder เรียงตามเวลาใน list เดียว
5. Waiting on: สิ่งที่รอคนอื่นตอบ สูงสุด 3 รายการ
6. Daily pulse: เงินเดือนนี้และความคืบหน้าเป้าหมายเป็น compact rows ไม่ใช้ 3 metric cards ขนาดใหญ่

หลักการ: ข้อมูลเหนือ fold ต้องตอบได้ภายใน 5 วินาทีว่า “ต่อไปทำอะไร”

### 4.2 งาน

- Segments: `ต้องทำ`, `รอตอบ`, `แผน`
- `ต้องทำ`: unified list ของ todos + reminders; group `วันนี้`, `ถัดไป`, `ภายหลัง`
- `รอตอบ`: follow-ups + commitments
- `แผน`: goals + weekly plans + decisions
- Floating action button เดียว: `เพิ่ม` เปิด bottom sheet ให้เลือกประเภท
- ใช้ swipe/overflow actions อย่างระวัง และยังมีปุ่มที่เข้าถึงได้สำหรับ complete/edit/delete

### 4.3 ชีวิต

- แสดง grouped launcher 4 แถว: `เวลาและประชุม`, `เงิน`, `คน`, `เอกสารและเดินทาง`
- ส่วนบนมี next event และ monthly spend แบบ compact summary
- เปิดรายละเอียดด้วย subview พร้อม back button; ไม่เพิ่มทุก feature ลงหน้าเดียว
- URL/hash ต้องสะท้อน subview เพื่อ back navigation ทำงานถูกต้อง

### 4.4 แจ๋ว

- Hero ขนาดเล็กพร้อม avatar และสถานะ “แจ๋วรู้อะไรเกี่ยวกับคุณ”
- Sections: `ความจำ`, `สิ่งที่รู้จักคุณ`, `การเรียนรู้จากคำแก้`, `กิจวัตร`, `ตั้งค่าและความเป็นส่วนตัว`
- แสดงจำนวนรายการและคำอธิบายสั้น ใช้ disclosure/subview แทนการ render ทุก record พร้อมกัน
- การลบข้อมูล, disconnect และ privacy actions ต้องมี confirmation และ recovery state

## 5. Component and Data Architecture

เป้าหมายโครงสร้าง:

```text
src/app/liff/
  Dashboard.tsx                 # shell + destination state only
  components/
    AppHeader.tsx
    BottomNav.tsx
    SectionHeader.tsx
    EmptyState.tsx
    StatusBanner.tsx
    BottomSheet.tsx
  screens/
    TodayScreen.tsx
    WorkScreen.tsx
    LifeScreen.tsx
    JaewScreen.tsx
  hooks/
    useDashboardResource.ts
    useLiffNavigation.ts
  brand.ts                      # name, tagline, semantic copy
```

Implementation rules:

- แยก shell ออกจาก screen ก่อนเปลี่ยน visual เพื่อจำกัด regression
- โหลดข้อมูลของ `วันนี้` ก่อน; resource ของ destination อื่นโหลดเมื่อเปิดหรือ prefetch หลัง idle
- ห้ามยิง dashboard API ทั้งหมดพร้อมกันตั้งแต่ first paint
- ใช้ semantic design tokens ใน `globals.css`: surface, text, muted, border, accent, danger
- loading skeleton ต้องตรงกับ layout จริง
- empty/error/offline/unauthorized states ต้องคงอยู่ครบ
- รองรับ widths 320, 375, 390, 430px และ desktop
- LIFF top header ต้องเผื่อ safe-area ด้านบน; bottom nav เผื่อ `safe-area-inset-bottom`

## 6. Rebrand Scope: Hoshi to อีแจ๋ว

### เปลี่ยนทันทีใน runtime

- `src/lib/agent/prompts.ts`: identity, gender, pronouns, response style
- `src/lib/briefing/index.ts`, `src/lib/meeting/prep.ts`, `src/lib/reflect/weekly.ts`: system prompts
- `src/lib/agent/handle.ts`, `src/lib/flex/builder.ts`: user-facing replies and help
- `src/app/api/line/route.ts`: dashboard copy and command aliases
- `src/app/liff/LiffApp.tsx`, `src/app/liff/Dashboard.tsx`, `src/app/page.tsx`, `src/app/layout.tsx`: UI and metadata
- `scripts/deploy-rich-menu.ts`: name, chat bar label, areas, action text
- eval fixtures: เพิ่มคำว่า `แจ๋ว`, `อีแจ๋ว`; คง `โฮชิ` เป็น legacy invocation ชั่วคราวเพื่อไม่ให้คำสั่งเดิมพัง

### ไม่ rename ในรอบแรก

- migration history ที่ applied แล้ว
- evidence และ historical reports
- internal IDs หรือ table names ที่ไม่มีคำว่า Hoshi

### Rename เอกสารแบบควบคุม

- สร้างเอกสาร current-state ใหม่ภายใต้ชื่อ `JAEW-*`
- เอกสาร `HOSHI-*` เก่าคงไว้เป็น historical record พร้อม banner ว่า superseded
- ห้าม bulk replace โดยไม่ตรวจ persona เพราะ Hoshi เดิมเป็นผู้ชายและใช้ `ผม/ครับ`

## 7. LINE Rich Menu ใหม่

ลดจาก grid 4x2 จำนวน 8 ปุ่ม เป็น grid 3x2 จำนวน 6 ปุ่ม เพื่อเพิ่มพื้นที่แตะและลด cognitive load:

| ตำแหน่ง | Label | Action |
|---|---|---|
| บนซ้าย | `คุยกับแจ๋ว` | message: `แจ๋วช่วยอะไรได้บ้าง` |
| บนกลาง | `เพิ่มงาน` | message: `เพิ่มงาน ` |
| บนขวา | `เตือนฉัน` | message: `เตือนฉัน ` |
| ล่างซ้าย | `วันนี้` | message: `สรุปวันนี้` |
| ล่างกลาง | `ปฏิทิน` | message: `ปฏิทินสัปดาห์นี้` |
| ล่างขวา | `เปิดอีแจ๋ว` | LIFF URI |

Technical target:

- Canvas: 2500 x 1686 px, PNG, sRGB, under LINE upload size limit
- Grid: 3 columns x 2 rows
- Bounds: widths `833, 834, 833`; height `843` each row
- ห้ามวางรายละเอียดสำคัญชิดขอบ cell; safe padding อย่างน้อย 80px
- ปุ่ม LIFF ต้องเด่นกว่าปุ่มอื่นเล็กน้อย แต่ไม่เปลี่ยนเป็นคนละ visual system

## 8. Prompt: LINE Rich Menu พร้อมข้อความ

ใช้ prompt นี้ใน ChatGPT image generation และแนบ reference avatar เมื่อมี:

```text
Create a production-ready LINE Official Account rich menu image for a Thai personal AI secretary named “อีแจ๋ว”. Exact canvas size 2500 x 1686 pixels, horizontal landscape, flat front-facing artwork only, no phone mockup, no perspective, no outer margin.

Divide the canvas into an exact 3-column by 2-row grid with six equally perceived touch areas. Use subtle separators, not floating cards. Keep all important artwork at least 80 px away from every cell edge.

Brand character: “แจ๋ว” is a clever, capable, contemporary Thai female personal secretary, warm and quick-witted, professional rather than servile. Visual style: modern Thai editorial illustration, clean vector-like forms, warm off-white background, charcoal typography, soft jade green as the main accent, restrained coral-red details. No purple, no neon, no glossy 3D, no heavy gradients, no glassmorphism, no maid costume, no domestic-worker stereotype.

Place one simple consistent line icon in each cell and render these Thai labels exactly, large and highly legible:
Top left: “คุยกับแจ๋ว” with a chat icon
Top center: “เพิ่มงาน” with a checklist-plus icon
Top right: “เตือนฉัน” with a bell icon
Bottom left: “วันนี้” with a sunrise or sparkle icon
Bottom center: “ปฏิทิน” with a calendar icon
Bottom right: “เปิดอีแจ๋ว” with the แจ๋ว avatar or doorway icon

Make “เปิดอีแจ๋ว” subtly more prominent using a jade fill, while keeping the whole menu cohesive. Large Thai text, excellent contrast, generous whitespace, instantly scannable on a small phone. Do not add any text beyond the six exact labels. Do not add logos, watermarks, English words, decorative microtext, fake UI, or a mockup. Output one clean final image only.
```

หมายเหตุ: image model มักสะกดภาษาไทยผิด. หากตัวอักษรไม่ตรง ให้ใช้ prompt แบบไม่มีข้อความด้านล่าง แล้วนำภาพกลับมาเพื่อวางข้อความจริงด้วย code/image tooling ก่อน deploy

## 9. Prompt: LINE Rich Menu แบบไม่มีข้อความ

```text
Create a production-ready background artwork for a LINE Official Account rich menu for a Thai personal AI secretary named “อีแจ๋ว”. Exact canvas 2500 x 1686 pixels, landscape, flat front-facing image only, no mockup, no perspective, no outer margin.

Build an exact 3-column by 2-row grid with six clear touch zones. Use a modern Thai editorial vector style: warm off-white base, charcoal details, soft jade green main accent, tiny restrained coral-red accents, subtle paper texture, clean consistent line icons. No text or letters of any kind.

Cell concepts, left to right:
Top row: friendly conversation, add a task, set a reminder.
Bottom row: today overview, calendar, open the อีแจ๋ว dashboard.

The bottom-right cell should be slightly more prominent with a jade background and contain a small portrait medallion of แจ๋ว, a clever contemporary Thai female secretary. She must look professional, confident, warm and quick-witted; never a maid, servant, housekeeper, or traditional costume caricature.

Use subtle separators rather than floating cards. Keep the central lower area of every cell visually calm so Thai labels can be overlaid later. Maintain at least 80 px safe padding from cell edges. No text, no alphabet characters, no numbers, no watermark, no logo, no phone frame, no fake interface. Output one clean final image only.
```

## 10. Prompt: Avatar ของแจ๋ว

```text
Create a distinctive square avatar portrait for “แจ๋ว”, a Thai female personal AI secretary inside LINE. 1:1 composition, 1024 x 1024 pixels, designed to remain recognizable when cropped into a small circular profile picture.

Character: Thai woman in her late 20s to mid 30s, intelligent, observant, quick-witted, composed, approachable, and clearly capable. Contemporary professional styling with a simple jade-green structured jacket or blouse, subtle coral-red accent, neat modern hair, confident friendly expression, direct eye contact. Include one memorable but restrained signature detail, such as a small jade hair clip shaped like a check mark or a minimal red notebook pin.

Art direction: premium modern Thai editorial illustration, simplified clean shapes, expressive face, subtle tactile paper texture, crisp silhouette, warm off-white circular background with a soft jade halo. Mostly head and shoulders. High contrast around the face. Balanced asymmetry. Friendly but not childish.

Avoid every maid, servant, housekeeper, school-uniform, flight-attendant, anime, chibi, royal-Thai-costume, vintage pin-up, cyberpunk, robot, hologram, purple AI glow, headset call-center, sexualized, or photoreal stock-photo stereotype. No text, no letters, no logo, no watermark, no hands holding objects, no busy background. Output one final avatar only.
```

### Optional avatar variations

หากต้องการเลือกหลายแบบ ให้ generate แยกทีละภาพโดยเปลี่ยนเพียงบรรทัด art direction:

1. `Bold flat vector portrait with screen-print texture and a strong graphic silhouette.`
2. `Soft editorial gouache portrait with restrained grain and modern magazine character design.`
3. `Minimal geometric mascot portrait, human and sophisticated, optimized for a 48 px circular avatar.`

## 11. Implementation Phases

### Phase A: Brand foundation

- สรุป avatar และ Rich Menu artwork จากภาพที่ผู้ใช้นำกลับมา
- เพิ่ม brand constants, semantic tokens, Thai font และ image assets
- เปลี่ยน runtime identity และเพิ่ม legacy alias `โฮชิ`
- เพิ่ม tests สำหรับ persona, invocation aliases และ user-facing brand strings

### Phase B: Structural extraction

- แยก shared components และ 4 screens ออกจาก monolithic `Dashboard.tsx`
- คง behavior เดิมก่อนเปลี่ยน visual
- เพิ่ม per-screen error boundary/loading state และ destination-aware data fetching

### Phase C: Navigation and Today

- เปลี่ยน bottom nav เป็น 4 destinations
- สร้างหน้า `วันนี้` ตาม priority-first hierarchy
- ตัด hero ใหญ่และ metric-card stack
- ตรวจ back/hash behavior และ safe areas

### Phase D: Work, Life, Jaew

- รวม feature เดิมเข้ากลุ่มใหม่โดยไม่ลบ capability
- ใช้ subviews/segments แทนการแสดงทุกอย่างพร้อมกัน
- ตรวจ CRUD, confirmation, retry, undo และ privacy flows

### Phase E: LINE surface

- ปรับ `deploy-rich-menu.ts` เป็น 3x2 และใช้ bounds ที่รวมได้ 2500px พอดี
- deploy ไป test user ก่อนตั้ง default
- ตรวจข้อความ action, LIFF URI และพื้นที่แตะบนอุปกรณ์จริง

### Phase F: Verification

- `npm run lint`
- `npm test`
- `npm run clean && npm run build`
- `npm run audit:wcag` บน authenticated deployment
- physical LIFF: iOS/Android ที่ 375, 390, 430px
- ทดสอบ owner workflows: เพิ่มงาน, ตั้งเตือน, ดูวันนี้, เปิดนัด, ดูเงิน, แก้ความจำ, export/privacy

## 12. Acceptance Criteria

- bottom navigation มี 4 จุดหมาย ไม่มี `เพิ่มเติม`
- ผู้ใช้เห็น next action และ timeline วันนี้เหนือ fold ที่ 375x667px
- ไม่มี feature เดิมสูญหาย; ทุก feature อยู่ไม่เกิน 2 taps จาก destination หลัก
- first paint ไม่ยิง API ทั้ง 19 รายการพร้อมกัน
- ไม่มี visible `โฮชิ/Hoshi` ใน runtime ยกเว้น legacy help/migration note ที่ตั้งใจไว้
- persona ใช้ชื่อและสรรพนามสอดคล้องกันทั้ง LINE, Flex, briefing, LIFF และ metadata
- Rich Menu มี 6 touch areas ตรงกับ action bounds จริง
- avatar อ่านออกที่ 48px และไม่สร้างภาพจำแม่บ้าน/คนรับใช้
- authenticated WCAG และ physical-device gates ผ่านก่อนตั้ง Rich Menu เป็น default

## 13. Asset Handoff

เมื่อสร้างภาพเสร็จ ให้นำกลับมาอย่างน้อย 2 ไฟล์:

- Rich Menu PNG ต้นฉบับ 2500x1686 (ควรใช้เวอร์ชันไม่มีข้อความถ้าภาษาไทยผิด)
- Avatar PNG 1024x1024

จากนั้นจะทำต่อได้: ตรวจภาพ, crop/overlay Thai labels, optimize ขนาด, map exact LINE areas, ใส่ assets ใน repo และ implement Phase A-F
