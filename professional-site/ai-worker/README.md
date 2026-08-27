# Rafal Wilk AI — secure AI backend

This Cloudflare Worker is the server-side backend for the AI agent used by `professional-site/`.
The OpenAI API key is never stored in the browser or committed to GitHub.

## Deploy

```bash
cd professional-site/ai-worker
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

After deployment, copy the Worker URL (for example `https://rafal-wilk-ai-agent.<account>.workers.dev`) into AI settings in the assistant.

## Endpoints

- `GET /health` — health check.
- `POST /chat` — sends the question, recent conversation history, platform catalog and active-module context to the OpenAI Responses API.

The Worker uses `gpt-5.6` with the `web_search` tool by default. Change `OPENAI_MODEL` in `wrangler.toml` if needed.
