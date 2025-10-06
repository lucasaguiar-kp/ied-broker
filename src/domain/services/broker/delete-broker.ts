import { NotFoundError } from "@/domain/errors/not-found-error";
import { mqttBrokerManager } from "@/infrastructure/mqtt-client";
import { db } from "@/infrastructure/prisma-client";

export async function deleteBroker(brokerId: string): Promise<void> {
  const existingBroker = await db.broker.findUnique({
    where: { id: brokerId },
  });

  if (!existingBroker) {
    throw new NotFoundError("Broker not found");
  }

  try {
    await mqttBrokerManager.disconnectBroker(brokerId);
    console.log(`✅ Broker ${existingBroker.host} auto-disconnected`);
  } catch (error) {
    console.error(
      `❌ Failed to auto-disconnect broker ${existingBroker.host}:`,
      error
    );
  }

  await db.broker.delete({ where: { id: brokerId } });
}
