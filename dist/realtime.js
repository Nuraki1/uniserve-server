import { Server } from "socket.io";
export function attachRealtime(server, opts) {
    const io = new Server(server, {
        cors: {
            origin: opts?.corsOrigin ?? true,
            credentials: true,
        },
    });
    io.on("connection", (socket) => {
        socket.on("join", (payload) => {
            const branchId = payload?.branchId?.trim();
            if (branchId)
                socket.join(`branch:${branchId}`);
        });
    });
    return io;
}
