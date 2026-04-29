-- SubBranch + User.subBranchId + MenuItem.subBranchId (were in schema but missing from DB)

CREATE TABLE `SubBranch` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SubBranch_branchId_idx`(`branchId`),
    UNIQUE INDEX `SubBranch_branchId_name_key`(`branchId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SubBranch` ADD CONSTRAINT `SubBranch_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `User` ADD COLUMN `subBranchId` VARCHAR(191) NULL;

CREATE INDEX `User_subBranchId_idx` ON `User`(`subBranchId`);

ALTER TABLE `User` ADD CONSTRAINT `User_subBranchId_fkey` FOREIGN KEY (`subBranchId`) REFERENCES `SubBranch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `MenuItem` ADD COLUMN `subBranchId` VARCHAR(191) NULL;

CREATE INDEX `MenuItem_subBranchId_idx` ON `MenuItem`(`subBranchId`);

ALTER TABLE `MenuItem` ADD CONSTRAINT `MenuItem_subBranchId_fkey` FOREIGN KEY (`subBranchId`) REFERENCES `SubBranch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Order` ADD COLUMN `subBranchStatuses` JSON NULL;
