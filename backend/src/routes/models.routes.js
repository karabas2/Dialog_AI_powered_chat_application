import { Router } from "express";
import { getModels } from "../controllers/models.controller.js";

export const modelsRouter = Router();

modelsRouter.get("/", getModels);
