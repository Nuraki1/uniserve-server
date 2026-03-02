import { PrismaClient } from "@prisma/client";

// Configure Prisma Client to avoid eager connections and handle timeouts gracefully
export const prisma = new PrismaClient({
  log: ["error", "warn"], // Only log errors and warnings, not queries
  // Don't connect eagerly - only connect on first query
  // This prevents blocking during module load
});

// Graceful shutdown handler
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});




