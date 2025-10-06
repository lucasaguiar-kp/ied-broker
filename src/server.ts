import cors from "cors";
import express from "express";
import morgan from "morgan";

import { errorHandler } from "@/app/middlewares/error-handler";
import { brokerRoute } from "@/app/routes/broker-route";
import { statusRoute } from "@/app/routes/status-route";
import { topicRoute } from "@/app/routes/topic-route";
import { env } from "@/infrastructure/env";
import { startupManager } from "@/infrastructure/startup";

const app = express();

app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

app.use("/api/v1/brokers", brokerRoute);
app.use("/api/v1/topics", topicRoute);
app.use("/api/v1/status", statusRoute);

app.use(errorHandler);

const port = env.SERVER_PORT;

app.listen(port, async () => {
  console.log(`🚀 Server is running on port ${port}`);

  try {
    await startupManager.initialize();
  } catch (error) {
    console.error("❌ Failed to initialize system:", error);
    process.exit(1);
  }
});
