// controllers/notificationController.js
const NotificationService = require('../services/notification.service');
const { Notification, Utilisateur } = require('../database/models');
const { bodyValidation, queryValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur, TypeNotification, CanalNotification, PrioriteNotification } = require('../utils/enums');

class NotificationController {
  /**
   * Obtenir les notifications de l'utilisateur connecté
   */
  static async getMyNotifications(req, res) {
    try {
      const utilisateurId = req.utilisateur.id;
      let { page = 1, limit = 20, lue } = req.query;

      page = parseInt(page) || 1;
      limit = parseInt(limit) || 20;

      const offset = (page - 1) * limit;

      let whereClause = { utilisateur_id: utilisateurId };
      if (lue !== undefined) {
        whereClause.lue = lue === 'true';
      }

      console.log('Fetching notifications for user:', utilisateurId, 'Params:', { page, limit, offset, whereClause });

      const notifications = await Notification.findAndCountAll({
        where: whereClause,
        order: [['date_envoi', 'DESC']],
        limit: limit,
        offset: offset
      });

      const unreadCount = await Notification.count({
        where: {
          utilisateur_id: utilisateurId,
          lue: false
        }
      });

      res.json({
        success: true,
        data: notifications.rows,
        unreadCount,
        pagination: {
          total: notifications.count,
          page: page,
          limit: limit,
          pages: Math.ceil(notifications.count / limit)
        }
      });
    } catch (error) {
      console.error('CRITICAL ERROR in getMyNotifications:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des notifications',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Obtenir une notification par ID
   */
  static async getNotificationById(req, res) {
    try {
      const { id } = req.params;
      const utilisateurId = req.utilisateur.id;

      const notification = await Notification.findOne({
        where: {
          id,
          utilisateur_id: utilisateurId
        }
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification non trouvée'
        });
      }

      res.json({
        success: true,
        data: notification
      });
    } catch (error) {
      console.error('Erreur récupération notification:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la notification'
      });
    }
  }

  /**
   * Créer une notification (admin/directeur seulement)
   */
  static async createNotification(req, res) {
    try {
      const { utilisateur_id, type, titre, message, lien_action, canal, priorite } = req.body;

      // Vérifier que la cible appartient au même établissement (sauf admin système)
      const cible = await Utilisateur.findByPk(utilisateur_id);
      if (!cible) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur cible non trouvé'
        });
      }

      if (req.utilisateur.role !== RoleUtilisateur.ADMIN && cible.etablissement_id !== req.utilisateur.etablissement_id) {
        return res.status(403).json({
          success: false,
          message: 'Vous ne pouvez envoyer des notifications qu\'aux utilisateurs de votre établissement'
        });
      }

      const notification = await NotificationService.creerNotification({
        utilisateur_id,
        type: type || TypeNotification.INFO,
        titre,
        message,
        lien_action,
        canal: canal || CanalNotification.IN_APP,
        priorite: priorite || PrioriteNotification.NORMALE
      });

      res.status(201).json({
        success: true,
        data: notification,
        message: 'Notification créée avec succès'
      });
    } catch (error) {
      console.error('Erreur création notification:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création de la notification'
      });
    }
  }

  /**
   * Marquer une notification comme lue
   */
  static async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const utilisateurId = req.utilisateur.id;

      const notification = await Notification.findOne({
        where: {
          id,
          utilisateur_id: utilisateurId
        }
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification non trouvée'
        });
      }

      await NotificationService.marquerCommeLue(id);

      res.json({
        success: true,
        message: 'Notification marquée comme lue'
      });
    } catch (error) {
      console.error('Erreur marquage notification:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du marquage de la notification'
      });
    }
  }

  /**
   * Marquer toutes les notifications comme lues
   */
  static async markAllAsRead(req, res) {
    try {
      const utilisateurId = req.utilisateur.id;

      await Notification.update(
        { lue: true },
        {
          where: {
            utilisateur_id: utilisateurId,
            lue: false
          }
        }
      );

      res.json({
        success: true,
        message: 'Toutes les notifications ont été marquées comme lues'
      });
    } catch (error) {
      console.error('Erreur marquage notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du marquage des notifications'
      });
    }
  }

  /**
   * Supprimer une notification
   */
  static async deleteNotification(req, res) {
    try {
      const { id } = req.params;
      const utilisateurId = req.utilisateur.id;

      const notification = await Notification.findOne({
        where: {
          id,
          utilisateur_id: utilisateurId
        }
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification non trouvée'
        });
      }

      await notification.destroy();

      res.json({
        success: true,
        message: 'Notification supprimée avec succès'
      });
    } catch (error) {
      console.error('Erreur suppression notification:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression de la notification'
      });
    }
  }

  /**
   * Obtenir le nombre de notifications non lues
   */
  static async getUnreadCount(req, res) {
    try {
      const utilisateurId = req.utilisateur.id;

      const count = await Notification.count({
        where: {
          utilisateur_id: utilisateurId,
          lue: false
        }
      });

      res.json({
        success: true,
        data: { count }
      });
    } catch (error) {
      console.error('Erreur comptage notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du comptage des notifications'
      });
    }
  }

  /**
   * Nettoyer les anciennes notifications (admin seulement)
   */
  static async cleanupOldNotifications(req, res) {
    try {
      const { jours = 30 } = req.body;

      const deletedCount = await NotificationService.nettoyerAnciennesNotifications(jours);

      res.json({
        success: true,
        message: `${deletedCount} anciennes notifications supprimées`
      });
    } catch (error) {
      console.error('Erreur nettoyage notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du nettoyage des notifications'
      });
    }
  }
}

module.exports = NotificationController;
