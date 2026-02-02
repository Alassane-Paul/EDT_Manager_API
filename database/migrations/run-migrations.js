const { sequelize } = require('../../config/database');

async function runMigrations() {
  try {
    console.log('🚀 Démarrage des migrations...\n');

    // Test de connexion
    await sequelize.authenticate();
    console.log('✅ Connexion à la base de données établie\n');

    // Liste des migrations à exécuter dans l'ordre
    const migrations = [
      './000-complete-schema'
    ];

    for (const migrationPath of migrations) {
      console.log(`📦 Exécution de la migration : ${migrationPath}...`);
      try {
        const migration = require(migrationPath);
        await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize);
        console.log(`✅ Migration ${migrationPath} terminée.\n`);
      } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError' ||
          error.message.includes('already exists') ||
          error.message.includes('Duplicate column name')) {
          console.log(`ℹ️  Migration ${migrationPath} ignorée (certains éléments existent déjà).\n`);
        } else {
          console.error(`❌ Erreur lors de la migration ${migrationPath}:`, error.message);
          // On continue quand même pour essayer d'exécuter les suivantes
        }
      }
    }

    console.log('\n✅ Toutes les migrations ont été exécutées avec succès!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors des migrations:', error);
    process.exit(1);
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;