import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

export function attachRealtime(server: HttpServer, opts?: { corsOrigin?: true | string[] }) {
  // Configure Socket.IO with production-ready settings
  const io = new Server(server, {
    cors: {
      origin: opts?.corsOrigin ?? true,
      credentials: true,
      methods: ["GET", "POST"],
    },
    // Path configuration - Socket.IO uses /socket.io/ by default
    path: "/socket.io/",
    // Allow both websocket and polling transports
    transports: ["websocket", "polling"],
    // Enable CORS for Socket.IO handshake
    allowEIO3: true,
    // Connection timeout
    connectTimeout: 45000,
    // Ping timeout for detecting dead connections
    pingTimeout: 20000,
    // Ping interval to keep connection alive
    pingInterval: 25000,
  });

  io.on("connection", (socket) => {
    // Log connection for debugging (can be removed in production if too verbose)
    if (process.env.NODE_ENV !== "production") {
      console.log(`Socket.IO client connected: ${socket.id}`);
    }

    socket.on("join", (payload: { branchId?: string } | undefined) => {
      const branchId = payload?.branchId?.trim();
      if (branchId) {
        socket.join(`branch:${branchId}`);
        if (process.env.NODE_ENV !== "production") {
          console.log(`Socket ${socket.id} joined branch: ${branchId}`);
        }
      }
    });

    socket.on("disconnect", (reason) => {
      if (process.env.NODE_ENV !== "production") {
        console.log(`Socket ${socket.id} disconnected: ${reason}`);
      }
    });

    socket.on("error", (error) => {
      console.error(`Socket.IO error for ${socket.id}:`, error);
    });
  });

  return io;
}




