import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

export function attachRealtime(server: HttpServer, opts?: { corsOrigin?: true | string[] }) {
  const io = new Server(server, {
    cors: {
      origin: opts?.corsOrigin ?? true,
      credentials: true,
    },
    // Optimize for low latency in production
    transports: ["websocket", "polling"], // Prefer websocket, fallback to polling
    allowEIO3: true, // Backward compatibility
    // Reduce ping/pong intervals for faster connection detection
    pingTimeout: 20000, // 20 seconds (default is 5000ms, but increase for production stability)
    pingInterval: 25000, // 25 seconds (default is 25000ms)
    // Enable compression for faster data transfer
    perMessageDeflate: {
      threshold: 1024, // Only compress messages larger than 1KB
    },
    // Connection optimization
    maxHttpBufferSize: 1e6, // 1MB max message size
    // Enable HTTP long-polling as fallback
    allowUpgrades: true,
  });

  io.on("connection", (socket) => {
    // Optimize connection handling
    socket.on("join", (payload: { branchId?: string } | undefined) => {
      const branchId = payload?.branchId?.trim();
      if (branchId) {
        socket.join(`branch:${branchId}`);
      }
    });

    // Handle disconnection cleanup
    socket.on("disconnect", () => {
      // Cleanup is automatic, but we can add logging if needed
    });
  });

  return io;
}




