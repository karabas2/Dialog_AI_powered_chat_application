import "dotenv/config";
import "./otel.js";
import "./tracing.js";//import order matters

import "./db/db.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT || 8081);
const app = createApp();

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
