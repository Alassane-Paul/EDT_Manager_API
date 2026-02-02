const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const { StatutProfessionnel, PreferenceHoraire } = require('../../utils/enums');

const Enseignant = sequelize.define('Enseignant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  utilisateur_id: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    }
  },
  etablissement_id: {
    type: DataTypes.UUID,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  matricule: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
      len: [1, 50]
    }
  },
  statut: {
    type: DataTypes.ENUM(...Object.values(StatutProfessionnel)),
    allowNull: false,
    validate: {
      isIn: [Object.values(StatutProfessionnel)]
    }
  },
  date_embauche: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    validate: {
      isDate: true
    }
  },
  heures_contractuelles_hebdo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 300, // 5 heures
      max: 2400, // 40 heures
      isInt: true
    }
  },
  heures_max_journalieres: {
    type: DataTypes.INTEGER,
    defaultValue: 480, // 8 heures
    validate: {
      min: 180, // 3 heures
      max: 600, // 10 heures
      isInt: true
    }
  },
  cours_consecutifs_max: {
    type: DataTypes.INTEGER,
    defaultValue: 4,
    validate: {
      min: 1,
      max: 8,
      isInt: true
    }
  },
  preference_horaire: {
    type: DataTypes.ENUM(...Object.values(PreferenceHoraire)),
    defaultValue: PreferenceHoraire.INDIFFERENT,
    validate: {
      isIn: [Object.values(PreferenceHoraire)]
    }
  },
  multi_sites: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'enseignants',
  hooks: {
    beforeUpdate: (enseignant) => {
      enseignant.updated_at = new Date();
    }
  },
  indexes: [

    {
      fields: ['statut']
    }
  ]
});

// Méthodes d'instance
Enseignant.prototype.getHeuresContractuellesFormattees = function () {
  const heures = Math.floor(this.heures_contractuelles_hebdo / 60);
  const minutes = this.heures_contractuelles_hebdo % 60;
  return minutes > 0 ? `${heures}h${minutes}` : `${heures}h`;
};

Enseignant.prototype.estTitulaire = function () {
  return this.statut === StatutProfessionnel.TITULAIRE;
};

Enseignant.prototype.estVacataire = function () {
  return this.statut === StatutProfessionnel.VACATAIRE;
};

Enseignant.prototype.getInformations = function () {
  return {
    id: this.id,
    matricule: this.matricule,
    statut: this.statut,
    heures_contractuelles: this.getHeuresContractuellesFormattees(),
    preference_horaire: this.preference_horaire,
    date_embauche: this.date_embauche
  };
};

module.exports = Enseignant;