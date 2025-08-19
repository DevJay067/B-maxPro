# B-maxPro

## Backend setup
1. Copy `backend/.env.example` to `backend/.env` and set `OPENAI_API_KEY`.
2. Install dependencies:
   - System Python: `pip install -r backend/requirements.txt`
3. Run the server:
   - `bash backend/run.sh`

### Endpoints
- POST `/v1/chat` — Chat completions (optionally streamed)
- POST `/v1/embeddings` — Generate embeddings