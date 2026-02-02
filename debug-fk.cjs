const { sequelize } = require('./database/models');

async function debugFK() {
    try {
        console.log('🔍 Detailed FK Diagnosis...');

        // 1. Cleanup
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await sequelize.query('DROP TABLE IF EXISTS messages');
        await sequelize.query('DROP TABLE IF EXISTS conversation_participants');
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // 2. Try to create the problematic table
        try {
            console.log('Attempting to create conversation_participants...');
            await sequelize.query(`
        CREATE TABLE conversation_participants (
          id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
          conversation_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
          utilisateur_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
          PRIMARY KEY (id),
          CONSTRAINT fk_test_user FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `);
            console.log('✅ Success? (Wait, it should have failed based on previous logs)');
        } catch (e) {
            console.error('❌ Failed to create table:', e.message);

            const [status] = await sequelize.query('SHOW ENGINE INNODB STATUS');
            const latestError = status[0].Status.split('LATEST FOREIGN KEY ERROR')[1]?.split('------------------------')[0];

            if (latestError) {
                console.log('\n--- LATEST FOREIGN KEY ERROR ---');
                console.log(latestError.trim());
                console.log('-------------------------------\n');
            } else {
                console.log('Could not find detailed FK error in InnoDB status.');
            }
        }

    } catch (error) {
        console.error('Diagnostic error:', error);
    }
    process.exit(0);
}

debugFK();
