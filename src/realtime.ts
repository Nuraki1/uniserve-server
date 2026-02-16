import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

export function attachRealtime(server: HttpServer, opts?: { corsOrigin?: true | string[] }) {
  const io = new Server(server, {
    cors: {
      origin: opts?.corsOrigin ?? true,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    socket.on("join", (payload: { branchId?: string } | undefined) => {
      const branchId = payload?.branchId?.trim();
      if (branchId) socket.join(`branch:${branchId}`);
    });
  });

  return io;
}




