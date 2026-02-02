const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

async function repair() {
    try {
        console.log('🚀 Démarrage de la réparation des colonnes d\'abonnement...');
        const queryInterface = sequelize.getQueryInterface();
        const tableInfo = await queryInterface.describeTable('etablissements');

        if (!tableInfo.subscription_id) {
            console.log('➕ Ajout de la colonne subscription_id...');
            await queryInterface.addColumn('etablissements', 'subscription_id', {
                type: DataTypes.UUID,
                allowNull: true,
                references: {
                    model: 'subscriptions',
                    key: 'id'
                },
                onDelete: 'SET NULL'
            });
        }

        if (!tableInfo.limite_utilisateurs) {
            console.log('➕ Ajout de la colonne limite_utilisateurs...');
            await queryInterface.addColumn('etablissements', 'limite_utilisateurs', {
                type: DataTypes.INTEGER,
                allowNull: true
            });
        }

        if (!tableInfo.limite_classes) {
            console.log('➕ Ajout de la colonne limite_classes...');
            await queryInterface.addColumn('etablissements', 'limite_classes', {
                type: DataTypes.INTEGER,
                allowNull: true
            });
        }

        if (!tableInfo.limite_stockage_mb) {
            console.log('➕ Ajout de la colonne limite_stockage_mb...');
            await queryInterface.addColumn('etablissements', 'limite_stockage_mb', {
                type: DataTypes.INTEGER,
                allowNull: true
            });
        }

        if (!tableInfo.date_suspension) {
            console.log('➕ Ajout de la colonne date_suspension...');
            await queryInterface.addColumn('etablissements', 'date_suspension', {
                type: DataTypes.DATEONLY,
                allowNull: true
            });
        }

        console.log('✅ Réparation terminée avec succès !');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erreur lors de la réparation :', error);
        process.exit(1);
    }
}

repair();
