import { mqttBrokerManager } from "@/infrastructure/mqtt-client";
import { db } from "@/infrastructure/prisma-client";

interface CreateBrokerData {
  host: string;
  port: number;
  username: string;
  password: string;
  caCert: string;
}

export async function createBroker(data: CreateBrokerData): Promise<{
  brokerId: string;
}> {
  const broker = await db.broker.create({
    data: {
      host: data.host,
      port: data.port,
      username: data.username,
      password: data.password,
      caCert: data.caCert,
    },
  });

  try {
    await mqttBrokerManager.connectToBroker({
      id: broker.id,
      host: broker.host,
      port: broker.port,
      username: broker.username,
      password: broker.password,
      caCert: broker.caCert,
    });
    console.log(`✅ Broker ${broker.host} auto-connected successfully`);
  } catch (error) {
    console.error(`❌ Failed to auto-connect broker ${broker.host}:`, error);
  }

  return { brokerId: broker.id };
}
