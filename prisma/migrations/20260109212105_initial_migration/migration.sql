-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('admin', 'cashier', 'kitchen', 'waiter') NOT NULL,
    `branchId` VARCHAR(191) NULL,
    `avatarUrl` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_role_branchId_idx`(`role`, `branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Branch` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `manager` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `orderNumber` INTEGER NOT NULL,
    `status` ENUM('pending', 'accepted', 'preparing', 'prepared', 'completed', 'paid') NOT NULL DEFAULT 'pending',
    `items` JSON NOT NULL,
    `table` VARCHAR(191) NULL,
    `customer` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `waiter` VARCHAR(191) NULL,
    `waiterUserId` VARCHAR(191) NULL,
    `branchId` VARCHAR(191) NULL,
    `clientRequestId` VARCHAR(191) NULL,
    `subtotal` DOUBLE NOT NULL,
    `tax` DOUBLE NOT NULL,
    `discount` DOUBLE NOT NULL,
    `total` DOUBLE NOT NULL,
    `paymentMethod` ENUM('cash', 'card', 'bank', 'prepaid', 'credit') NULL,
    `bankType` VARCHAR(191) NULL,
    `preparedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Order_clientRequestId_key`(`clientRequestId`),
    INDEX `Order_branchId_createdAt_idx`(`branchId`, `createdAt`),
    INDEX `Order_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
