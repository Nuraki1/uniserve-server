import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

export function attachRealtime(server: HttpServer, opts?: { corsOrigin?: true | string[] }) {
  const io = new Server(server, {
    cors: {
      origin: opts?.corsOrigin ?? true,
      credentials: true,
    },
    // Optimize for ZERO-DELAY real-time updates
    transports: ["websocket"], // WebSocket only for lowest latency (no polling fallback delay)
    allowEIO3: true, // Backward compatibility
    // Minimal ping/pong for fastest updates
    pingTimeout: 10000, // 10 seconds - faster timeout detection
    pingInterval: 5000, // 5 seconds - faster connection health checks
    // Disable compression for small messages (faster processing)
    perMessageDeflate: false, // Disable compression for instant delivery
    // Connection optimization
    maxHttpBufferSize: 1e7, // 10MB max message size
    // Enable HTTP long-polling as fallback (but prefer websocket)
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




