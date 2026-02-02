const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const EnseignantMatiere = sequelize.define('EnseignantMatiere', {
    enseignant_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        references: {
            model: 'enseignants',
            key: 'id'
        }
    },
    matiere_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        references: {
            model: 'matieres',
            key: 'id'
        }
    }
}, {
    tableName: 'enseignants_matieres',
    timestamps: false,
    underscored: true
});

module.exports = EnseignantMatiere;
