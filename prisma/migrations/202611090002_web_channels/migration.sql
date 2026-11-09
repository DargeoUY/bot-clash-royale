-- AlterTable
ALTER TABLE `Clan` ADD COLUMN `discordEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `telegramEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `whatsappEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `whatsappGroup` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Jugador` ADD COLUMN `idWhatsapp` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `WebAccount` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WebAccount_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClanAccess` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` VARCHAR(191) NOT NULL,
    `clanTag` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'member',
    `playerTag` VARCHAR(191) NULL,

    UNIQUE INDEX `ClanAccess_accountId_clanTag_key`(`accountId`, `clanTag`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebInvite` (
    `tokenHash` VARCHAR(191) NOT NULL,
    `clanTag` VARCHAR(191) NOT NULL,
    `playerTag` VARCHAR(191) NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'member',
    `expiresAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tokenHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebSession` (
    `id` VARCHAR(191) NOT NULL,
    `data` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `WebSession_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clanTag` VARCHAR(191) NOT NULL,
    `actor` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `detail` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditEvent_clanTag_createdAt_idx`(`clanTag`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClanAccess` ADD CONSTRAINT `ClanAccess_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `WebAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClanAccess` ADD CONSTRAINT `ClanAccess_clanTag_fkey` FOREIGN KEY (`clanTag`) REFERENCES `Clan`(`tag`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebInvite` ADD CONSTRAINT `WebInvite_clanTag_fkey` FOREIGN KEY (`clanTag`) REFERENCES `Clan`(`tag`) ON DELETE RESTRICT ON UPDATE CASCADE;

