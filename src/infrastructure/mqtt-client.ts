import mqtt, { MqttClient } from "mqtt";

import { env } from "./env";
import { db } from "./prisma-client";

interface BrokerConnection {
  client: MqttClient;
  broker: {
    id: string;
    host: string;
    port: number;
    username?: string;
    password?: string;
    caCert?: string;
  };
  subscribedTopics: Set<string>;
  isConnected: boolean;
  isConnecting: boolean;
  reconnectAttempts: number;
  reconnectInterval: NodeJS.Timeout | null;
  clientId: string;
}

type Message = {
  topic: string;
  payload: {
    [key: string]: unknown;
  };
};

export class MqttBrokerManager {
  private static instance: MqttBrokerManager | null = null;
  private connections: Map<string, BrokerConnection> = new Map();
  private maxReconnectAttempts = 10;

  private constructor() {
    this.setupGracefulShutdown();
    this.initializeConnections();
  }

  public static getInstance(): MqttBrokerManager {
    if (!MqttBrokerManager.instance) {
      MqttBrokerManager.instance = new MqttBrokerManager();
    }
    return MqttBrokerManager.instance;
  }

  private generateClientId(): string {
    return `iot-monitor-${Math.random().toString(36).substring(2, 15)}`;
  }

  private async initializeConnections() {
    try {
      const brokers = await db.broker.findMany({
        include: {
          topics: {
            where: { isActive: true },
          },
        },
      });

      console.log(`🔍 Found ${brokers.length} brokers to initialize`);

      for (const broker of brokers) {
        await this.connectToBroker(broker);
      }
    } catch (error) {
      console.error("❌ Error initializing broker connections:", error);
      setTimeout(() => this.initializeConnections(), 5000);
    }
  }

  public async connectToBroker(broker: {
    id: string;
    host: string;
    port: number;
    username?: string | null;
    password?: string | null;
    caCert?: string | null;
    topics?: { topic: string; isActive: boolean }[];
  }) {
    if (this.connections.has(broker.id)) {
      console.log(`📡 Broker ${broker.host} already connected`);
      return;
    }

    const clientId = this.generateClientId();

    const connection: BrokerConnection = {
      client: null as any,
      broker: {
        id: broker.id,
        host: broker.host,
        port: broker.port,
        username: broker.username || undefined,
        password: broker.password || undefined,
        caCert: broker.caCert || undefined,
      },
      subscribedTopics: new Set(),
      isConnected: false,
      isConnecting: false,
      reconnectAttempts: 0,
      reconnectInterval: null,
      clientId,
    };

    this.connections.set(broker.id, connection);
    await this.connect(broker.id);
  }

