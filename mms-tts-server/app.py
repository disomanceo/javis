import io
import os
from typing import Optional

import numpy as np
import torch
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from scipy.io import wavfile
from transformers import AutoTokenizer, VitsModel


MODEL_ID = os.getenv("MMS_TTS_MODEL", "facebook/mms-tts-tha")
ENDPOINT_API_KEY = os.getenv("MMS_TTS_API_KEY")
MAX_TEXT_LENGTH = int(os.getenv("MMS_TTS_MAX_TEXT_LENGTH", "600"))

app = FastAPI(title="Jarvis MMS-TTS Thai")
tokenizer: Optional[AutoTokenizer] = None
model: Optional[VitsModel] = None


class SynthesisRequest(BaseModel):
  input: Optional[str] = None
  text: Optional[str] = None
  model: Optional[str] = None
  voice: Optional[str] = None
  language: Optional[str] = None
  response_format: Optional[str] = "wav"


def require_api_key(authorization: Optional[str]) -> None:
  if not ENDPOINT_API_KEY:
    return

  expected = f"Bearer {ENDPOINT_API_KEY}"
  if authorization != expected:
    raise HTTPException(status_code=401, detail="Invalid MMS-TTS API key.")


def get_model():
  global tokenizer, model
  if tokenizer is None or model is None:
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = VitsModel.from_pretrained(MODEL_ID)
    model.eval()
  return tokenizer, model


@app.get("/")
def health():
  return {"ok": True, "model": MODEL_ID}


@app.post("/synthesize")
def synthesize(payload: SynthesisRequest, authorization: Optional[str] = Header(default=None)):
  require_api_key(authorization)

  text = (payload.input or payload.text or "").strip()
  if not text:
    raise HTTPException(status_code=400, detail="Missing text.")
  if len(text) > MAX_TEXT_LENGTH:
    text = text[:MAX_TEXT_LENGTH]

  active_tokenizer, active_model = get_model()
  inputs = active_tokenizer(text, return_tensors="pt")

  with torch.no_grad():
    output = active_model(**inputs).waveform

  waveform = output.squeeze().cpu().numpy().astype(np.float32)
  waveform = np.clip(waveform, -1.0, 1.0)

  audio = io.BytesIO()
  wavfile.write(audio, rate=active_model.config.sampling_rate, data=waveform)
  audio.seek(0)

  return StreamingResponse(audio, media_type="audio/wav")
