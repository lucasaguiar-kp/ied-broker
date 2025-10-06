import { Router } from "express";

import { getSystemStatusController } from "@/app/controllers/status-controller";

const statusRoute = Router();

statusRoute.get("/", getSystemStatusController);

export { statusRoute };
