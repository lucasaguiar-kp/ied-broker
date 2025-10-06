import { mqttBrokerManager } from "./mqtt-client";
import { db } from "./prisma-client";

class StartupManager {
  private static instance: StartupManager | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): StartupManager {
    if (!StartupManager.instance) {
      StartupManager.instance = new StartupManager();
    }
    return StartupManager.instance;
  }

  public async initialize() {
    if (this.isInitialized) {
      console.log("🔄 System already initialized");
      return;
    }

    console.log("🚀 Initializing IoT MQTT Monitoring System...");

    try {
      // Step 1: Test database connection
      await this.testDatabaseConnection();

      // Step 2: Initialize MQTT Broker Manager (will auto-connect to existing brokers)
      console.log("🤖 Initializing MQTT Broker Manager...");
      // The manager is already initialized via singleton pattern

      // Step 3: Start health monitoring
      console.log("🏥 Starting health monitoring...");
      // Health monitor is already started via singleton pattern

      this.isInitialized = true;
      console.log("✅ System initialization completed successfully!");

      // Log system status
      await this.logSystemStatus();
    } catch (error) {
      console.error("❌ System initialization failed:", error);
      throw error;
    }
  }

  private async testDatabaseConnection() {
    try {
      console.log("🗄️ Testing database connection...");
      await db.$queryRaw`SELECT 1`;
      console.log("✅ Database connection successful");
    } catch (error) {
      console.error("❌ Database connection failed:", error);
      throw new Error("Database connection failed");
    }
  }

  private async logSystemStatus() {
    try {
      // Get database counts
      const [brokerCount, topicCount] = await Promise.all([
        db.broker.count(),
        db.topic.count({ where: { isActive: true } }),
      ]);

      // Get MQTT status
      const mqttStatus = mqttBrokerManager.getStatus();
      const connectedBrokers = mqttStatus.filter((b) => b.isConnected).length;
      const totalSubscriptions = mqttStatus.reduce(
        (sum, b) => sum + b.subscribedTopics.length,
        0
      );

      console.log("\n📊 SYSTEM STATUS SUMMARY:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(
        `🔌 MQTT: ${connectedBrokers}/${mqttStatus.length} brokers connected, ${totalSubscriptions} subscriptions active`
      );

      if (mqttStatus.length > 0) {
        console.log("\n🔗 BROKER CONNECTIONS:");
        mqttStatus.forEach((broker) => {
          const statusIcon = broker.isConnected ? "✅" : "❌";
          console.log(
            `  ${statusIcon} ${broker.broker.host}:${broker.broker.port} (${broker.subscribedTopics.length} topics)`
          );
        });
      }

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    } catch (error) {
      console.error("❌ Failed to get system status:", error);
    }
  }

  public async getInitializationStatus() {
    return {
      initialized: this.isInitialized,
      timestamp: new Date().toISOString(),
    };
  }
}

export const startupManager = StartupManager.getInstance();
