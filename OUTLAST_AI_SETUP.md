# OUTLAST AI setup

The AI integration uses the OpenAI Responses API from the OUTLAST server. The API key must stay in the server environment and must never be placed in index.html or browser storage.

Set these environment variables on the OUTLAST Render web service:
- OPENAI_API_KEY: the project API key created for OUTLAST AI.
- OUTLAST_AI_OWNER_TOKEN: a long random secret used only for private Developer Mode. Keep it private; the game asks for it when Developer Mode is opened.
- OUTLAST_AI_MODEL (optional): defaults to gpt-5.4-mini.

Player Mode is available to all players. Developer Mode and the proposal queue require the owner token. The server rate-limits chat, limits conversation size, and sends store:false to the Responses API. Chat transcripts are not persisted by OUTLAST.

Developer Mode is advisory only. It can save proposals to data/ai-proposals.json and the owner can approve them for development or decline them. Approval does not edit source code or deploy a release; implementation and testing remain a separate step.

The Render service must have a persistent disk mounted at OUTLAST_DATA_DIR for proposals to survive restarts. If no persistent disk is configured, proposals use the server data directory and may be lost on service replacement.
