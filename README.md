# Claude Code Web

A web-based interface for Claude Code, providing browser-accessible AI-assisted software development with real-time streaming.

## Features

- **Web UI**: Access Claude Code from any browser
- **Real-time Streaming**: WebSocket-based bidirectional communication
- **Session Management**: Create, resume, and manage multiple coding sessions
- **Dual Backend Support**:
  - **SDK Backend**: Direct Anthropic API calls with dual-agent orchestration
  - **CLI Pipe Backend**: Wraps official Claude CLI with full feature support (MCP, hooks, etc.)
- **Tool Execution**: File operations, git commands, bash execution with permission controls
- **JSONL Persistence**: All sessions persisted for resumption

## Quick Start

1. **Configure environment**:
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env: set ANTHROPIC_API_KEY, AUTH_PASSWORD
   # Optionally create .env.local to override values
   ```

2. **Build and start**:
   ```bash
   # Build frontend
   cd frontend && npm install && npm run build && cd ..

   # Build and run backend
   cd backend && npm install && npm run build && node dist/server.js
   ```

3. **Access**: Open http://localhost:3000 (or your configured PORT)

## Configuration

Environment variables in `backend/.env` or `.env.local`:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `AUTH_PASSWORD` | Login password | (required) |
| `ANTHROPIC_API_KEY` | Anthropic API key | (required for SDK backend) |
| `CLAUDE_MODEL` | Claude model | claude-sonnet-4-5-20250929 |
| `BACKEND_TYPE` | `sdk` or `cli-pipe` | sdk |
| `CLAUDE_PATH` | Path to claude CLI | claude |
| `ENABLE_THINKING` | Extended thinking | false |
| `WORK_DIR` | Default working directory | (cwd) |
| `SESSION_STORAGE_DIR` | Session storage | .claude-web/sessions |
| `LOG_LEVEL` | Log level | info |

### Backend Types

**SDK Backend** (`BACKEND_TYPE=sdk`):
- Direct API calls via @anthropic-ai/sdk
- Custom dual-agent pattern (Instructor + Worker)
- Custom tool implementations
- Requires `ANTHROPIC_API_KEY`

**CLI Pipe Backend** (`BACKEND_TYPE=cli-pipe`):
- Wraps official `claude` CLI via `--print --input-format stream-json --output-format stream-json`
- Full CLI features (MCP servers, hooks, all tools)
- Uses CLI's built-in orchestration
- Uses CLI's existing authentication

## Architecture

```
claude-web/
├── backend/
│   ├── src/
│   │   ├── server.ts              # Express + WebSocket server
│   │   ├── config.ts              # Environment configuration
│   │   ├── websocket/
│   │   │   ├── handler.ts         # Message routing, auth
│   │   │   └── client-manager.ts  # WebSocket client state
│   │   ├── session/
│   │   │   ├── manager.ts         # Session lifecycle
│   │   │   └── storage.ts         # JSONL persistence
│   │   ├── orchestrator/
│   │   │   ├── index.ts           # SDK dual-agent orchestrator
│   │   │   └── cli-pipe.ts        # CLI pipe orchestrator
│   │   ├── claude/
│   │   │   ├── client.ts          # Anthropic SDK wrapper
│   │   │   └── cli-pipe-client.ts # CLI subprocess wrapper
│   │   └── tools/                 # Tool implementations
│   └── dist/                      # Compiled output
├── frontend/
│   ├── src/
│   │   ├── views/                 # Login, Sessions, Chat views
│   │   ├── components/            # Terminal, InputBox, StatusBadge
│   │   ├── stores/                # Pinia state (auth, session)
│   │   └── composables/           # useWebSocket
│   └── dist/                      # Built frontend (served by backend)
└── README.md
```

## WebSocket Protocol

### Client to Server

| Message | Description |
|---------|-------------|
| `auth` | `{ type: 'auth', password: string }` |
| `create_session` | `{ type: 'create_session', workDir: string, instruction?: string }` |
| `resume_session` | `{ type: 'resume_session', sessionId: string }` |
| `send_input` | `{ type: 'send_input', sessionId: string, content: string }` |
| `interrupt` | `{ type: 'interrupt', sessionId: string }` |
| `list_sessions` | `{ type: 'list_sessions' }` |
| `end_session` | `{ type: 'end_session', sessionId: string }` |

### Server to Client

| Message | Description |
|---------|-------------|
| `auth_success` | Authentication successful |
| `auth_failed` | Authentication failed |
| `session_created` | New session created |
| `session_resumed` | Session resumed with history |
| `thinking` | Extended thinking content (streaming) |
| `instructor_message` | Instructor agent response |
| `worker_message` | Worker agent response |
| `tool_use` | Tool being executed |
| `tool_result` | Tool execution result |
| `status_update` | Session status change |
| `waiting_input` | Waiting for user input |
| `done` | Task completed |
| `error` | Error message |

## HTTP REST API

All endpoints (except `/api/health` and `/api/config`) require `X-API-Key` header.

### Session Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions` | Create new session |
| `GET` | `/api/sessions` | List all sessions |
| `GET` | `/api/sessions/:id` | Get session details with history |
| `DELETE` | `/api/sessions/:id` | End/delete session |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions/:id/messages` | Send message (sync, wait for completion) |
| `GET` | `/api/sessions/:id/messages/stream` | SSE streaming (query param: `content`) |
| `POST` | `/api/sessions/:id/messages/stream` | SSE streaming (body: `{content}`) |

### Examples

**Create Session**:
```bash
curl -X POST -H "X-API-Key: <password>" -H "Content-Type: application/json" \
  -d '{"workDir": "/path/to/project"}' \
  http://localhost:3000/api/sessions