  private async connect(brokerId: string, forcePlaintext: boolean = false) {
    const connection = this.connections.get(brokerId);
    if (!connection || connection.isConnecting || connection.isConnected) {
      return;
    }

    connection.isConnecting = true;

    // Determine if we should use TLS
    const shouldUseTLS =
      connection.broker.port === 8883 &&
      connection.broker.caCert &&
      !forcePlaintext;
    const actualPort = forcePlaintext ? 1883 : connection.broker.port;
    const protocol = shouldUseTLS ? "mqtts" : "mqtt";

    const options: any = {
      host: connection.broker.host,
      port: actualPort,
      username: connection.broker.username,
      password: connection.broker.password,
      clientId: connection.clientId,
      clean: false,
      connectTimeout: 10000,
      reconnectPeriod: 0,
      keepalive: 60,
      protocol: protocol,
      protocolVersion: 4, // MQTT 3.1.1
      will: {
        topic: `${connection.clientId}/status`,
        payload: "offline",
        qos: 1 as const,
        retain: true,
      },
    };

    if (shouldUseTLS) {
      // Ensure proper PEM format with line breaks
      let caCert = connection.broker.caCert!;

      // If the certificate doesn't have line breaks, it might be stored incorrectly
      if (
        !caCert.includes("\n") &&
        caCert.includes("-----BEGIN CERTIFICATE-----")
      ) {
        // Try to fix the format by adding line breaks
        caCert = caCert
          .replace(
            "-----BEGIN CERTIFICATE-----",
            "-----BEGIN CERTIFICATE-----\n"
          )
          .replace("-----END CERTIFICATE-----", "\n-----END CERTIFICATE-----")
          .replace(/(.{64})/g, "$1\n") // Add line breaks every 64 characters
          .replace(/\n\n/g, "\n") // Remove double line breaks
          .trim();
      }

      options.ca = Buffer.from(caCert, "utf8");
      options.rejectUnauthorized = true;
      options.secureProtocol = "TLSv1_2_method";
      options.servername = connection.broker.host;

      console.log(
        `🔐 Using TLS connection for broker ${connection.broker.host}:${actualPort}`
      );
      console.log(`📝 Certificate format check:`, {
        hasLineBreaks: caCert.includes("\n"),
        length: caCert.length,
        startsCorrectly: caCert.startsWith("-----BEGIN CERTIFICATE-----"),
        endsCorrectly: caCert.endsWith("-----END CERTIFICATE-----"),
      });
    } else {
      console.log(
        `🔓 Using plaintext connection for broker ${connection.broker.host}:${actualPort}${forcePlaintext ? " (fallback)" : ""}`
      );
    }

    console.log(
      `🔌 Connecting to broker ${connection.broker.host}:${actualPort} with clientId: ${connection.clientId}...`
    );

    connection.client = mqtt.connect(options);

    connection.client.on("connect", () => {
      console.log(
        `✅ Connected to broker ${connection.broker.host}:${actualPort} (${protocol})`
      );
      connection.isConnected = true;
      connection.isConnecting = false;
      connection.reconnectAttempts = 0;

      if (connection.reconnectInterval) {
        clearInterval(connection.reconnectInterval);
        connection.reconnectInterval = null;
      }

      this.publishStatus(brokerId, "online");
      this.subscribeToActiveTopics(brokerId);
    });

    connection.client.on("error", (error: Error) => {
      console.error(
        `❌ Error connecting to broker ${connection.broker.host}:${actualPort}:`,
        error.message
      );

      // Log do erro completo para diagnosticar
      console.log(`🔍 Error details:`, {
        message: error.message,
        name: error.name,
        code: (error as any).code,
        errno: (error as any).errno,
        errorType: typeof error,
      });

      // If TLS connection failed with authorization error and we haven't tried plaintext yet
      const isAuthError =
        error.message.includes("not authorized") ||
        error.message.includes("Not authorized") ||
        error.message.includes("Connection refused: Not authorized") ||
        (error as any).code === 5; // MQTT CONNACK code 5 = not authorized

      if (shouldUseTLS && isAuthError && !forcePlaintext) {
        console.log(
          `🔄 TLS authorization failed, trying plaintext connection...`
        );
        connection.isConnecting = false;
        if (connection.client) {
          connection.client.end(true);
        }
        // Try again with plaintext
        setTimeout(() => this.connect(brokerId, true), 2000);
        return;
      }

      connection.isConnected = false;
      connection.isConnecting = false;
      this.handleReconnection(brokerId, forcePlaintext);
    });

    connection.client.on("message", async (topic: string, message: Buffer) => {
      await this.handleMessage(brokerId, topic, message);
    });

    connection.client.on("reconnect", () => {
      console.log(`🔄 Reconnecting to broker ${connection.broker.host}...`);
    });

    connection.client.on("close", () => {
      console.log(
        `🔌 Disconnected from broker ${connection.broker.host}:${actualPort}`
      );
      connection.isConnected = false;
      connection.isConnecting = false;
      this.handleReconnection(brokerId, forcePlaintext);
    });

    connection.client.on("offline", () => {
      console.log(
        `📴 Broker ${connection.broker.host}:${actualPort} went offline`
      );
      connection.isConnected = false;
      connection.isConnecting = false;
      this.handleReconnection(brokerId, forcePlaintext);
    });
  }

