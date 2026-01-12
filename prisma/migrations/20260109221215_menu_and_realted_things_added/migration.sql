-- CreateTable
CREATE TABLE `MenuItem` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `price` DOUBLE NOT NULL,
    `description` LONGTEXT NULL,
    `available` BOOLEAN NOT NULL DEFAULT true,
    `imageUrl` LONGTEXT NULL,
    `branchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MenuItem_branchId_category_idx`(`branchId`, `category`),
    INDEX `MenuItem_available_idx`(`available`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
