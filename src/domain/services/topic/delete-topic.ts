import { NotFoundError } from "@/domain/errors/not-found-error";
import { mqttBrokerManager } from "@/infrastructure/mqtt-client";
import { db } from "@/infrastructure/prisma-client";

export async function deleteTopic(topicId: string): Promise<void> {
  const existingTopic = await db.topic.findUnique({
    where: { id: topicId },
    include: { broker: true },
  });

  if (!existingTopic) {
    throw new NotFoundError("Topic not found");
  }

  if (existingTopic.isActive) {
    try {
      await mqttBrokerManager.unsubscribeFromTopic(
        existingTopic.brokerId,
        existingTopic.topic
      );
      console.log(
        `✅ Auto-unsubscribed from topic ${existingTopic.topic} on broker ${existingTopic.broker.host}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to auto-unsubscribe from topic ${existingTopic.topic}:`,
        error
      );
    }
  }

  await db.topic.delete({
    where: { id: topicId },
  });
}
