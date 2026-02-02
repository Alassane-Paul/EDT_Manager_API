const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const { TypeEtablissement, StatutEtablissement } = require('../../utils/enums');

const Etablissement = sequelize.define('Etablissement', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  nom: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 255]
    }
  },
  type: {
    type: DataTypes.ENUM(...Object.values(TypeEtablissement)),
    allowNull: false,
    validate: {
      isIn: [Object.values(TypeEtablissement)]
    }
  },
  adresse: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  ville: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 100]
    }
  },
  code_postal: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 10]
    }
  },
  telephone: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      is: /^[\+]?[0-9\s\-\(\)]{8,}$/
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  site_web: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isUrl: true
    }
  },
  logo_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  code_acces: {
    type: DataTypes.STRING(16),
    allowNull: true,
    unique: true,
    validate: {
      len: [16, 16],
      isAlphanumeric: true
    }
  },
  fuseau_horaire: {
    type: DataTypes.STRING,
    defaultValue: 'TOGO/Lomé',
    validate: {
      notEmpty: true
    }
  },
  langue: {
    type: DataTypes.STRING(2),
    defaultValue: 'fr',
    validate: {
      len: [2, 2]
    }
  },
  annee_scolaire_courante: {
    type: DataTypes.STRING(9),
    allowNull: false,
    validate: {
      is: /^\d{4}-\d{4}$/
    }
  },
  subscription_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'subscriptions',
      key: 'id'
    },
    onDelete: 'SET NULL',
    comment: 'Abonnement actif de l\'établissement'
  },
  limite_utilisateurs: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    },
    comment: 'Limite du nombre d\'utilisateurs (null = illimité)'
  },
  limite_classes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    },
    comment: 'Limite du nombre de classes (null = illimité)'
  },
  limite_stockage_mb: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    },
    comment: 'Limite de stockage en MB (null = illimité)'
  },
  date_suspension: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'Date de suspension pour non-paiement'
  },
  statut: {
    type: DataTypes.ENUM(...Object.values(StatutEtablissement)),
    allowNull: false,
    defaultValue: StatutEtablissement.ACTIF,
    validate: {
      isIn: [Object.values(StatutEtablissement)]
    }
  },
  heure_debut_journee: {
    type: DataTypes.STRING,
    defaultValue: '08:00'
  },
  heure_fin_journee: {
    type: DataTypes.STRING,
    defaultValue: '18:00'
  },
  duree_cours_standard: {
    type: DataTypes.INTEGER,
    defaultValue: 60
  }
}, {
  tableName: 'etablissements',
  hooks: {
    beforeCreate: (etablissement) => {
      // Générer un code d'accès si non fourni
      if (!etablissement.code_acces) {
        etablissement.code_acces = generateAccessCode();
        console.log(etablissement.code_acces);

      }
    },
    beforeUpdate: (etablissement) => {
      etablissement.updated_at = new Date();
    }
  },
  indexes: [
    {
      fields: ['nom', 'ville']
    },
    {
      fields: ['type']
    },
    {
      fields: ['statut']
    }
  ]
});

// Méthodes d'instance
Etablissement.prototype.generateNewAccessCode = function () {
  const newCode = generateAccessCode();
  this.code_acces = newCode;
  return newCode;
};

Etablissement.prototype.getInformations = function () {
  return {
    id: this.id,
    nom: this.nom,
    type: this.type,
    ville: this.ville,
    annee_scolaire: this.annee_scolaire_courante,
    statut: this.statut
  };
};

function generateAccessCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  console.log(code);

  return code;
}

module.exports = Etablissement;