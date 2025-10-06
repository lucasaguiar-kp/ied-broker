import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { BadRequestError } from "@/domain/errors/bad-request-error";
import { UnauthorizedError } from "@/domain/errors/unauthorized-error";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.log("🔥 Error: ", err);

  if (err instanceof ZodError) {
    res.status(400).json({ message: err.flatten().fieldErrors });
    return;
  }

  if (err instanceof BadRequestError) {
    res.status(400).json({ message: err.message });
    return;
  }

  if (err instanceof UnauthorizedError) {
    res.status(401).json({ message: err.message });
    return;
  }

  res.status(500).json({ message: "Internal server error" });
}
