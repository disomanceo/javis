@echo off
setlocal
cd /d "%~dp0"
set HF_HOME=%CD%\.hf-cache
set TRANSFORMERS_CACHE=%CD%\.hf-cache\transformers
set HUGGINGFACE_HUB_CACHE=%CD%\.hf-cache\hub
".venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 7860
