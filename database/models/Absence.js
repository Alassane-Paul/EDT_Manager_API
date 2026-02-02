const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const { StatutAbsence } = require('../../utils/enums');

const Absence = sequelize.define('Absence', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  enseignant_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  eleve_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  cours_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  date_debut: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      isDate: true
    }
  },
  date_fin: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      isDate: true
    }
  },
  motif: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [5, 1000]
    }
  },
  statut: {
    type: DataTypes.ENUM(...Object.values(StatutAbsence)),
    defaultValue: StatutAbsence.DECLAREE,
    validate: {
      isIn: [Object.values(StatutAbsence)]
    }
  },
  necessite_remplacement: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  cours_concernes: {
    type: DataTypes.JSON,
    allowNull: true
  },
  date_declaration: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  rattrapages: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'absences',
  hooks: {
    beforeCreate: (absence) => {
      if (typeof absence.date_debut === 'string') {
        absence.date_debut = new Date(absence.date_debut);
      }
      if (typeof absence.date_fin === 'string') {
        absence.date_fin = new Date(absence.date_fin);
      }
    },
    beforeUpdate: (absence) => {
      absence.updated_at = new Date();
      if (typeof absence.date_debut === 'string') {
        absence.date_debut = new Date(absence.date_debut);
      }
      if (typeof absence.date_fin === 'string') {
        absence.date_fin = new Date(absence.date_fin);
      }
    }
  },
  indexes: [
    {
      fields: ['enseignant_id']
    },
    {
      fields: ['date_debut', 'date_fin']
    },
    {
      fields: ['statut']
    },
    {
      fields: ['necessite_remplacement']
    }
  ]
});

// Méthodes d'instance
Absence.prototype.valider = function () {
  this.statut = StatutAbsence.VALIDEE;
  return this.save();
};

Absence.prototype.refuser = function (raison) {
  this.statut = StatutAbsence.REFUSEE;
  if (raison) {
    this.motif += ` [Refusé: ${raison}]`;
  }
  return this.save();
};

Absence.prototype.getDureeAbsence = function () {
  const debut = new Date(this.date_debut);
  const fin = new Date(this.date_fin);
  const diffTime = Math.abs(fin - debut);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 pour inclure le jour de début
};

Absence.prototype.estEnCours = function () {
  const maintenant = new Date();
  return maintenant >= new Date(this.date_debut) && maintenant <= new Date(this.date_fin);
};

Absence.prototype.estFuture = function () {
  return new Date() < new Date(this.date_debut);
};

Absence.prototype.getInformations = function () {
  return {
    id: this.id,
    date_debut: this.date_debut,
    date_fin: this.date_fin,
    duree: this.getDureeAbsence(),
    statut: this.statut,
    necessite_remplacement: this.necessite_remplacement,
    est_en_cours: this.estEnCours(),
    est_future: this.estFuture()
  };
};

module.exports = Absence;