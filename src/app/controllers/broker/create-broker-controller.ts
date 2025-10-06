import type { Request, Response } from "express";
import { z } from "zod";

import { createBroker } from "@/domain/services/broker/create-broker";

const createBrokerSchema = z.object({
  host: z.string().min(1, "Host is required"),
  port: z.number().int().min(1).max(65535),
  username: z.string(),
  password: z.string(),
  caCert: z.string(),
});

export async function createBrokerController(req: Request, res: Response) {
  console.log(req.body);
  const body = createBrokerSchema.parse(req.body);

  const broker = await createBroker(body);

  res.status(201).json(broker);
}
