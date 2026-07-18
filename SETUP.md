# คู่มือเริ่มต้น Jarvis

โปรเจกต์นี้อยู่บน GitHub แล้ว:

https://github.com/disomanceo/javis

Firebase project:

https://console.firebase.google.com/u/0/project/pm-javis/overview

## 1. เปิด Firestore

1. เข้า Firebase Console ของโปรเจกต์ `pm-javis`
2. ไปที่ Build > Firestore Database
3. กด Create database
4. เลือก Production mode ได้
5. เลือก region ที่ใกล้ผู้ใช้ เช่น asia-southeast1 ถ้ามีให้เลือก
6. สร้าง database ให้เสร็จ

โค้ดฝั่ง server ใช้ Firebase Admin SDK ดังนั้น rules ของ client ไม่ได้เป็นตัวหลักในเฟสนี้ แต่ยังควรเก็บ rules ให้รัดกุมไว้ก่อน

## 2. สร้าง Service Account สำหรับ Server

1. ใน Firebase Console ไปที่ Project settings
2. เปิดแท็บ Service accounts
3. เลือก Node.js
4. กด Generate new private key
5. ดาวน์โหลดไฟล์ JSON
6. อย่า commit ไฟล์ JSON นี้ขึ้น GitHub

## 3. ตั้งค่า local env

สร้างไฟล์ `.env.local` ในโฟลเดอร์โปรเจกต์ แล้วใส่:

```env
ANTHROPIC_API_KEY=ใส่ Claude API key ใหม่ที่ rotate แล้ว
CLAUDE_MODEL=claude-sonnet-4-5
FIREBASE_SERVICE_ACCOUNT_JSON=วาง JSON service account เป็นบรรทัดเดียว
```

วิธีทำ JSON เป็นบรรทัดเดียว:

1. เปิดไฟล์ service account JSON
2. copy ทั้งไฟล์
3. ใช้เครื่องมือ stringify JSON หรือวางให้เป็น JSON บรรทัดเดียว
4. ค่า `private_key` ต้องมี `\n` อยู่ใน string

ถ้าไม่สะดวกใช้ JSON บรรทัดเดียว ให้ใช้แบบแยก:

```env
ANTHROPIC_API_KEY=ใส่ Claude API key ใหม่ที่ rotate แล้ว
CLAUDE_MODEL=claude-sonnet-4-5
FIREBASE_PROJECT_ID=pm-javis
FIREBASE_CLIENT_EMAIL=client_email จาก service account
FIREBASE_PRIVATE_KEY="private_key จาก service account"
```

## 4. รันในเครื่อง

```bash
npm install
npm run dev
```

เปิด:

http://localhost:3000

ลองเพิ่มข้อมูลในกล่อง "ฐานข้อมูลความรู้" ก่อน จากนั้นถาม Jarvis ด้วยคำที่เกี่ยวข้องกับข้อมูลนั้น

## 5. Deploy ไป Vercel

1. เข้า Vercel Dashboard
2. กด Add New > Project
3. Import Git Repository
4. เลือก `disomanceo/javis`
5. Framework ควร detect เป็น Next.js
6. เปิด Environment Variables แล้วเพิ่ม:
   - `ANTHROPIC_API_KEY`
   - `CLAUDE_MODEL`
   - `GEMINI_TTS_MODEL`
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
7. กด Deploy

## 6. หมายเหตุเรื่องความปลอดภัย

Claude API key ที่เคยส่งในแชตควร rotate ใหม่ก่อนใช้จริง เพราะถือว่าเคยถูกเปิดเผยแล้ว

ห้าม commit ไฟล์เหล่านี้:

- `.env.local`
- ไฟล์ service account JSON
- private key ใด ๆ
