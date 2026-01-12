-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `notes` LONGTEXT NULL,
    `branchId` VARCHAR(191) NULL,
    `accountType` ENUM('prepaid', 'credit', 'regular') NOT NULL DEFAULT 'regular',
    `balance` DOUBLE NOT NULL DEFAULT 0,
    `creditLimit` DOUBLE NULL,
    `creditUsed` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Customer_branchId_createdAt_idx`(`branchId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Table` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `capacity` INTEGER NOT NULL,
    `section` VARCHAR(191) NULL,
    `branchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Table_branchId_idx`(`branchId`),
    UNIQUE INDEX `Table_branchId_number_key`(`branchId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role` ENUM('Cashier', 'Kitchen', 'Waiter') NOT NULL,
    `sections` JSON NOT NULL,
    `actions` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RolePermissions_role_key`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
