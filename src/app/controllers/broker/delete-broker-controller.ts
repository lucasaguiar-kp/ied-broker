import type { Request, Response } from "express";
import { z } from "zod";

import { deleteBroker } from "@/domain/services/broker/delete-broker";

const deleteBrokerSchema = z.object({
  brokerId: z.string().min(1, "Broker ID is required"),
});

export async function deleteBrokerController(req: Request, res: Response) {
  const { brokerId } = deleteBrokerSchema.parse(req.params);

  await deleteBroker(brokerId);

  res.status(200).json();
}