```

**Send Message (Sync)**:
```bash
curl -X POST -H "X-API-Key: <password>" -H "Content-Type: application/json" \
  -d '{"content": "Read the README.md file"}' \
  http://localhost:3000/api/sessions/<session-id>/messages
```

**Stream Response (SSE)**:
```bash
curl -N -H "X-API-Key: <password>" \
  "http://localhost:3000/api/sessions/<session-id>/messages/stream?content=Hello"
```

**SSE Event Types**:
- `connected` - Connection established
- `status` - Status update (thinking, executing, waiting)
- `thinking` - Extended thinking content
- `instructor_message` - Instructor agent response
- `worker_message` - Worker agent response
- `tool_use` - Tool being executed
- `tool_result` - Tool execution result
- `round_complete` - Round completed
- `done` - Task completed
- `error` - Error occurred

## Development

### Backend
```bash
cd backend
npm install
npm run build   # Compile TypeScript
npm run dev     # Watch mode (if configured)
```

### Frontend
```bash
cd frontend
npm install
npm run dev     # Vite dev server with HMR (port 5173)
npm run build   # Production build
```

## CLI Pipe Mode Details

The CLI pipe backend uses Claude CLI's stream-json format:

**Input**:
```json
{"type":"user","message":{"role":"user","content":"Your prompt"}}
```

**Output** (NDJSON):
```json
{"type":"system","subtype":"init","session_id":"...","tools":[...],"model":"..."}
{"type":"assistant","message":{"content":[{"type":"text","text":"Response"}]}}
{"type":"result","subtype":"success","result":"Final text","session_id":"..."}
```

## Tech Stack

- **Backend**: Node.js, Express 5, WebSocket (ws), TypeScript
- **Frontend**: Vue 3, Vite, Pinia, Vue Router
- **API**: @anthropic-ai/sdk or Claude CLI
- **Storage**: JSONL event sourcing
- **ASR**: sherpa-onnx WebAssembly (voice input)

## Third-Party Dependencies

### sherpa-onnx WASM (Voice Input)

The voice input feature uses [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) WebAssembly files for browser-based speech recognition.

- **Source**: https://huggingface.co/spaces/k2-fsa/web-assembly-asr-sherpa-onnx-zh-en
- **Model**: Zipformer (Chinese + English, ~200MB)
- **License**: Apache 2.0
- **Files**: Downloaded automatically via `npm install` (postinstall script)

To manually download:
```bash
cd frontend
npm run download:asr
```

## License

MIT
