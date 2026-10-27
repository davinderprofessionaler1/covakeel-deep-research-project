import { Router } from "express";
import { getConversationThreads, getRegisteredUserActivity, getRegisteredUsers, updateRegisteredUserBlock } from "../services/users.js";

export const usersRouter = Router();

usersRouter.get("/users", async (request, response, next) => {
  try {
    const search = String(request.query.search || "").trim().slice(0, 200);
    const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(request.query.pageSize, 10) || 25));
    response.json(await getRegisteredUsers({ search, page, pageSize }));
  } catch (error) {
    next(error);
  }
});

usersRouter.get("/users/:id/activity", async (request, response, next) => {
  try {
    const userId = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(userId) || userId < 1) return response.status(400).json({ error: "Invalid user id." });
    return response.json(await getRegisteredUserActivity(userId));
  } catch (error) { return next(error); }
});

usersRouter.patch("/users/:id/block", async (request, response, next) => {
  try {
    const userId = Number.parseInt(request.params.id, 10);
    const blocked = request.body?.blocked;
    if (!Number.isInteger(userId) || userId < 1 || typeof blocked !== "boolean") return response.status(400).json({ error: "Valid user id and blocked status are required." });
    return response.json(await updateRegisteredUserBlock(userId, { blocked, reason: String(request.body?.reason || "").trim().slice(0, 240) }));
  } catch (error) { return next(error); }
});

usersRouter.get("/conversations", async (request, response, next) => {
  try {
    const search = String(request.query.search || "").trim().slice(0, 200);
    const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(request.query.pageSize, 10) || 25));
    return response.json(await getConversationThreads({ search, page, pageSize }));
  } catch (error) { return next(error); }
});
