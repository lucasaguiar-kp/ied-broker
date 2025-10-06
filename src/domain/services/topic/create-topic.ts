import { BadRequestError } from "@/domain/errors/bad-request-error";
import { NotFoundError } from "@/domain/errors/not-found-error";
import { mqttBrokerManager } from "@/infrastructure/mqtt-client";
import { db } from "@/infrastructure/prisma-client";

interface CreateTopicData {
  topic: string;
  brokerId: string;
  isActive?: boolean;
}

export async function createTopic(data: CreateTopicData): Promise<{
  topicId: string;
}> {
  const brokerExists = await db.broker.findUnique({
    where: { id: data.brokerId },
  });

  if (!brokerExists) {
    throw new NotFoundError("Broker not found");
  }

  const existingTopic = await db.topic.findFirst({
    where: { topic: data.topic },
  });

  if (existingTopic) {
    throw new BadRequestError("Topic already exists");
  }

  const topic = await db.topic.create({
    data: {
      topic: data.topic,
      brokerId: data.brokerId,
      isActive: data.isActive ?? true,
    },
    include: {
      broker: true,
    },
  });

  if (topic.isActive) {
    try {
      await mqttBrokerManager.subscribeToTopic(data.brokerId, data.topic);
      console.log(
        `✅ Successfully subscribed to topic ${data.topic} on broker ${data.brokerId}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to subscribe to topic ${data.topic} on broker ${data.brokerId}:`,
        error
      );
    }
  }

  return { topicId: topic.id };
}
