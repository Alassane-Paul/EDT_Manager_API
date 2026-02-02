const { sequelize } = require('./database/models');

async function finalRepair() {
    try {
        console.log('🚀 Final Chat Schema Repair...');

        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await sequelize.query('DROP TABLE IF EXISTS messages');
        await sequelize.query('DROP TABLE IF EXISTS conversation_participants');
        await sequelize.query('DROP TABLE IF EXISTS conversations');
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // 1. conversations
        console.log('Creating conversations...');
        await sequelize.query(`
      CREATE TABLE conversations (
        id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        type ENUM('DIRECT', 'GROUP') NOT NULL DEFAULT 'DIRECT',
        last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);

        // 2. conversation_participants
        console.log('Creating conversation_participants...');
        await sequelize.query(`
      CREATE TABLE conversation_participants (
        id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        conversation_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        utilisateur_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        unread_count INT DEFAULT 0,
        last_read_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_participant (conversation_id, utilisateur_id),
        INDEX idx_user (utilisateur_id),
        CONSTRAINT fk_cp_conv FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
        CONSTRAINT fk_cp_user FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);

        // 3. messages
        console.log('Creating messages...');
        await sequelize.query(`
      CREATE TABLE messages (
        id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        conversation_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        sender_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        content TEXT NOT NULL,
        type ENUM('TEXT', 'IMAGE', 'FILE') DEFAULT 'TEXT',
        is_read TINYINT(1) DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
        CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES utilisateurs (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);

        console.log('✅ ALL TABLES CREATED SUCCESSFULLY');
        process.exit(0);
    } catch (error) {
        console.error('❌ REPAIR FAILED:', error.message);
        process.exit(1);
    }
}

finalRepair();
