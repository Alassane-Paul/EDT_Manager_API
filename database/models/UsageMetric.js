const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const UsageMetric = sequelize.define('UsageMetric', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    etablissement_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'etablissements',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    periode_debut: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    periode_fin: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    nb_utilisateurs_actifs: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    nb_classes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    nb_cours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    nb_emplois_temps_generes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    stockage_utilise_mb: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
            min: 0
        },
        comment: 'Stockage utilisé en mégaoctets'
    },
    date_capture: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    details_json: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Détails supplémentaires sur l\'utilisation'
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at'
    },
    updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'updated_at'
    }
}, {
    tableName: 'usage_metrics',
    timestamps: false,  // Désactiver les timestamps automatiques car on les gère manuellement
    hooks: {
        beforeCreate: (metric) => {
            if (!metric.date_capture) {
                metric.date_capture = new Date();
            }
            // Définir les timestamps manuellement
            if (!metric.created_at) {
                metric.created_at = new Date();
            }
            if (!metric.updated_at) {
                metric.updated_at = new Date();
            }
        },
        beforeUpdate: (metric) => {
            // Mettre à jour le timestamp updated_at
            metric.updated_at = new Date();
        }
    },
    indexes: [
        {
            fields: ['etablissement_id']
        },
        {
            fields: ['periode_debut', 'periode_fin']
        },
        {
            fields: ['date_capture']
        }
    ]
});

// Ajouter une méthode d'instance pour obtenir l'utilisation totale
UsageMetric.prototype.getTotalUsage = function () {
    return {
        utilisateurs: this.nb_utilisateurs_actifs || 0,
        classes: this.nb_classes || 0,
        cours: this.nb_cours || 0,
        emplois_temps: this.nb_emplois_temps_generes || 0,
        stockage_mb: this.stockage_utilise_mb || 0
    };
};

// Ajouter une méthode statique pour créer ou obtenir les métriques
UsageMetric.findOrCreateForPeriod = async function (etablissementId, periodeDebut, periodeFin) {
    return await this.findOne({
        where: {
            etablissement_id: etablissementId,
            periode_debut: periodeDebut,
            periode_fin: periodeFin
        },
        order: [['date_capture', 'DESC']]
    });
};

module.exports = UsageMetric;
