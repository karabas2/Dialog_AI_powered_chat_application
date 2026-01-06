# Dialog AI Chat Application

Dialog is a full-stack, locally runnable AI chat application. It supports multi-session conversations, multiple LLM models (via OpenRouter), optional vision (image) input, and end-to-end observability with OpenTelemetry + Jaeger.

The goal of this project is to demonstrate a clean full-stack architecture, resilient LLM integration, and production-style tracing—while keeping the developer experience simple (single-command local startup with Docker Compose).

---

## Architecture Overview

Frontend (React + Vite) → Backend (Node.js + Express) → SQLite → OpenRouter (LLM)  
Observability: OpenTelemetry (Tracing) → OTLP (HTTP) → Jaeger (Trace UI)

---

## Key Features

### Chat & UI
- Multi-session chat UI (create, list, open, delete sessions)
- Session persistence (SQLite)
- Optimistic UI rendering for smooth UX
- Image upload with preview (enabled only for vision-capable models)
- Automatic session creation on first message

### Model Support
- Multiple models provided through OpenRouter
- Automatic request formatting based on model capability:
  - Text-only models receive string content
  - Vision models receive structured content with image_url items
- Robust error handling:
  - Timeout-safe LLM calls
  - Proper error responses to the UI
  - Automatic rollback behavior on LLM failures (no broken sessions/messages)

### Observability (OpenTelemetry + Jaeger)
- OpenTelemetry auto-instrumentation for:
  - HTTP server (Express)
  - HTTP client/fetch
  - Runtime signals (where applicable)
- Custom spans for critical operations:
  - Chat completion lifecycle
  - Database reads/writes
  - External LLM API calls (latency + status)
  - UI-triggered telemetry events via a backend telemetry endpoint
- OTLP HTTP exporter compatible with Jaeger All-in-One

Telemetry is designed to be non-blocking: tracing failures do not break the application.

---

## Technical Choices and Rationale

- **React + Vite (Frontend):** fast local development, clean TypeScript ergonomics, easy build pipeline.
- **Node.js + Express (Backend):** minimal, flexible REST API layer with straightforward middleware and routing.
- **SQLite (Persistence):** lightweight local database with zero external dependencies; ideal for case-study scope.
- **OpenRouter (LLM Provider):** simple access to multiple models through one API surface.
- **OpenTelemetry + Jaeger:** industry-standard distributed tracing; Jaeger provides a simple local trace UI.
- **Docker Compose:** one-command local environment with consistent networking between services.

---

## Local Setup (Docker Compose)

### Prerequisites
- Docker Desktop (or Docker Engine) with Docker Compose support.

### Environment Variables
Create a file named `.env` in the project root (same folder as `docker-compose.yml`) and set:

- `OPENROUTER_API_KEY=YOUR_KEY_HERE`

Other environment variables are already defined in `docker-compose.yml` (service name, OTLP endpoint, ports, etc.).

### Start the Full Stack
From the project root:

- `docker compose up --build`

This starts:
- **jaeger** (trace backend + UI)
- **backend** (API + OpenTelemetry exporter)
- **frontend** (served via Nginx)

### Access URLs
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8081` (or the mapped port in `docker-compose.yml`)
- Jaeger UI: `http://localhost:16686`

### Stop / Clean
- Stop: `docker compose down`
- Stop + remove volumes: `docker compose down -v`

---

## Viewing Traces in Jaeger

1. Open Jaeger UI: `http://localhost:16686`
2. In the **Service** dropdown, select the backend service name (e.g., `dialog-backend`)
3. Click **Find Traces**
4. Inspect traces and spans such as:
   - API requests (e.g., `/api/sessions`, `/api/telemetry`)
   - Database read/write operations
   - OpenRouter LLM call span (status code + latency)
   - UI event spans (telemetry)

---

## Project Structure

```text
root/
├── backend/
│   ├── src/
│   │   ├── otel.js
│   │   ├── server.js
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   └── db/
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── lib/
│   │   └── components/
│   └── nginx.conf
├── docker-compose.yml
├── README.md
└── .gitignore
