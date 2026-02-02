const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const { RoleUtilisateur } = require('../../utils/enums');

const Utilisateur = sequelize.define('Utilisateur', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
      notEmpty: true
    }
  },
  mot_de_passe_hash: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  nom: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 100]
    }
  },
  prenom: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 100]
    }
  },
  telephone: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      is: /^[\+]?[0-9\s\-\(\)]{10,}$/
    }
  },
  photo_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM(...Object.values(RoleUtilisateur)),
    allowNull: false,
    validate: {
      isIn: [Object.values(RoleUtilisateur)]
    }
  },
  etablissement_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  deux_fa_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  deux_fa_secret: {
    type: DataTypes.STRING,
    allowNull: true
  },
  date_derniere_connexion: {
    type: DataTypes.DATE,
    allowNull: true
  },
  actif: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'utilisateurs',
  hooks: {
    beforeCreate: (utilisateur) => {
      if (utilisateur.role === RoleUtilisateur.ADMIN) {
        utilisateur.deux_fa_active = true;
      }
      // Normalize email for consistency
      if (utilisateur.email) {
        utilisateur.email = utilisateur.email.trim().toLowerCase();
      }
    },
    beforeUpdate: (utilisateur) => {
      utilisateur.updated_at = new Date();
      // Normalize email for consistency
      if (utilisateur.email) {
        utilisateur.email = utilisateur.email.trim().toLowerCase();
      }
    }
  },
  indexes: [

    {
      fields: ['etablissement_id']
    },
    {
      fields: ['role']
    }
  ]
});

// Méthodes d'instance
Utilisateur.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.mot_de_passe_hash;
  delete values.deux_fa_secret;
  return values;
};

Utilisateur.prototype.getNomComplet = function () {
  return `${this.prenom} ${this.nom}`;
};

module.exports = Utilisateur;