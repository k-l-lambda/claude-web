# Claude Code Web

A web-based version of Claude Code with API and WebUI, providing a browser-accessible interface to interact with Claude for software development tasks.

## Features

- **Web-based UI**: Access Claude Code from any browser
- **Real-time streaming**: WebSocket-based bidirectional communication
- **Session management**: Create, resume, and manage multiple sessions
- **Dual-agent architecture**: Instructor (planning) + Worker (execution) pattern
- **Tool execution**: File operations, git commands, and bash execution
- **JSONL persistence**: All sessions are persisted for later resumption

## Quick Start

1. **Configure environment**:
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env and set your ANTHROPIC_API_KEY and AUTH_PASSWORD
   ```

2. **Start the server**:
   ```bash
   ./start.sh
   ```

3. **Access the UI**:
   Open http://localhost:3000 in your browser

## Manual Setup

### Backend

```bash
cd backend
npm install
npm run build
# Create .env with required configuration
node dist/server.js
```

### Frontend

```bash
cd frontend
npm install
npm run build
# Frontend is served by the backend
```

## Configuration

Environment variables in `backend/.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `AUTH_PASSWORD` | Login password | (required) |
| `ANTHROPIC_API_KEY` | Anthropic API key | (required) |
| `CLAUDE_MODEL` | Claude model to use | claude-sonnet-4-20250514 |
| `ENABLE_THINKING` | Enable extended thinking | false |
| `WORK_DIR` | Default working directory | /home/camus/work |
| `SESSION_STORAGE_DIR` | Session storage path | ./sessions |
| `LOG_LEVEL` | Log level | info |

## Architecture

```
claude-web/
├── backend/
│   ├── src/
│   │   ├── server.ts          # Express + WebSocket server
│   │   ├── websocket/         # WebSocket handlers
│   │   ├── session/           # Session management + JSONL storage
│   │   ├── orchestrator/      # Dual-agent orchestration
│   │   ├── claude/            # Claude API client
│   │   └── tools/             # Tool implementations
│   └── dist/                  # Compiled JavaScript
├── frontend/
│   ├── src/
│   │   ├── views/             # Vue views (Login, Sessions, Chat)
│   │   ├── components/        # UI components
│   │   ├── stores/            # Pinia state management
│   │   └── composables/       # Vue composables
│   └── dist/                  # Built frontend
└── start.sh                   # Startup script
```

## WebSocket Protocol

### Client → Server Messages

- `auth`: Authenticate with password
- `create_session`: Create a new session
- `resume_session`: Resume an existing session
- `send_input`: Send user input to session
- `interrupt`: Interrupt current processing
- `list_sessions`: List all sessions
- `end_session`: End a session

### Server → Client Messages

- `auth_success` / `auth_failed`: Authentication result
- `session_created` / `session_resumed`: Session events
- `thinking`: Extended thinking content
- `instructor_message` / `worker_message`: Agent responses
- `tool_use` / `tool_result`: Tool execution
- `status_update`: Session status changes
- `error`: Error messages

## Development

### Backend development
```bash
cd backend
npm run dev  # Watch mode with ts-node
```

### Frontend development
```bash
cd frontend
npm run dev  # Vite dev server with HMR
```

## License

MIT
