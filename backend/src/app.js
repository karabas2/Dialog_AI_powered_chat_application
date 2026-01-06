import "./otel.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { modelsRouter } from "./routes/models.routes.js";
import { sessionsRouter } from "./routes/sessions.routes.js";
import { telemetryRouter } from "./routes/telemetry.routes.js";
import { errorMiddleware } from "./middleware/error.middleware.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
  // allow larger json bodies for base64 image payloads
  app.use(express.json({ limit: "15mb" }));
  app.use(morgan("dev"));

  app.get("/health", (req, res) => res.json({ ok: true }));

  app.use("/api/models", modelsRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/telemetry", telemetryRouter); // receive frontend events

  app.use(errorMiddleware);

  return app;
}
