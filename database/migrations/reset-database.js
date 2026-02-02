const { sequelize } = require('../../config/database');

async function resetDatabase() {
    try {
        console.log('🗑️  Démarrage de la réinitialisation de la base de données...\n');

        // Test de connexion
        await sequelize.authenticate();
        console.log('✅ Connexion établie\n');

        // Migration complète unique
        const migration = require('./000-complete-schema');

        // 1. Suppression des tables (Down)
        console.log('🔻 Suppression des tables existantes...');
        try {
            await migration.down(sequelize.getQueryInterface(), sequelize.Sequelize);
        } catch (e) {
            console.warn('⚠️  Une erreur est survenue lors de la suppression:', e.message);
        }

        console.log('');

        // 2. Création des tables (Up)
        console.log('🔺 Création des nouvelles tables...\n');
        await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize);

        console.log('\n🎉 Base de données réinitialisée avec succès!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erreur critique lors de la réinitialisation:', error);
        process.exit(1);
    }
}

// Exécuter si appelé directement
if (require.main === module) {
    resetDatabase();
}

module.exports = resetDatabase;

// Exécuter si appelé directement
if (require.main === module) {
    resetDatabase();
}

module.exports = resetDatabase;
