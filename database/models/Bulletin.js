const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Bulletin = sequelize.define('Bulletin', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    eleve_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    periode_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    classe_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    moyenne_generale: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    rang: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    appreciation_conseil: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    details_matieres: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Snapshot des moyennes par matiere'
    },
    statut: {
        type: DataTypes.ENUM('BROUILLON', 'PUBLIE', 'ARCHIVE'),
        defaultValue: 'BROUILLON'
    },
    date_generation: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    nb_absences: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: true
    },
    appreciation_conduite: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Appréciation sur la conduite et le comportement'
    }
}, {
    tableName: 'bulletins',
    indexes: [
        {
            fields: ['eleve_id']
        },
        {
            fields: ['periode_id']
        },
        {
            fields: ['classe_id']
        },
        {
            unique: true,
            fields: ['eleve_id', 'periode_id']
        }
    ]
});

module.exports = Bulletin;
