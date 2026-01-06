import express from "express";
import { trace, SpanStatusCode } from "@opentelemetry/api";

export const telemetryRouter = express.Router();
const tracer = trace.getTracer("dialog.ui");

function handleTelemetry(req, res) {
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const attrs = body.attrs && typeof body.attrs === "object" ? body.attrs : body.payload; // payload/attrs uyum
  const spanName = name || "ui.event";

  tracer.startActiveSpan(spanName, (span) => {
    try {
      span.setAttribute("ui.event.name", spanName);

      if (attrs && typeof attrs === "object") {
        for (const [k, v] of Object.entries(attrs)) {
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            span.setAttribute(`ui.${k}`, v);
          }
        }
      }

      span.setStatus({ code: SpanStatusCode.OK });
      return res.status(204).send();
    } catch (e) {
      span.recordException(e);
      span.setStatus({ code: SpanStatusCode.ERROR });
      return res.status(204).send(); // telemetry can't ruin ui
    } finally {
      span.end();
    }
  });
}

telemetryRouter.post("/", handleTelemetry);
telemetryRouter.post("/event", handleTelemetry);