  private handleReconnection(brokerId: string, forcePlaintext: boolean) {
    const connection = this.connections.get(brokerId);
    if (!connection || connection.reconnectInterval || connection.isConnected) {
      return;
    }

    connection.reconnectInterval = setInterval(() => {
      if (connection.isConnected) {
        if (connection.reconnectInterval) {
          clearInterval(connection.reconnectInterval);
          connection.reconnectInterval = null;
        }
        return;
      }

      connection.reconnectAttempts++;
      console.log(
        `🔄 Reconnection attempt ${connection.reconnectAttempts}/${this.maxReconnectAttempts} for broker ${connection.broker.host} (${forcePlaintext ? "plaintext" : "TLS"})`
      );

      if (connection.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error(
          `❌ Max reconnection attempts reached for broker ${connection.broker.host}. Stopping reconnection.`
        );
        if (connection.reconnectInterval) {
          clearInterval(connection.reconnectInterval);
          connection.reconnectInterval = null;
        }
        return;
      }

      if (!connection.isConnected) {
        console.log(
          `🔌 Attempting to reconnect to broker ${connection.broker.host} (${forcePlaintext ? "plaintext" : "TLS"})...`
        );
        if (connection.client) {
          connection.client.end(true);
        }
        setTimeout(() => this.connect(brokerId, forcePlaintext), 10000);
      }
    }, 10000);
  }

  private publishStatus(brokerId: string, status: "online" | "offline") {
    const connection = this.connections.get(brokerId);
    if (connection?.client && connection.isConnected) {
      connection.client.publish(`${connection.clientId}/status`, status, {
        qos: 1,
        retain: true,
      });
    }
  }

  private async subscribeToActiveTopics(brokerId: string) {
    try {
      const activeTopics = await db.topic.findMany({
        where: {
          brokerId: brokerId,
          isActive: true,
        },
        select: { topic: true },
      });

      console.log(
        `📡 Found ${activeTopics.length} active topics for broker ${brokerId}`
      );

      const connection = this.connections.get(brokerId);
      if (!connection) return;

      connection.subscribedTopics.clear();

      for (const { topic } of activeTopics) {
        await this.subscribeToTopic(brokerId, topic);
      }

      console.log(
        `✅ Successfully subscribed to ${connection.subscribedTopics.size} topics for broker ${brokerId}`
      );
    } catch (error: any) {
      console.error(
        `❌ Error subscribing to active topics for broker ${brokerId}:`,
        error
      );
      setTimeout(() => this.subscribeToActiveTopics(brokerId), 5000);
    }
  }

