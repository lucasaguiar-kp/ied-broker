import type { Request, Response } from "express";
import { z } from "zod";

import { deleteTopic } from "@/domain/services/topic/delete-topic";

const deleteTopicSchema = z.object({
  topicId: z.string().min(1, "Topic ID is required"),
});

export async function deleteTopicController(req: Request, res: Response) {
  const { topicId } = deleteTopicSchema.parse(req.params);

  await deleteTopic(topicId);

  res.status(200).json();
}
