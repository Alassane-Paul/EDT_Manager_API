const { sequelize } = require('../config/database');
const { Sequelize } = require('sequelize');

async function addElveIdToAbsences() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion à la base de données établie\n');

    const queryInterface = sequelize.getQueryInterface();
    
    // Vérifier si la colonne existe déjà
    const tableDescription = await queryInterface.describeTable('absences');
    
    if (!tableDescription.eleve_id) {
      console.log('➕ Ajout de la colonne eleve_id à la table absences...');
      
      // Ajouter la colonne eleve_id
      await queryInterface.addColumn('absences', 'eleve_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'eleves',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      });

      // Rendre enseignant_id nullable pour supporter les absences d'élèves
      await queryInterface.changeColumn('absences', 'enseignant_id', {
        type: Sequelize.UUID,
        allowNull: true
      });

      console.log('✅ Colonne eleve_id ajoutée avec succès');
    } else {
      console.log('✓ Colonne eleve_id existe déjà');
    }

    await sequelize.close();
    console.log('✅ Migration complétée');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error.message);
    process.exit(1);
  }
}

addElveIdToAbsences();
