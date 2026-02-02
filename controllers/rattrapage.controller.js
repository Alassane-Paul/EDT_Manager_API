// controllers/rattrapageController.js
const { Rattrapage, Cours, CreneauCours, Enseignant } = require('../database/models');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { TypeRattrapage, StatutRattrapage, TypeOperation } = require('../utils/enums');
const NotificationService = require('../services/notification.service');
const { resolveScopedEtablissementId } = require('../utils/scope');
const { sequelize } = require('../config/database');

const resolveEnseignantIdFromUser = async (utilisateur) => {
  if (!utilisateur || utilisateur.role !== 'enseignant') return null;
  if (utilisateur.enseignant_id) return utilisateur.enseignant_id;

  const enseignant = await Enseignant.findOne({
    where: { utilisateur_id: utilisateur.id },
    attributes: ['id']
  });

  if (enseignant) {
    utilisateur.enseignant_id = enseignant.id;
    return enseignant.id;
  }
  return null;
};

const rattrapageController = {
  /**
   * Récupérer tous les rattrapages
   */
  getAllRattrapages: async (req, res) => {
    try {
      const { page = 1, limit = 100, type_rattrapage, statut, search, enseignant_id } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {};

      const scopedEtablissementId = resolveScopedEtablissementId(req);
      const selfEnseignantId = await resolveEnseignantIdFromUser(req.utilisateur);

      // Filtrer par établissement via les relations
      const includeClause = [
        {
          association: 'cours',
          where: {}, // Initialize empty where for cours
          include: [{
            association: 'classe',
            where: { etablissement_id: scopedEtablissementId },
            attributes: ['id', 'nom_classe']
          },
          {
            association: 'matiere',
            attributes: ['id', 'nom_matiere', 'code_matiere', 'couleur_affichage']
          }]
        }
      ];

      // Filtrage par enseignant (soit soi-même, soit filtre admin)
      if (selfEnseignantId) {
        includeClause[0].where.enseignant_id = selfEnseignantId;
      } else if (enseignant_id) {
        includeClause[0].where.enseignant_id = enseignant_id;
      }

      if (type_rattrapage) {
        whereClause.type_rattrapage = type_rattrapage;
      }

      if (statut) {
        whereClause.statut = statut;
      }

      if (search) {
        includeClause[0].include[0].where = {
          ...includeClause[0].include[0].where,
          nom_classe: { [Op.like]: `%${search}%` }
        };
      }

      const { count, rows: rattrapages } = await Rattrapage.findAndCountAll({
        where: whereClause,
        include: includeClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['date_demande', 'DESC']]
      });

      res.json({
        rattrapages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        code: 'MAKEUP_SESSIONS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération rattrapages:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des rattrapages',
        code: 'MAKEUP_SESSIONS_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Récupérer un rattrapage par ID
   */
  getRattrapageById: async (req, res) => {
    try {
      const { id } = req.params;

      const scopedEtablissementId = resolveScopedEtablissementId(req);

      const rattrapage = await Rattrapage.findOne({
        where: { id },
        include: [
          {
            association: 'cours',
            include: [
              {
                association: 'classe',
                where: { etablissement_id: scopedEtablissementId },
                attributes: ['id', 'nom_classe', 'niveau']
              },
              {
                association: 'matiere',
                attributes: ['id', 'nom_matiere', 'code_matiere']
              },
              {
                association: 'enseignant',
                include: [{
                  association: 'utilisateur',
                  attributes: ['id', 'nom', 'prenom']
                }]
              }
            ]
          },
          {
            association: 'creneau_planifie',
            include: [
              {
                association: 'salle',
                attributes: ['id', 'nom_salle', 'batiment']
              },
              {
                association: 'emploi_temps',
                attributes: ['id', 'nom_version']
              }
            ]
          }
        ]
      });

      if (!rattrapage) {
        return res.status(404).json({
          error: 'Rattrapage non trouvé',
          code: 'MAKEUP_SESSION_NOT_FOUND'
        });
      }

      res.json({
        rattrapage,
        code: 'MAKEUP_SESSION_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération rattrapage:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération du rattrapage',
        code: 'MAKEUP_SESSION_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Créer une nouvelle demande de rattrapage
   */
  createRattrapage: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Données invalides',
          details: errors.array(),
          code: 'VALIDATION_ERROR'
        });
      }

      const {
        cours_id,
        type_rattrapage,
        duree,
        eleves_concernes,
        motif,
        periode_souhaitee_debut,
        periode_souhaitee_fin
      } = req.body;

      // Vérifier que le cours appartient à l'établissement
      const scopedEtablissementId = resolveScopedEtablissementId(req);

      const cours = await Cours.findOne({
        where: { id: cours_id },
        include: [{
          association: 'classe',
          where: { etablissement_id: scopedEtablissementId }
        }]
      });

      if (!cours) {
        return res.status(404).json({
          error: 'Cours non trouvé',
          code: 'COURS_NOT_FOUND'
        });
      }

      const rattrapage = await Rattrapage.create({
        cours_id,
        type_rattrapage,
        duree,
        eleves_concernes,
        motif,
        periode_souhaitee_debut,
        periode_souhaitee_fin,
        statut: StatutRattrapage.DEMANDE
      });

      // Notifier les administrateurs et responsables pédagogiques
      try {
        const rattrapageFull = await Rattrapage.findByPk(rattrapage.id, {
          include: [{
            association: 'cours',
            include: [
              { association: 'matiere' },
              {
                association: 'classe',
                attributes: ['id', 'etablissement_id']
              },
              {
                association: 'enseignant',
                include: [{ association: 'utilisateur' }]
              }
            ]
          }]
        });

        await NotificationService.notifierNouveauRattrapage(rattrapageFull, req.io);
      } catch (notifyError) {
        console.error('Erreur notification création rattrapage:', notifyError);
      }

      res.status(201).json({
        message: 'Demande de rattrapage créée avec succès',
        rattrapage,
        code: 'MAKEUP_SESSION_CREATED'
      });

    } catch (error) {
      console.error('Erreur création rattrapage:', error);
      res.status(500).json({
        error: 'Erreur lors de la création du rattrapage',
        code: 'MAKEUP_SESSION_CREATION_ERROR'
      });
    }
  },

  /**
   * Planifier un rattrapage
   */
  planifierRattrapage: async (req, res) => {
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
      const { creneau_id } = req.body;

      const rattrapage = await Rattrapage.findOne({
        where: { id },
        include: [{
          association: 'cours',
          include: [{
            association: 'classe',
            where: { etablissement_id: req.utilisateur.etablissement_id }
          }]
        }]
      });

      if (!rattrapage) {
        return res.status(404).json({
          error: 'Rattrapage non trouvé',
          code: 'MAKEUP_SESSION_NOT_FOUND'
        });
      }

      // Vérifier que le créneau existe et appartient à l'établissement
      const creneau = await CreneauCours.findOne({
        where: { id: creneau_id },
        include: [{
          association: 'emploi_temps',
          where: { etablissement_id: req.utilisateur.etablissement_id }
        }]
      });

      if (!creneau) {
        return res.status(404).json({
          error: 'Créneau non trouvé',
          code: 'TIME_SLOT_NOT_FOUND'
        });
      }

      await rattrapage.planifier(creneau_id);

      // Notifier l'enseignant et les élèves
      try {
        const rattrapageFull = await Rattrapage.findByPk(rattrapage.id, {
          include: [
            {
              association: 'cours',
              include: [
                { association: 'matiere' },
                { association: 'classe', include: [{ association: 'eleves', include: [{ association: 'utilisateur' }] }] },
                { association: 'enseignant', include: [{ association: 'utilisateur' }] }
              ]
            },
            { association: 'creneau_planifie' }
          ]
        });

        // 1. Notification à l'enseignant
        await NotificationService.creerNotification({
          utilisateur_id: rattrapageFull.cours.enseignant.utilisateur.id,
          type: 'rattrapage',
          titre: 'Rattrapage planifié',
          message: `Votre rattrapage pour ${rattrapageFull.cours.matiere.nom_matiere} a été planifié le ${rattrapageFull.creneau_planifie.jour_semaine} à ${rattrapageFull.creneau_planifie.heure_debut}.`,
          lien_action: `/enseignant/rattrapages`,
          canal: 'tous',
          io: req.io
        });

        // 2. Notifications aux élèves de la classe
        if (rattrapageFull.cours.classe.eleves) {
          for (const eleve of rattrapageFull.cours.classe.eleves) {
            await NotificationService.creerNotification({
              utilisateur_id: eleve.utilisateur_id,
              type: 'rattrapage',
              titre: 'Nouveau cours de rattrapage',
              message: `Un cours de rattrapage de ${rattrapageFull.cours.matiere.nom_matiere} est prévu le ${rattrapageFull.creneau_planifie.jour_semaine} à ${rattrapageFull.creneau_planifie.heure_debut}.`,
              lien_action: `/etudiant/cours`,
              canal: 'in_app',
              io: req.io
            });
          }
        }
      } catch (notifyError) {
        console.error('Erreur notification planification rattrapage:', notifyError);
      }

      res.json({
        message: 'Rattrapage planifié avec succès',
        rattrapage,
        code: 'MAKEUP_SESSION_SCHEDULED'
      });

    } catch (error) {
      console.error('Erreur planification rattrapage:', error);
      res.status(500).json({
        error: 'Erreur lors de la planification du rattrapage',
        code: 'MAKEUP_SESSION_SCHEDULING_ERROR'
      });
    }
  },

  /**
   * Marquer un rattrapage comme réalisé
   */
  marquerRealise: async (req, res) => {
    try {
      const { id } = req.params;

      const rattrapage = await Rattrapage.findOne({
        where: { id },
        include: [{
          association: 'cours',
          include: [{
            association: 'classe',
            where: { etablissement_id: req.utilisateur.etablissement_id }
          }]
        }]
      });

      if (!rattrapage) {
        return res.status(404).json({
          error: 'Rattrapage non trouvé',
          code: 'MAKEUP_SESSION_NOT_FOUND'
        });
      }

      await rattrapage.marquerRealise();

      res.json({
        message: 'Rattrapage marqué comme réalisé',
        rattrapage,
        code: 'MAKEUP_SESSION_COMPLETED'
      });

    } catch (error) {
      console.error('Erreur marquage rattrapage réalisé:', error);
      res.status(500).json({
        error: 'Erreur lors du marquage du rattrapage comme réalisé',
        code: 'MAKEUP_SESSION_COMPLETION_ERROR'
      });
    }
  },

  /**
   * Valider une demande de rattrapage (Administration)
   */
  validerRattrapage: async (req, res) => {
    try {
      const { id } = req.params;

      const rattrapage = await Rattrapage.findOne({
        where: { id },
        include: [{
          association: 'cours',
          include: [{
            association: 'classe',
            where: { etablissement_id: req.utilisateur.etablissement_id }
          },
          {
            association: 'enseignant',
            include: [{ association: 'utilisateur' }]
          },
          { association: 'matiere' }]
        }]
      });

      if (!rattrapage) {
        return res.status(404).json({
          error: 'Rattrapage non trouvé',
          code: 'MAKEUP_SESSION_NOT_FOUND'
        });
      }

      await rattrapage.valider();

      // Notifier l'enseignant
      try {
        await NotificationService.creerNotification({
          utilisateur_id: rattrapage.cours.enseignant.utilisateur.id,
          type: 'rattrapage',
          titre: 'Demande de rattrapage validée',
          message: `Votre demande de rattrapage pour ${rattrapage.cours.matiere.nom_matiere} a été validée par l'administration. Elle peut maintenant être planifiée.`,
          lien_action: `/enseignant/rattrapages`,
          canal: 'tous',
          io: req.io
        });
      } catch (notifyError) {
        console.error('Erreur notification validation rattrapage:', notifyError);
      }

      res.json({
        message: 'Demande de rattrapage validée',
        rattrapage,
        code: 'MAKEUP_SESSION_VALIDATED'
      });

    } catch (error) {
      console.error('Erreur validation rattrapage:', error);
      res.status(500).json({
        error: 'Erreur lors de la validation du rattrapage',
        code: 'MAKEUP_SESSION_VALIDATION_ERROR'
      });
    }
  },

  /**
   * Rejeter une demande de rattrapage (Administration)
   */
  rejeterRattrapage: async (req, res) => {
    try {
      const { id } = req.params;
      const { motif } = req.body;

      const rattrapage = await Rattrapage.findOne({
        where: { id },
        include: [{
          association: 'cours',
          include: [{
            association: 'classe',
            where: { etablissement_id: req.utilisateur.etablissement_id }
          },
          {
            association: 'enseignant',
            include: [{ association: 'utilisateur' }]
          },
          { association: 'matiere' }]
        }]
      });

      if (!rattrapage) {
        return res.status(404).json({
          error: 'Rattrapage non trouvé',
          code: 'MAKEUP_SESSION_NOT_FOUND'
        });
      }

      await rattrapage.rejeter(motif);

      // Notifier l'enseignant
      try {
        await NotificationService.creerNotification({
          utilisateur_id: rattrapage.cours.enseignant.utilisateur.id,
          type: 'rattrapage',
          titre: 'Demande de rattrapage rejetée',
          message: `Votre demande de rattrapage pour ${rattrapage.cours.matiere.nom_matiere} a été rejetée par l'administration.${motif ? ' Motif: ' + motif : ''}`,
          lien_action: `/enseignant/rattrapages`,
          canal: 'tous',
          io: req.io
        });
      } catch (notifyError) {
        console.error('Erreur notification rejet rattrapage:', notifyError);
      }

      res.json({
        message: 'Demande de rattrapage rejetée',
        rattrapage,
        code: 'MAKEUP_SESSION_REJECTED'
      });

    } catch (error) {
      console.error('Erreur rejet rattrapage:', error);
      res.status(500).json({
        error: 'Erreur lors du rejet du rattrapage',
        code: 'MAKEUP_SESSION_REJECTION_ERROR'
      });
    }
  },

  /**
   * Annuler un rattrapage
   */
  annulerRattrapage: async (req, res) => {
    try {
      const { id } = req.params;
      const { raison } = req.body;

      const rattrapage = await Rattrapage.findOne({
        where: { id },
        include: [{
          association: 'cours',
          include: [{
            association: 'classe',
            where: { etablissement_id: req.utilisateur.etablissement_id }
          }]
        }]
      });

      if (!rattrapage) {
        return res.status(404).json({
          error: 'Rattrapage non trouvé',
          code: 'MAKEUP_SESSION_NOT_FOUND'
        });
      }

      if (raison) {
        rattrapage.motif += ` [Annulé: ${raison}]`;
        await rattrapage.save();
      }

      await rattrapage.annuler();

      res.json({
        message: 'Rattrapage annulé avec succès',
        rattrapage,
        code: 'MAKEUP_SESSION_CANCELLED'
      });

    } catch (error) {
      console.error('Erreur annulation rattrapage:', error);
      res.status(500).json({
        error: 'Erreur lors de l\'annulation du rattrapage',
        code: 'MAKEUP_SESSION_CANCELLATION_ERROR'
      });
    }
  },

  /**
   * Obtenir les rattrapages urgents
   */
  getRattrapagesUrgents: async (req, res) => {
    try {
      const rattrapages = await Rattrapage.findAll({
        where: {
          statut: StatutRattrapage.DEMANDE,
          date_demande: {
            [Op.lte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Plus de 7 jours
          }
        },
        include: [
          {
            association: 'cours',
            include: [
              {
                association: 'classe',
                where: { etablissement_id: req.utilisateur.etablissement_id },
                attributes: ['id', 'nom_classe']
              },
              {
                association: 'matiere',
                attributes: ['id', 'nom_matiere']
              }
            ]
          }
        ],
        order: [['date_demande', 'ASC']],
        limit: 20
      });

      res.json({
        rattrapages_urgents: rattrapages,
        total: rattrapages.length,
        code: 'URGENT_MAKEUP_SESSIONS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération rattrapages urgents:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des rattrapages urgents',
        code: 'URGENT_MAKEUP_SESSIONS_ERROR'
      });
    }
  },

  /**
   * Obtenir les statistiques des rattrapages
   */
  getRattrapageStats: async (req, res) => {
    try {
      const { periode_debut, periode_fin } = req.query;

      const whereClause = {};

      if (periode_debut && periode_fin) {
        whereClause.date_demande = {
          [Op.between]: [periode_debut, periode_fin]
        };
      }

      const stats = await Rattrapage.findAll({
        where: whereClause,
        include: [{
          association: 'cours',
          include: [{
            association: 'classe',
            where: { etablissement_id: req.utilisateur.etablissement_id }
          }]
        }],
        attributes: [
          'type_rattrapage',
          'statut',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['type_rattrapage', 'statut']
      });

      const total = await Rattrapage.count({
        where: whereClause,
        include: [{
          association: 'cours',
          include: [{
            association: 'classe',
            where: { etablissement_id: req.utilisateur.etablissement_id }
          }]
        }]
      });

      const realises = await Rattrapage.count({
        where: {
          ...whereClause,
          statut: StatutRattrapage.REALISE
        },
        include: [{
          association: 'cours',
          include: [{
            association: 'classe',
            where: { etablissement_id: req.utilisateur.etablissement_id }
          }]
        }]
      });

      res.json({
        stats: {
          total,
          realises,
          taux_realisation: total > 0 ? ((realises / total) * 100).toFixed(2) : 0,
          par_type_statut: stats
        },
        code: 'MAKEUP_SESSIONS_STATS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération statistiques rattrapages:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques',
        code: 'MAKEUP_SESSIONS_STATS_ERROR'
      });
    }
  }
};

module.exports = rattrapageController;