const {
  Utilisateur,
  Etablissement,
  LogConnexion,
  LogModification,
  Enseignant,
  Eleve,
  Directeur,
  ResponsablePedagogique,
  Sequelize
} = require('../database/models');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { RoleUtilisateur, TypeOperation } = require('../utils/enums');
const { resolveEtablissementScope, applyEtablissementScope, resolveScopedEtablissementId, isAdminSystem } = require('../utils/scope');
const EmailService = require('../services/email.service');

const userController = {
  /**
   * Récupérer tous les utilisateurs (admin seulement)
   */
  getAllUsers: async (req, res) => {
    try {
      const { page = 1, limit = 100, role, search, statut } = req.query;
      const offset = (page - 1) * limit;

      const scopedEtablissementId = resolveScopedEtablissementId(req);
      const whereClause = applyEtablissementScope(req, {});

      if (role) {
        whereClause.role = role;
      }

      if (req.query.actif !== undefined) {
        whereClause.actif = req.query.actif === 'true';
      }

      if (search) {
        whereClause[Op.or] = [
          { nom: { [Op.like]: `%${search}%` } },
          { prenom: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } }
        ];
      }

      const { count, rows: utilisateurs } = await Utilisateur.findAndCountAll({
        where: whereClause,
        attributes: { exclude: ['mot_de_passe_hash', 'deux_fa_secret'] },
        include: [{
          association: 'etablissement',
          attributes: ['id', 'nom']
        }],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['nom', 'ASC']]
      });

      res.json({
        utilisateurs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        code: 'USERS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération utilisateurs:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des utilisateurs',
        code: 'USERS_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Récupérer un utilisateur par ID
   */
  getUserById: async (req, res) => {
    try {
      const { id } = req.params;

      const utilisateur = await Utilisateur.findOne({
        where: applyEtablissementScope(req, { id }),
        attributes: { exclude: ['mot_de_passe_hash', 'deux_fa_secret'] },
        include: [
          {
            association: 'etablissement',
            attributes: ['id', 'nom', 'type']
          },
          {
            association: 'enseignant',
            required: false
          },
          {
            association: 'eleve',
            required: false,
            include: [{
              association: 'classe',
              attributes: ['id', 'nom_classe']
            }]
          },
          {
            association: 'directeur',
            required: false
          },
          {
            association: 'responsablePedagogique',
            required: false
          }
        ]
      });

      if (!utilisateur) {
        return res.status(404).json({
          error: 'Utilisateur non trouvé',
          code: 'USER_NOT_FOUND'
        });
      }

      res.json({
        user: utilisateur,
        code: 'USER_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération utilisateur:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération de l\'utilisateur',
        code: 'USER_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Créer un nouvel utilisateur (admin/directeur)
   */
  createUser: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Données invalides',
          details: errors.array(),
          code: 'VALIDATION_ERROR'
        });
      }

      const { email, password, mot_de_passe, nom, prenom, role, telephone, photo_url, actif } = req.body;
      const actualPassword = password || mot_de_passe;

      if (!actualPassword) {
        return res.status(400).json({
          error: 'Le mot de passe est obligatoire',
          code: 'PASSWORD_REQUIRED'
        });
      }

      // Vérifier si l'utilisateur existe déjà
      const existingUser = await Utilisateur.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({
          error: 'Un utilisateur avec cet email existe déjà',
          code: 'USER_ALREADY_EXISTS'
        });
      }

      // Hasher le mot de passe
      const saltRounds = 12;
      const motDePasseHash = await bcrypt.hash(actualPassword, saltRounds);

      // Créer l'utilisateur
      const targetEtablissementId = resolveScopedEtablissementId(req);

      if (!targetEtablissementId) {
        return res.status(400).json({
          error: 'Établissement requis pour créer un utilisateur',
          code: 'ESTABLISSEMENT_REQUIRED'
        });
      }

      const utilisateur = await Utilisateur.create({
        email,
        mot_de_passe_hash: motDePasseHash,
        nom,
        prenom,
        role,
        telephone,
        photo_url,
        actif: actif !== undefined ? actif : true,
        etablissement_id: targetEtablissementId
      });

      // Journaliser la création
      await LogModification.create({
        utilisateur_id: req.utilisateur.id,
        table_concernee: 'utilisateurs',
        id_entite_concernee: utilisateur.id,
        type_operation: TypeOperation.CREATION,
        valeur_avant: null,
        valeur_apres: { email, nom, prenom, role },
        adresse_ip: req.ip
      });

      // Envoyer l'email de bienvenue
      if (utilisateur.email) {
        EmailService.envoyerEmailBienvenue(utilisateur, actualPassword).catch(err => {
          console.error('Erreur envoi email bienvenue (admin create):', err);
        });
      }

      res.status(201).json({
        message: 'Utilisateur créé avec succès',
        user: {
          id: utilisateur.id,
          email: utilisateur.email,
          nom: utilisateur.nom,
          prenom: utilisateur.prenom,
          role: utilisateur.role,
          telephone: utilisateur.telephone,
          photo_url: utilisateur.photo_url,
          actif: utilisateur.actif
        },
        code: 'USER_CREATED'
      });

    } catch (error) {
      console.error('Erreur création utilisateur:', error);
      res.status(500).json({
        error: `Erreur lors de la création de l\'utilisateur ${error.message}`,
        code: 'USER_CREATION_ERROR'
      });
    }
  },

  /**
   * Mettre à jour un utilisateur
   */
  updateUser: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Données invalides',
          details: errors.array(),
          code: 'VALIDATION_ERROR'
        });
      }

      const { id } = req.params;
      const { nom, prenom, role, telephone, photo_url, actif } = req.body;

      const whereClause = { id };
      if (!isAdminSystem(req.utilisateur)) {
        whereClause.etablissement_id = req.utilisateur.etablissement_id;
      }

      const utilisateur = await Utilisateur.findOne({
        where: whereClause
      });

      if (!utilisateur) {
        return res.status(404).json({
          error: 'Utilisateur non trouvé',
          code: 'USER_NOT_FOUND'
        });
      }

      // Sauvegarder les anciennes valeurs pour le log
      const anciennesValeurs = {
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        role: utilisateur.role,
        telephone: utilisateur.telephone,
        photo_url: utilisateur.photo_url,
        actif: utilisateur.actif
      };

      await utilisateur.update({
        nom: nom || utilisateur.nom,
        prenom: prenom || utilisateur.prenom,
        role: role || utilisateur.role,
        telephone: telephone || utilisateur.telephone,
        photo_url: photo_url || utilisateur.photo_url,
        actif: actif !== undefined ? actif : utilisateur.actif
      });

      // Journaliser la modification
      await LogModification.create({
        utilisateur_id: req.utilisateur.id,
        table_concernee: 'utilisateurs',
        id_entite_concernee: utilisateur.id,
        type_operation: TypeOperation.MODIFICATION,
        valeur_avant: anciennesValeurs,
        valeur_apres: {
          nom: utilisateur.nom,
          prenom: utilisateur.prenom,
          role: utilisateur.role,
          telephone: utilisateur.telephone,
          photo_url: utilisateur.photo_url,
          actif: utilisateur.actif
        },
        adresse_ip: req.ip
      });

      res.json({
        message: 'Utilisateur mis à jour avec succès',
        user: {
          id: utilisateur.id,
          email: utilisateur.email,
          nom: utilisateur.nom,
          prenom: utilisateur.prenom,
          role: utilisateur.role,
          telephone: utilisateur.telephone,
          photo_url: utilisateur.photo_url,
          actif: utilisateur.actif
        },
        code: 'USER_UPDATED'
      });

    } catch (error) {
      console.error('Erreur mise à jour utilisateur:', error);
      res.status(500).json({
        error: 'Erreur lors de la mise à jour de l\'utilisateur',
        code: 'USER_UPDATE_ERROR'
      });
    }
  },

  /**
   * Supprimer un utilisateur
   */
  deleteUser: async (req, res) => {
    try {
      const { id } = req.params;

      // Empêcher l'auto-suppression
      if (id === req.utilisateur.id) {
        return res.status(400).json({
          error: 'Vous ne pouvez pas supprimer votre propre compte',
          code: 'SELF_DELETION_NOT_ALLOWED'
        });
      }

      const whereClause = { id };

      // Pour les non-admins, restreindre à leur établissement
      if (!isAdminSystem(req.utilisateur)) {
        whereClause.etablissement_id = req.utilisateur.etablissement_id;
      }

      const utilisateur = await Utilisateur.findOne({
        where: whereClause
      });

      if (!utilisateur) {
        return res.status(404).json({
          error: 'Utilisateur non trouvé',
          code: 'USER_NOT_FOUND'
        });
      }

      // Sauvegarder les données pour le log
      const donneesUtilisateur = {
        email: utilisateur.email,
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        role: utilisateur.role
      };

      await utilisateur.destroy();

      // Journaliser la suppression
      await LogModification.create({
        utilisateur_id: req.utilisateur.id,
        table_concernee: 'utilisateurs',
        id_entite_concernee: id,
        type_operation: TypeOperation.SUPPRESSION,
        valeur_avant: donneesUtilisateur,
        valeur_apres: null,
        adresse_ip: req.ip
      });

      res.json({
        message: 'Utilisateur supprimé avec succès',
        code: 'USER_DELETED'
      });

    } catch (error) {
      console.error('Erreur suppression utilisateur:', error);
      res.status(500).json({
        error: 'Erreur lors de la suppression de l\'utilisateur',
        code: 'USER_DELETION_ERROR'
      });
    }
  },

  /**
   * Obtenir les statistiques des utilisateurs
   */
  getUserStats: async (req, res) => {
    try {
      const totalUsers = await Utilisateur.count({
        where: { etablissement_id: req.utilisateur.etablissement_id }
      });

      const usersByRole = await Utilisateur.findAll({
        where: { etablissement_id: req.utilisateur.etablissement_id },
        attributes: [
          'role',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['role']
      });

      const activeUsers = await Utilisateur.count({
        where: {
          etablissement_id: req.utilisateur.etablissement_id,
          actif: true
        }
      });

      const recentLogins = await LogConnexion.count({
        where: {
          date_heure: {
            [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 derniers jours
          }
        },
        include: [{
          association: 'utilisateur',
          where: { etablissement_id: req.utilisateur.etablissement_id }
        }]
      });

      res.json({
        stats: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
          by_role: usersByRole,
          recent_logins: recentLogins
        },
        code: 'USER_STATS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération statistiques:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques',
        code: 'USER_STATS_ERROR'
      });
    }
  },

  /**
   * Rechercher des utilisateurs pour le chat (accessible à tous)
   */
  searchUsers: async (req, res) => {
    try {
      const { q } = req.query;

      if (!q || q.length < 2) {
        return res.json({ users: [] });
      }

      const whereClause = {
        etablissement_id: req.utilisateur.etablissement_id,
        actif: true,
        id: { [Op.ne]: req.utilisateur.id }, // Exclure soi-même
        [Op.or]: [
          { nom: { [Op.like]: `%${q}%` } },
          { prenom: { [Op.like]: `%${q}%` } }
        ]
      };

      const users = await Utilisateur.findAll({
        where: whereClause,
        attributes: ['id', 'nom', 'prenom', 'photo_url', 'role'], // Info publique seulement
        limit: 20
      });

      res.json(users);
    } catch (error) {
      console.error('Erreur recherche utilisateurs:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },
  /**
   * Récupérer le répertoire complet (WhatsApp style)
   */
  getDirectory: async (req, res) => {
    try {
      // Pour les admins, on permet de spécifier l'établissement via query param, sinon on utilise celui du token
      const etablissementId = resolveScopedEtablissementId(req);

      console.log('DEBUG DIRECTORY: User ID:', req.utilisateur.id);
      console.log('DEBUG DIRECTORY: Resolved Etablissement ID:', etablissementId);

      if (!etablissementId) {
        return res.json({}); // Pas d'établissement sélectionné = liste vide
      }

      const users = await Utilisateur.findAll({
        where: {
          actif: true,
          id: { [Op.ne]: req.utilisateur.id },
          [Op.or]: [
            { etablissement_id: etablissementId },
            { '$directeur.etablissement_id$': etablissementId },
            { '$enseignant.etablissement_id$': etablissementId },
            { '$eleve.etablissement_id$': etablissementId },
            { '$responsablePedagogique.etablissement_id$': etablissementId }
          ]
        },
        include: [
          { association: 'directeur', required: false, attributes: ['id', 'etablissement_id'] },
          { association: 'enseignant', required: false, attributes: ['id', 'etablissement_id'] },
          { association: 'eleve', required: false, attributes: ['id', 'etablissement_id'] },
          { association: 'responsablePedagogique', required: false, attributes: ['id', 'etablissement_id'] }
        ],
        attributes: ['id', 'nom', 'prenom', 'photo_url', 'role'],
        order: [['role', 'ASC'], ['nom', 'ASC']]
      });

      console.log(`DEBUG DIRECTORY: Users for etab ${etablissementId}:`, users.length);
      users.forEach(u => console.log(` - colleague: ${u.nom} (${u.role})`));

      console.log('DEBUG DIRECTORY: Users found:', users.length);

      // Groupement par rôle pour l'affichage
      const grouped = users.reduce((acc, user) => {
        const role = user.role;
        if (!acc[role]) acc[role] = [];
        acc[role].push(user);
        return acc;
      }, {});

      res.json(grouped);
    } catch (error) {
      console.error('Erreur répertoire:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

module.exports = userController;