  public async subscribeToTopic(
    brokerId: string,
    topic: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const connection = this.connections.get(brokerId);
      if (!connection?.client || !connection.isConnected) {
        console.error(`❌ Broker ${brokerId} not connected`);
        resolve(false);
        return;
      }

      if (connection.subscribedTopics.has(topic)) {
        resolve(true);
        return;
      }

      connection.client.subscribe(topic, { qos: 1 }, (error: Error | null) => {
        if (error) {
          console.error(
            `❌ Error subscribing to topic ${topic} on broker ${brokerId}:`,
            error
          );
          resolve(false);
        } else {
          console.log(`📡 Subscribed to topic: ${topic} on broker ${brokerId}`);
          connection.subscribedTopics.add(topic);
          resolve(true);
        }
      });
    });
  }

  public async unsubscribeFromTopic(
    brokerId: string,
    topic: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const connection = this.connections.get(brokerId);
      if (!connection?.client || !connection.isConnected) {
        console.error(`❌ Broker ${brokerId} not connected`);
        resolve(false);
        return;
      }

      if (!connection.subscribedTopics.has(topic)) {
        resolve(true);
        return;
      }

      connection.client.unsubscribe(topic, {}, (error) => {
        if (error) {
          console.error(
            `❌ Error unsubscribing from topic ${topic} on broker ${brokerId}:`,
            error
          );
          resolve(false);
        } else {
          console.log(
            `📡 Unsubscribed from topic: ${topic} on broker ${brokerId}`
          );
          connection.subscribedTopics.delete(topic);
          resolve(true);
        }
      });
    });
  }

  private async handleMessage(
    brokerId: string,
    topic: string,
    message: Buffer
  ) {
    try {
      const payload = message.toString();
      console.log(
        `📨 Received message on topic ${topic} from broker ${brokerId}:`,
        payload
      );

      const topicRecord = await db.topic.findFirst({
        where: {
          topic,
          brokerId,
        },
      });

      if (!topicRecord) {
        console.warn(
          `⚠️ Topic ${topic} not found in database for broker ${brokerId}`
        );
        return;
      }

      await this.forwardToFrontend(topic, payload, topicRecord);
    } catch (error: any) {
      console.error(`❌ Error handling message for topic ${topic}:`, error);
    }
  }

  private async forwardToFrontend(
    topic: string,
    payload: string,
    topicRecord: any
  ) {
    try {
      // Check if FRONT_END_URL is configured
      if (!env.FRONT_END_URL) {
        console.error(
          `❌ FRONT_END_URL not configured in environment variables`
        );
        return;
      }

      const webhookUrl = `${env.FRONT_END_URL}/messages`;

      // Try to parse payload as JSON, if it fails, treat as string
      let parsedPayload: { [key: string]: unknown };
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        // If payload is not valid JSON, wrap it in an object
        parsedPayload = { data: payload };
      }

      const messageBody: Message = {
        topic,
        payload: parsedPayload,
      };

      console.log(
        `📤 Forwarding message to ${webhookUrl}:`,
        JSON.stringify(messageBody, null, 2)
      );

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messageBody),
      });

      if (!response.ok) {
        console.error(
          `❌ Failed to forward message to frontend: ${response.status} ${response.statusText}`
        );
        const responseText = await response.text();
        console.error(`❌ Response body:`, responseText);
      } else {
        console.log(`✅ Message forwarded to frontend successfully`);
      }
    } catch (error: any) {
      console.error(`❌ Error forwarding message to frontend:`, error.message);
      console.error(`❌ Full error:`, error);
    }
  }

  public getStatus() {
    const status = Array.from(this.connections.entries()).map(
      ([brokerId, connection]) => ({
        brokerId,
        broker: connection.broker,
        isConnected: connection.isConnected,
        subscribedTopics: Array.from(connection.subscribedTopics),
        reconnectAttempts: connection.reconnectAttempts,
        clientId: connection.clientId,
      })
    );

    return status;
  }

  public async refreshSubscriptions() {
    for (const brokerId of this.connections.keys()) {
      await this.subscribeToActiveTopics(brokerId);
    }
  }

  public async disconnectBroker(brokerId: string) {
    const connection = this.connections.get(brokerId);
    if (connection) {
      this.publishStatus(brokerId, "offline");
      if (connection.client) {
        connection.client.end(true);
      }
      if (connection.reconnectInterval) {
        clearInterval(connection.reconnectInterval);
      }
      this.connections.delete(brokerId);
      console.log(`🔌 Disconnected from broker ${brokerId}`);
    }
  }

  private setupGracefulShutdown() {
    const shutdown = () => {
      console.log("🔌 Shutting down MQTT connections...");
      for (const [brokerId, connection] of this.connections) {
        this.publishStatus(brokerId, "offline");
        if (connection.client) {
          connection.client.end(true);
        }
        if (connection.reconnectInterval) {
          clearInterval(connection.reconnectInterval);
        }
      }
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  public disconnect() {
    for (const [brokerId, connection] of this.connections) {
      this.publishStatus(brokerId, "offline");
      if (connection.client) {
        connection.client.end(true);
      }
      if (connection.reconnectInterval) {
        clearInterval(connection.reconnectInterval);
      }
    }
    this.connections.clear();
  }
}

export const mqttBrokerManager = MqttBrokerManager.getInstance();
