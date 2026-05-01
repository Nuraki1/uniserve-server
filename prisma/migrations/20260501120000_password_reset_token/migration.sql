-- Replaces removed migration `20260429120000_password_reset_token` (failed on production when table already existed).
--
-- BEFORE `npm run prisma:migrate` on a DB that hit P3018 / P3009 for the old migration, clear the stale row:
--   DELETE FROM `_prisma_migrations` WHERE `migration_name` = '20260429120000_password_reset_token';
--
-- This script is idempotent: safe if `PasswordResetToken` already exists (e.g. created manually).

-- CreateTable
CREATE TABLE IF NOT EXISTS `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_userId_idx`(`userId`),
    INDEX `PasswordResetToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey (skip if constraint already present)
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PasswordResetToken'
    AND CONSTRAINT_NAME = 'PasswordResetToken_userId_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @alter_fk := IF(
  @fk_exists = 0,
  'ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);

PREPARE stmt FROM @alter_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
