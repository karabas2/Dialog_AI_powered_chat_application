import { trace, SpanStatusCode } from "@opentelemetry/api";

export function errorMiddleware(err, req, res, next) {
  try {
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(err);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: String(err?.message ?? "Unhandled error"),
      });

      span.setAttributes({
        "app.http.method": req.method,
        "app.http.route": req.originalUrl || req.url,
        "app.error.status": Number(err?.status || err?.statusCode || 500),
      });
    }
  } catch (_) {
  }

  const status = Number(err?.status || err?.statusCode || 500);
  console.error("ERR:", {
    message: err?.message,
    status: err?.status,
    stack: err?.stack,
    cause: err?.cause,
  });
  
  res.status(status).json({
    error: {
      message: err?.message || "Internal Server Error",
      status,
    },
  });
}
