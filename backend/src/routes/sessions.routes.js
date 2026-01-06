import { Router } from "express";
import {
  createSession,
  listSessions,
  getSession,
  postMessage,
  deleteSession
} from "../controllers/sessions.controller.js";

export const sessionsRouter = Router();

sessionsRouter.post("/", createSession);
sessionsRouter.get("/", listSessions);
sessionsRouter.get("/:id", getSession);
sessionsRouter.post("/:id/messages", postMessage);
sessionsRouter.delete("/:id", deleteSession);
