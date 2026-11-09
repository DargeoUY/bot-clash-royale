-- CreateTable
CREATE TABLE `Clan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tag` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `level` INTEGER NULL,
    `totalMiembros` INTEGER NULL,
    `idServidorDiscord` VARCHAR(191) NULL,
    `idChatTelegram` BIGINT NULL,
    `esPrincipal` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Clan_tag_key`(`tag`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Jugador` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tag` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `rol` VARCHAR(191) NULL,
    `nivel` INTEGER NULL,
    `trofeos` INTEGER NULL,
    `clanTag` VARCHAR(191) NULL,
    `idDiscord` VARCHAR(191) NULL,
    `idTelegram` VARCHAR(191) NULL,
    `registrado` BOOLEAN NOT NULL DEFAULT false,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'active',
    `ultimaActividad` DATETIME(3) NULL,
    `salioEn` DATETIME(3) NULL,
    `trofeosInicioSemana` INTEGER NULL,
    `trofeosInicioMes` INTEGER NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fechaActualizacion` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Jugador_tag_key`(`tag`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RegistroGuerra` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clanTag` VARCHAR(191) NOT NULL,
    `idTemporada` VARCHAR(191) NULL,
    `tipoGuerra` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `participantes` INTEGER NULL,
    `batallasJugadas` INTEGER NULL,
    `wins` INTEGER NULL,
    `losses` INTEGER NULL,
    `fame` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ParticipanteGuerra` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `idRegistroGuerra` INTEGER NOT NULL,
    `tagJugador` VARCHAR(191) NOT NULL,
    `batallasJugadas` INTEGER NOT NULL DEFAULT 0,
    `batallasGanadas` INTEGER NOT NULL DEFAULT 0,
    `batallasPerdidas` INTEGER NOT NULL DEFAULT 0,
    `mazosUsados` INTEGER NOT NULL DEFAULT 0,
    `mazosUsadosHoy` INTEGER NULL,
    `barcosAtacados` INTEGER NULL,
    `puntosReparacion` INTEGER NULL,
    `fame` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ParticipanteGuerra_idRegistroGuerra_tagJugador_key`(`idRegistroGuerra`, `tagJugador`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PuntoJugador` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tagJugador` VARCHAR(191) NOT NULL,
    `puntosTotales` INTEGER NOT NULL DEFAULT 0,
    `puntosGuerra` INTEGER NOT NULL DEFAULT 0,
    `puntosActividad` INTEGER NOT NULL DEFAULT 0,
    `puntosExtra` INTEGER NOT NULL DEFAULT 0,
    `season` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PuntoJugador_tagJugador_season_key`(`tagJugador`, `season`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistorialPunto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tagJugador` VARCHAR(191) NOT NULL,
    `points` INTEGER NOT NULL,
    `razon` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `season` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RegistroInactividad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tagJugador` VARCHAR(191) NOT NULL,
    `diasInactivo` INTEGER NOT NULL,
    `notificadoEn` DATETIME(3) NULL,
    `vecesNotificado` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `ultimaNotificacion` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Vacacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tagJugador` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoPor` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RegistroDonacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tagJugador` VARCHAR(191) NOT NULL,
    `donations` INTEGER NOT NULL DEFAULT 0,
    `donacionesRecibidas` INTEGER NOT NULL DEFAULT 0,
    `season` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RegistroDonacion_tagJugador_season_key`(`tagJugador`, `season`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConfiguracionBot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clanTag` VARCHAR(191) NULL,
    `clave` VARCHAR(191) NOT NULL,
    `valor` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ConfiguracionBot_clave_key`(`clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistorialClan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tagJugador` VARCHAR(191) NOT NULL,
    `clanTag` VARCHAR(191) NOT NULL,
    `evento` VARCHAR(191) NOT NULL,
    `nombreJugador` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConexionTelegram` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(191) NOT NULL,
    `chatId` BIGINT NULL,
    `guildId` VARCHAR(191) NULL,
    `usado` BOOLEAN NOT NULL DEFAULT false,
    `expiraEn` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ConexionTelegram_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Jugador` ADD CONSTRAINT `Jugador_clanTag_fkey` FOREIGN KEY (`clanTag`) REFERENCES `Clan`(`tag`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RegistroGuerra` ADD CONSTRAINT `RegistroGuerra_clanTag_fkey` FOREIGN KEY (`clanTag`) REFERENCES `Clan`(`tag`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParticipanteGuerra` ADD CONSTRAINT `ParticipanteGuerra_idRegistroGuerra_fkey` FOREIGN KEY (`idRegistroGuerra`) REFERENCES `RegistroGuerra`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParticipanteGuerra` ADD CONSTRAINT `ParticipanteGuerra_tagJugador_fkey` FOREIGN KEY (`tagJugador`) REFERENCES `Jugador`(`tag`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PuntoJugador` ADD CONSTRAINT `PuntoJugador_tagJugador_fkey` FOREIGN KEY (`tagJugador`) REFERENCES `Jugador`(`tag`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistorialPunto` ADD CONSTRAINT `HistorialPunto_tagJugador_fkey` FOREIGN KEY (`tagJugador`) REFERENCES `Jugador`(`tag`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RegistroInactividad` ADD CONSTRAINT `RegistroInactividad_tagJugador_fkey` FOREIGN KEY (`tagJugador`) REFERENCES `Jugador`(`tag`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vacacion` ADD CONSTRAINT `Vacacion_tagJugador_fkey` FOREIGN KEY (`tagJugador`) REFERENCES `Jugador`(`tag`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RegistroDonacion` ADD CONSTRAINT `RegistroDonacion_tagJugador_fkey` FOREIGN KEY (`tagJugador`) REFERENCES `Jugador`(`tag`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConfiguracionBot` ADD CONSTRAINT `ConfiguracionBot_clanTag_fkey` FOREIGN KEY (`clanTag`) REFERENCES `Clan`(`tag`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistorialClan` ADD CONSTRAINT `HistorialClan_tagJugador_fkey` FOREIGN KEY (`tagJugador`) REFERENCES `Jugador`(`tag`) ON DELETE RESTRICT ON UPDATE CASCADE;

