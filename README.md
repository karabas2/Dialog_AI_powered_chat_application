# Dialog AI Chat Application

This project is a full-stack AI-powered chat application that supports multi-session conversations, multiple LLM models, optional vision (image) input, and end-to-end observability using OpenTelemetry.

The application is designed to run entirely on a local development environment and demonstrates clean architecture, robust error handling, and production-style telemetry practices.

**Architecture Overview**

Frontend (React + Vite)
↓
Backend (Node.js + Express)
↓
SQLite (Persistence)
↓
OpenRouter (LLM Provider)
↓
OpenTelemetry (Tracing)
↓
Jaeger (Trace Visualization)

### 💬 Chat & UI
* **Multi-session Conversations:** Manage and persist multiple chat threads.
* **Optimistic UI:** High-performance rendering for a smooth user experience.
* **Vision Support:** Image upload capability with real-time preview and analysis.
* **Auto-session Management:** Automatic session creation triggered by the first user message.

### 🧠 Model Intelligence
* **Diverse LLM Support:** Integrated with OpenRouter to provide access to various models.
* **Context-Aware Formatting:** Automatic request formatting based on whether the model supports vision or text-only inputs.
* **Failure Resilience:** Implements timeout-safe external API calls and automatic database rollbacks on LLM errors.

### 📊 Observability & DevOps
* **OpenTelemetry Instrumentation:** Automatic and custom spans for monitoring system health.
* **Distributed Tracing:** Visualize the lifecycle of a request from the UI to the LLM API using **Jaeger**.
* **Performance Tracking:** Detailed metrics for database operations and external API latency.

---
Local Setup
1. Clone the Repository
git clone <repository-url>
cd <repository-name>

2. Environment Variables

Create a .env file in the backend/ directory:

OPENROUTER_API_KEY=your_api_key_here
OTEL_SERVICE_NAME=dialog-backend
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
NODE_ENV=development


An example file is provided as .env.example.

3. Install Dependencies
Backend
cd backend
npm install

Frontend
cd frontend
npm install

Running Jaeger (Tracing Backend)

Run Jaeger locally using Docker:

docker run -d \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:1.55


Jaeger UI: http://localhost:16686

OTLP HTTP Endpoint: http://localhost:4318/v1/traces

Running the Application
Backend
cd backend
npm run dev


Backend will be available at:

http://localhost:8081

Frontend
cd frontend
npm run dev


Frontend will be available at:

http://localhost:5173

Viewing Traces in Jaeger

Open http://localhost:16686

Select the service name:

dialog-backend


Click Find Traces

Inspect traces for:

HTTP requests

Database queries

LLM calls

User interaction events

Telemetry & Tracing Details
Automatically Instrumented

HTTP server (Express)

Fetch / HTTP client

Database operations

Runtime metrics

Custom Spans

Chat completion lifecycle

Database read/write operations

External LLM API calls

UI-triggered telemetry events

Telemetry is designed to be non-blocking and will never affect application behavior if tracing is unavailable.

Project Structure
root
├── backend
│   ├── src
│   │   ├── otel.js
│   │   ├── server.js
│   │   ├── routes
│   │   ├── services
│   │   └── db
│   └── .env.example
├── frontend
│   ├── src
│   │   ├── App.tsx
│   │   ├── lib
│   │   └── components
├── docker-compose.yml
├── README.md
└── .gitignore

Notes

.env files are intentionally excluded from version control.

The application is intended to run locally.

Docker is only required for Jaeger.

API keys should never be committed to the repository.

Summary

This project demonstrates:

Clean full-stack architecture

Practical LLM integration

Vision-capable chat workflows

Production-grade observability with OpenTelemetry

Clear local developer experience
