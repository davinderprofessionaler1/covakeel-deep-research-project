import { Router } from "express";
import { getRegisteredUsers } from "../services/users.js";

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
