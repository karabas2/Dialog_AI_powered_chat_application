import process from "process";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

import resourcesPkg from "@opentelemetry/resources";

const otlpEndpoint =
  (process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT.trim()) ||
  "http://localhost:4318";

const serviceName =
  (process.env.OTEL_SERVICE_NAME && process.env.OTEL_SERVICE_NAME.trim()) ||
  "dialog-backend";

// diag debug
if (process.env.OTEL_DIAG_LOG_LEVEL === "debug") {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

function buildResource() {
  if (typeof resourcesPkg?.resourceFromAttributes === "function") {
    return resourcesPkg.resourceFromAttributes({
      "service.name": serviceName,
      "service.version": process.env.npm_package_version || "0.0.0",
      "deployment.environment": process.env.NODE_ENV || "development",
    });
  }

  // Fallback: Resource
  const ResourceCtor = resourcesPkg?.Resource;
  if (typeof ResourceCtor === "function") {
    return new ResourceCtor({
      "service.name": serviceName,
      "service.version": process.env.npm_package_version || "0.0.0",
      "deployment.environment": process.env.NODE_ENV || "development",
    });
  }

  // Fallback: no resource
  return undefined;
}

const traceExporter = new OTLPTraceExporter({
  url: `${otlpEndpoint.replace(/\/$/, "")}/v1/traces`,
});

const sdk = new NodeSDK({
  traceExporter,
  resource: buildResource(),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

sdk.start();

async function shutdown() {
  try {
    await sdk.shutdown();
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
