import type { Request, Response } from "express";

import { mqttBrokerManager } from "@/infrastructure/mqtt-client";
import { db } from "@/infrastructure/prisma-client";

export async function getSystemStatusController(req: Request, res: Response) {
  try {
    const [brokerCount, topicCount, activeTopics, brokers] = await Promise.all([
      db.broker.count(),
      db.topic.count({ where: { isActive: true } }),
      db.topic.findMany({
        where: { isActive: true },
        include: {
          broker: {
            select: {
              id: true,
              host: true,
              port: true,
            },
          },
        },
      }),
      db.broker.findMany({
        include: {
          topics: {
            where: { isActive: true },
          },
        },
      }),
    ]);

    const mqttStatus = mqttBrokerManager.getStatus();
    const connectedBrokers = mqttStatus.filter((b) => b.isConnected).length;
    const totalSubscriptions = mqttStatus.reduce(
      (sum, b) => sum + b.subscribedTopics.length,
      0
    );

    const systemStatus = {
      database: {
        brokers: brokerCount,
        activeTopics: topicCount,
      },
      mqtt: {
        connectedBrokers: `${connectedBrokers}/${mqttStatus.length}`,
        totalSubscriptions,
        connections: mqttStatus.map((broker) => ({
          brokerId: broker.brokerId,
          host: broker.broker.host,
          port: broker.broker.port,
          isConnected: broker.isConnected,
          subscribedTopics: broker.subscribedTopics,
          reconnectAttempts: broker.reconnectAttempts,
          clientId: broker.clientId,
        })),
      },
      topics: activeTopics.map((topic) => ({
        id: topic.id,
        topic: topic.topic,
        isActive: topic.isActive,
        broker: {
          id: topic.broker.id,
          host: topic.broker.host,
          port: topic.broker.port,
        },
      })),
      brokers: brokers.map((broker) => ({
        id: broker.id,
        host: broker.host,
        port: broker.port,
        topicsCount: broker.topics.length,
        topics: broker.topics.map((t) => t.topic),
      })),
    };

    res.status(200).json(systemStatus);
  } catch (error) {
    console.error("❌ Error getting system status:", error);
    res.status(500).json({ error: "Failed to get system status" });
  }
}
