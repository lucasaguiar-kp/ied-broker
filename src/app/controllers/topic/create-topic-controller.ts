import type { Request, Response } from "express";
import { z } from "zod";

import { createTopic } from "@/domain/services/topic/create-topic";

const createTopicSchema = z.object({
  topic: z.string().min(1, "Topic is required"),
  brokerId: z.string().min(1, "Broker ID is required"),
  isActive: z.boolean().optional().default(true),
});

export async function createTopicController(req: Request, res: Response) {
  const body = createTopicSchema.parse(req.body);

  const topic = await createTopic(body);

  res.status(201).json(topic);
}
