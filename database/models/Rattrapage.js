const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const { TypeRattrapage, StatutRattrapage } = require('../../utils/enums');

const Rattrapage = sequelize.define('Rattrapage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  cours_id: {
    type: DataTypes.UUID,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  type_rattrapage: {
    type: DataTypes.ENUM(...Object.values(TypeRattrapage)),
    allowNull: false,
    validate: {
      isIn: [Object.values(TypeRattrapage)]
    }
  },
  date_demande: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  duree: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 30,
      max: 240,
      isInt: true
    }
  },
  eleves_concernes: {
    type: DataTypes.JSON,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  statut: {
    type: DataTypes.ENUM(...Object.values(StatutRattrapage)),
    defaultValue: StatutRattrapage.DEMANDE,
    validate: {
      isIn: [Object.values(StatutRattrapage)]
    }
  },
  motif: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  periode_souhaitee_debut: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    validate: {
      isDate: true
    }
  },
  periode_souhaitee_fin: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    validate: {
      isDate: true,
      isAfter: function (value) {
        if (this.periode_souhaitee_debut && value <= this.periode_souhaitee_debut) {
          throw new Error('La date de fin doit être après la date de début');
        }
      }
    }
  },
  creneau_planifie_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  date_planification: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_realisation: {
    type: DataTypes.DATE,
    allowNull: true
  },
  commentaires: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  session_examen_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Pour rattrapages d\'examens'
  },
  note_obtenue: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Note obtenue lors du rattrapage d\'examen'
  },
  motif_rattrapage: {
    type: DataTypes.ENUM('ABSENCE', 'ECHEC', 'AUTRE'),
    allowNull: true,
    comment: 'Raison du rattrapage d\'examen'
  }
}, {
  tableName: 'rattrapages',
  hooks: {
    beforeUpdate: (rattrapage) => {
      rattrapage.updated_at = new Date();

      // Mettre à jour les dates selon le statut
      if (rattrapage.changed('statut')) {
        if (rattrapage.statut === StatutRattrapage.PLANIFIE && !rattrapage.date_planification) {
          rattrapage.date_planification = new Date();
        }
        if (rattrapage.statut === StatutRattrapage.REALISE && !rattrapage.date_realisation) {
          rattrapage.date_realisation = new Date();
        }
      }
    }
  },
  indexes: [
    {
      fields: ['cours_id']
    },
    {
      fields: ['type_rattrapage']
    },
    {
      fields: ['statut']
    },
    {
      fields: ['date_demande']
    }
  ]
});

// Méthodes d'instance
Rattrapage.prototype.planifier = function (creneauId) {
  this.statut = StatutRattrapage.PLANIFIE;
  this.creneau_planifie_id = creneauId;
  this.date_planification = new Date();
  return this.save();
};

Rattrapage.prototype.marquerRealise = function () {
  this.statut = StatutRattrapage.REALISE;
  this.date_realisation = new Date();
  return this.save();
};

Rattrapage.prototype.valider = function () {
  this.statut = StatutRattrapage.VALIDE;
  return this.save();
};

Rattrapage.prototype.rejeter = function (motif) {
  this.statut = StatutRattrapage.REFUSE;
  if (motif) {
    this.commentaires = (this.commentaires ? this.commentaires + '\n' : '') + `Rejeté: ${motif}`;
  }
  return this.save();
};

Rattrapage.prototype.annuler = function () {
  this.statut = StatutRattrapage.ANNULE;
  return this.save();
};

Rattrapage.prototype.estUrgent = function () {
  // Un rattrapage est urgent s'il a été demandé il y a plus de 7 jours
  const dateDemande = new Date(this.date_demande);
  const aujourdHui = new Date();
  const diffTime = Math.abs(aujourdHui - dateDemande);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 7 && this.statut === StatutRattrapage.DEMANDE;
};

Rattrapage.prototype.getInformations = function () {
  return {
    id: this.id,
    type_rattrapage: this.type_rattrapage,
    duree: this.duree,
    statut: this.statut,
    date_demande: this.date_demande,
    est_urgent: this.estUrgent()
  };
};

module.exports = Rattrapage;