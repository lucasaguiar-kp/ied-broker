import { Router } from "express";

import { createTopicController } from "@/app/controllers/topic/create-topic-controller";
import { deleteTopicController } from "@/app/controllers/topic/delete-topic-controller";

const topicRoute = Router();

topicRoute.post("/", createTopicController);
topicRoute.delete("/:topicId", deleteTopicController);

export { topicRoute };
