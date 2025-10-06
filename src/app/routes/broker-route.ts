import { Router } from "express";

import { createBrokerController } from "@/app/controllers/broker/create-broker-controller";
import { deleteBrokerController } from "@/app/controllers/broker/delete-broker-controller";

const brokerRoute = Router();

brokerRoute.post("/", createBrokerController);
brokerRoute.delete("/:brokerId", deleteBrokerController);

export { brokerRoute };
