# Jarvis React Firebase

New standalone Jarvis project.

## Stack

- Next.js + React for desktop and mobile web
- Claude API on server routes
- Firebase Admin + Firestore for Jarvis knowledge
- Optional MMS-TTS Thai server for `facebook/mms-tts-tha`
- Ready for GitHub and Vercel

## Local Setup

อ่านแบบจับมือทำได้ที่ `SETUP.md`

1. Copy `.env.example` to `.env.local`.
2. Add your Claude API key in `ANTHROPIC_API_KEY`.
3. Add Firebase Admin credentials using `FIREBASE_SERVICE_ACCOUNT_JSON` or the separate Firebase env vars.
4. Run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Firestore Data

Jarvis stores knowledge documents in the `jarvis_knowledge` collection:

- `title`
- `content`
- `tags`
- `searchTerms`
- `createdAt`
- `updatedAt`

When chatting, Jarvis searches `searchTerms` and includes relevant records as context before asking Claude.

## Vercel Environment Variables

Set these in Vercel Project Settings:

- `ANTHROPIC_API_KEY`
- `CLAUDE_MODEL`
- `GEMINI_API_KEY`
- `GEMINI_TTS_MODEL`
- `GEMINI_TTS_VOICE`
- `MMS_TTS_URL`
- `MMS_TTS_MODEL`
- `MMS_TTS_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

Do not commit `.env.local` or service account JSON files.

## MMS-TTS Thai

The `MMS-TTS Thai` option needs a separate Python server because `facebook/mms-tts-tha` is a Transformers model, not a hosted TTS API by itself. See `mms-tts-server/README.md`, deploy that service, then set:

```env
MMS_TTS_URL=https://your-mms-server.example/synthesize
MMS_TTS_MODEL=facebook/mms-tts-tha
```
