const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const { TypeNotification, CanalNotification, PrioriteNotification } = require('../../utils/enums');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  utilisateur_id: {
    type: DataTypes.UUID,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  type: {
    type: DataTypes.ENUM(...Object.values(TypeNotification)),
    allowNull: false,
    validate: {
      isIn: [Object.values(TypeNotification)]
    }
  },
  titre: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 255]
    }
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [5, 2000]
    }
  },
  lien_action: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 500]
    }
  },
  lue: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  date_envoi: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  canal: {
    type: DataTypes.ENUM(...Object.values(CanalNotification)),
    defaultValue: CanalNotification.IN_APP,
    validate: {
      isIn: [Object.values(CanalNotification)]
    }
  },
  priorite: {
    type: DataTypes.ENUM(...Object.values(PrioriteNotification)),
    defaultValue: PrioriteNotification.NORMALE,
    validate: {
      isIn: [Object.values(PrioriteNotification)]
    }
  }
}, {
  tableName: 'notifications',
  hooks: {
    beforeUpdate: (notification) => {
      notification.updated_at = new Date();
    }
  },
  indexes: [
    {
      fields: ['utilisateur_id']
    },
    {
      fields: ['type']
    },
    {
      fields: ['lue']
    },
    {
      fields: ['date_envoi']
    },
    {
      fields: ['priorite']
    }
  ]
});

// Méthodes d'instance
Notification.prototype.marquerCommeLue = function () {
  this.lue = true;
  return this.save();
};

Notification.prototype.marquerCommeNonLue = function () {
  this.lue = false;
  return this.save();
};

Notification.prototype.estUrgente = function () {
  return this.priorite === PrioriteNotification.CRITIQUE ||
    this.priorite === PrioriteNotification.HAUTE;
};

Notification.prototype.estRecente = function () {
  const dateEnvoi = new Date(this.date_envoi);
  const maintenant = new Date();
  const diffTime = Math.abs(maintenant - dateEnvoi);
  const diffHeures = diffTime / (1000 * 60 * 60);
  return diffHeures < 24; // Moins de 24 heures
};

Notification.prototype.getInformations = function () {
  return {
    id: this.id,
    type: this.type,
    titre: this.titre,
    message: this.message.substring(0, 100) + (this.message.length > 100 ? '...' : ''),
    lue: this.lue,
    date_envoi: this.date_envoi,
    priorite: this.priorite,
    est_urgente: this.estUrgente(),
    est_recente: this.estRecente()
  };
};

module.exports = Notification;