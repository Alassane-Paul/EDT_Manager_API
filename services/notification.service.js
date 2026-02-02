// services/notificationService.js
const { Notification, Utilisateur, Rattrapage, Enseignant } = require('../database/models');
const EmailService = require('./email.service');
const { TypeNotification, CanalNotification, PrioriteNotification } = require('../utils/enums');
const { Op } = require('sequelize');
const config = require('../config/config');
const fs = require('fs');
const path = require('path');

const logError = (msg, error) => {
  const logFile = path.join(__dirname, '..', 'debug_error.log');
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${msg}: ${error.message} \n ${error.stack}\n ${JSON.stringify(error, Object.getOwnPropertyNames(error))}\n`;
  fs.appendFileSync(logFile, entry);
};

class NotificationService {
  /**
   * Créer une notification
   */
  static async creerNotification({
    utilisateur_id,
    type,
    titre,
    message,
    lien_action = null,
    canal = CanalNotification.IN_APP,
    priorite = PrioriteNotification.NORMALE,
    io = null
  }) {
    try {
      const notification = await Notification.create({
        utilisateur_id,
        type,
        titre,
        message,
        lien_action,
        canal,
        priorite,
        date_envoi: new Date()
      });

      // Envoyer par email si demandé
      if (canal === CanalNotification.EMAIL || canal === CanalNotification.TOUS) {
        await this.envoyerNotificationEmail(notification);
      }

      // Émettre l'événement socket pour notification en temps réel
      if (io) {
        io.to(`user_${utilisateur_id}`).emit('notification:new', {
          id: notification.id,
          titre: notification.titre,
          message: notification.message,
          type: notification.type,
          lien_action: notification.lien_action,
          date_envoi: notification.date_envoi
        });
      }

      return notification;
    } catch (error) {
      logError('Erreur création notification', error);
      console.error('Erreur création notification:', error);
      throw error;
    }
  }

  /**
   * Envoyer une notification par email
   */
  static async envoyerNotificationEmail(notification) {
    try {
      const utilisateur = await Utilisateur.findByPk(notification.utilisateur_id);

      if (!utilisateur || !utilisateur.email) {
        console.warn('Utilisateur ou email non trouvé pour notification:', notification.id);
        return;
      }

      const sujet = this.getEmailSubject(notification);
      const contenu = this.getEmailContent(notification);

      await EmailService.envoyerEmail({
        to: utilisateur.email,
        subject: sujet,
        html: contenu
      });

      // Marquer comme envoyée par email
      await notification.update({ canal: CanalNotification.TOUS });

    } catch (error) {
      console.error('Erreur envoi notification email:', error);
      // Ne pas bloquer le processus principal en cas d'erreur d'email
    }
  }

  /**
   * Obtenir le sujet de l'email selon le type de notification
   */
  static getEmailSubject(notification) {
    const prefixes = {
      [TypeNotification.INFO]: '📋 Information',
      [TypeNotification.ALERTE]: '⚠️ Alerte',
      [TypeNotification.RAPPEL]: '🔔 Rappel',
      [TypeNotification.ABSENCE]: '👨‍🏫 Absence',
      [TypeNotification.RATTRAPAGE]: '🔄 Rattrapage',
      [TypeNotification.EMPLOI_TEMPS]: '📅 Emploi du temps'
    };

    const prefix = prefixes[notification.type] || '📧 Notification';
    return `${prefix} - ${notification.titre}`;
  }

  /**
   * Obtenir le contenu de l'email
   */
  static getEmailContent(notification) {
    const content = `
      <p>${notification.message}</p>
      ${notification.priorite === PrioriteNotification.CRITIQUE ? '<p style="color: #EF4444; font-weight: 700;">⚠️ Cette action nécessite votre attention immédiate.</p>' : ''}
    `;

    const baseUrl = config.app?.url || process.env.FRONTEND_URL || 'http://localhost:3000';
    return EmailService.getPremiumTemplate({
      title: notification.titre,
      content,
      buttonText: notification.lien_action ? 'Voir les détails' : null,
      buttonUrl: notification.lien_action ? `${baseUrl}${notification.lien_action}` : null
    });
  }


  /**
   * Notifier la génération d'un emploi du temps
   */
  static async notifierGenerationEmploiTemps(emploiTemps, io = null) {
    const utilisateursConcernes = await this.getUtilisateursConcernesEmploiTemps(emploiTemps);

    for (const utilisateur of utilisateursConcernes) {
      await this.creerNotification({
        utilisateur_id: utilisateur.id,
        type: TypeNotification.EMPLOI_TEMPS,
        titre: 'Nouvel emploi du temps généré',
        message: `L'emploi du temps "${emploiTemps.nom_version}" pour la classe ${emploiTemps.classe.nom_classe} a été généré avec un score de ${emploiTemps.score_qualite}%.`,
        lien_action: `/emplois-temps/${emploiTemps.id}`,
        canal: CanalNotification.TOUS,
        priorite: PrioriteNotification.NORMALE,
        io
      });
    }
  }

  /**
   * Notifier une absence
   */
  static async notifierAbsence(absence, io = null) {
    const responsables = await this.getResponsablesPedagogiques();

    for (const responsable of responsables) {
      const notification = await this.creerNotification({
        utilisateur_id: responsable.id,
        type: TypeNotification.ABSENCE,
        titre: 'Nouvelle absence déclarée',
        message: `L'enseignant ${absence.enseignant.utilisateur.prenom} ${absence.enseignant.utilisateur.nom} est absent du ${absence.date_debut} au ${absence.date_fin}.`,
        lien_action: `/absences/${absence.id}`,
        canal: CanalNotification.TOUS,
        priorite: absence.necessite_remplacement ? PrioriteNotification.HAUTE : PrioriteNotification.NORMALE
      });

      // Émettre l'événement socket pour notification en temps réel
      if (io) {
        io.to(`user_${responsable.id}`).emit('notification:new', {
          id: notification.id,
          titre: notification.titre,
          message: notification.message,
          type: notification.type,
          lien_action: notification.lien_action,
          date_creation: notification.date_envoi
        });
      }
    }
  }

  /**
   * Notifier d'un nouveau rattrapage
   */
  static async notifierNouveauRattrapage(rattrapage, io = null) {
    // Notifier les administrateurs, directeurs et responsables pédagogiques

    const gestionnaires = await Utilisateur.findAll({
      where: {
        role: ['admin', 'directeur', 'responsable_pedagogique'],
        etablissement_id: rattrapage.cours.classe.etablissement_id
      }
    });


    for (const gest of gestionnaires) {
      await this.creerNotification({
        utilisateur_id: gest.id,
        type: TypeNotification.RATTRAPAGE,
        titre: 'Nouvelle demande de rattrapage',
        message: `L'enseignant ${rattrapage.cours.enseignant.utilisateur.prenom} ${rattrapage.cours.enseignant.utilisateur.nom} demande un rattrapage pour ${rattrapage.cours.matiere.nom_matiere}.`,
        lien_action: `/gestion/rattrapages/${rattrapage.id}`,
        canal: CanalNotification.TOUS,
        priorite: PrioriteNotification.NORMALE,
        io
      });
    }
  }

  /**
   * Notifier un rattrapage urgent
   */
  static async notifierRattrapageUrgent(rattrapage, io = null) {
    const responsables = await this.getResponsablesPedagogiques();

    for (const responsable of responsables) {
      await this.creerNotification({
        utilisateur_id: responsable.id,
        type: TypeNotification.RATTRAPAGE,
        titre: 'Rattrapage en attente depuis plus de 7 jours',
        message: `Le rattrapage pour le cours ${rattrapage.cours.matiere.nom_matiere} est en attente de planification depuis le ${rattrapage.date_demande}.`,
        lien_action: `/gestion/rattrapages/${rattrapage.id}`,
        canal: CanalNotification.TOUS,
        priorite: PrioriteNotification.CRITIQUE,
        io
      });
    }
  }

  /**
   * Obtenir les utilisateurs concernés par un emploi du temps
   */
  static async getUtilisateursConcernesEmploiTemps(emploiTemps) {
    // Implémentation simplifiée - dans la réalité, vous récupéreriez
    // les enseignants de la classe, les responsables, etc.
    return await Utilisateur.findAll({
      where: {
        role: ['admin', 'directeur', 'responsable_pedagogique'],
        etablissement_id: emploiTemps.etablissement_id
      },
      limit: 10
    });
  }

  /**
   * Obtenir les administrateurs et directeurs
   */
  static async getAdministrateurs(etablissementId) {
    return await Utilisateur.findAll({
      where: {
        role: ['admin', 'directeur'],
        etablissement_id: etablissementId
      }
    });
  }

  /**
   * Obtenir les responsables pédagogiques
   */
  static async getResponsablesPedagogiques(etablissementId) {
    const where = { role: 'responsable_pedagogique' };
    if (etablissementId) where.etablissement_id = etablissementId;

    return await Utilisateur.findAll({
      where: where
    });
  }

  /**
   * Marquer une notification comme lue
   */
  static async marquerCommeLue(notificationId) {
    const notification = await Notification.findByPk(notificationId);
    if (notification) {
      await notification.update({ lue: true });
    }
  }

  /**
   * Obtenir les notifications non lues d'un utilisateur
   */
  static async getNotificationsNonLues(utilisateurId, limit = 20) {
    return await Notification.findAll({
      where: {
        utilisateur_id: utilisateurId,
        lue: false
      },
      order: [['date_envoi', 'DESC']],
      limit
    });
  }

  /**
   * Supprimer les anciennes notifications
   */
  static async nettoyerAnciennesNotifications(jours = 30) {
    const dateLimite = new Date();
    dateLimite.setDate(dateLimite.getDate() - jours);

    const result = await Notification.destroy({
      where: {
        date_envoi: {
          [Op.lt]: dateLimite
        },
        lue: true
      }
    });

    return result;
  }

  /**
   * Notifier les enseignants qu'un créneau s'est libéré
   */
  static async notifierCreneauDisponible(seance, io = null) {
    try {
      const { StatutRattrapage } = require('../utils/enums');

      // Optimized approach:
      // We want to notify teachers who have PENDING rattrapages
      const enseignantsANotifier = await Enseignant.findAll({
        include: [{
          association: 'cours',
          include: [{
            association: 'rattrapages',
            where: { statut: StatutRattrapage.DEMANDE },
            required: true
          }]
        }],
        include: [{ association: 'utilisateur' }] // To get IDs
      });

      // Format date and time
      const date = new Date(seance.date_debut).toLocaleDateString('fr-FR');
      const heureDebut = new Date(seance.date_debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const heureFin = new Date(seance.date_fin).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

      let salleInfo = "";
      if (seance.salle) {
        salleInfo = ` en salle ${seance.salle.nom_salle}`;
      }

      for (const enseignant of enseignantsANotifier) {
        if (!enseignant.utilisateur) continue;

        await this.creerNotification({
          utilisateur_id: enseignant.utilisateur.id,
          type: TypeNotification.INFO,
          titre: 'Créneau disponible',
          message: `Un créneau s'est libéré le ${date} de ${heureDebut} à ${heureFin}${salleInfo}. Idéal pour planifier vos rattrapages.`,
          lien_action: '/enseignant/rattrapages',
          canal: CanalNotification.TOUS,
          priorite: PrioriteNotification.NORMALE,
          io
        });
      }
    } catch (error) {
      console.error('Erreur notification créneau disponible:', error);
    }
  }
}

module.exports = NotificationService;