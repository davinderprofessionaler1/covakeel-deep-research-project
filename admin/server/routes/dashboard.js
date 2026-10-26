import { Router } from "express";
import { getDashboard } from "../services/dashboard.js";

export const dashboardRouter = Router();

dashboardRouter.get("/dashboard", async (_request, response, next) => {
  try {
    response.json(await getDashboard());
  } catch (error) {
    next(error);
  }
});
