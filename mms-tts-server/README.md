# Jarvis MMS-TTS Thai Server

This small FastAPI service runs `facebook/mms-tts-tha` and returns WAV audio for Jarvis.

## Run Locally

```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 7860
```

On this Windows workspace, use:

```bat
run-local.cmd
```

Stop the local server:

```bat
stop-local.cmd
```

Test:

```bash
curl -X POST http://localhost:7860/synthesize \
  -H "Content-Type: application/json" \
  -d "{\"input\":\"สวัสดีครับ ผอ.\"}" \
  --output test.wav
```

Then set this in the Next.js app:

```env
MMS_TTS_URL=http://localhost:7860/synthesize
```

## Deploy

Use a Python/Docker host such as Hugging Face Spaces, Render, Railway, or your own server.

For Hugging Face Spaces:

1. Create a new Space.
2. Choose Docker.
3. Upload the files from this folder.
4. After it starts, set Vercel env:

```env
MMS_TTS_URL=https://your-space-name.hf.space/synthesize
MMS_TTS_MODEL=facebook/mms-tts-tha
```

Optional protection:

```env
MMS_TTS_API_KEY=your_private_endpoint_key
```

Set the same `MMS_TTS_API_KEY` in both the MMS server and Vercel.
