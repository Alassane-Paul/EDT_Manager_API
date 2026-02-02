// controllers/etablissementController.js
const { Etablissement, Utilisateur, Classe, Enseignant, Salle, Matiere } = require('../database/models');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { TypeEtablissement, StatutClasse, TypeOperation } = require('../utils/enums');

const etablissementController = {
  /**
   * Récupérer tous les établissements (admin seulement)
   */
  getAllEtablissements: async (req, res) => {
    try {
      const { page = 1, limit = 100, type, statut, search } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {};

      if (type) {
        whereClause.type = type;
      }

      if (statut) {
        whereClause.statut = statut;
      }

      if (search) {
        whereClause[Op.or] = [
          { nom: { [Op.like]: `%${search}%` } },
          { ville: { [Op.like]: `%${search}%` } }
        ];
      }

      const { count, rows: etablissements } = await Etablissement.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['nom', 'ASC']]
      });

      res.json({
        etablissements,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        code: 'RECUPERATION_ETABLISSEMENT_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur récupération établissements:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des établissements',
        message: error.message,
        details: error.stack,
        code: 'RECUPERATION_ETABLISSEMENT_ERROR'
      });
    }

  },

  /**
   * Récupérer un établissement par ID
   */
  getEtablissementById: async (req, res) => {
    try {
      const { id } = req.params;

      const etablissement = await Etablissement.findByPk(id, {
        include: [
          {
            association: 'utilisateurs',
            attributes: ['id', 'nom', 'prenom', 'email', 'role'],
            limit: 5
          }
        ]
      });

      if (!etablissement) {
        return res.status(404).json({
          error: 'Établissement non trouvé',
          code: 'ETABLISSEMENT_NOT_FOUND'
        });
      }

      res.json({
        etablissement,
        code: 'RECUPERATION_ETABLISSEMENT_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur récupération établissement:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération de l\'établissement',
        message: error.message,
        details: error.stack,
        code: 'RECUPERATION_ETABLISSEMENT_ERROR'
      });
    }

  },

  /**
   * Créer un nouvel établissement
   */
  createEtablissement: async (req, res) => {
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
        nom,
        type,
        adresse,
        ville,
        code_postal,
        telephone,
        email,
        site_web,
        fuseau_horaire,
        langue,
        annee_scolaire_courante,
        statut,
        logo_url
      } = req.body;

      const etablissement = await Etablissement.create({
        nom,
        type,
        adresse,
        ville,
        code_postal,
        telephone,
        email,
        site_web,
        fuseau_horaire: fuseau_horaire || 'TOGO/Lomé',
        langue: langue || 'fr',
        annee_scolaire_courante,
        statut: statut || 'active',
        logo_url,
        heure_debut_journee: req.body.heure_debut_journee || '08:00',
        heure_fin_journee: req.body.heure_fin_journee || '18:00',
        duree_cours_standard: req.body.duree_cours_standard || 60
      });
      // this.createSubcriptionRecord(etablissement.id, TypeOperation.CREATION_ETABLISSEMENT);
      res.status(201).json({
        message: 'Établissement créé avec succès',
        etablissement,
        code: 'ETABLISSEMENT_CREATED'
      });

    } catch (error) {
      console.error('Erreur création établissement:', error);
      res.status(500).json({
        error: `Erreur lors de la création de l\'établissement`,
        message: error.message,
        details: error.stack,
        code: 'ETABLISSEMENT_CREATION_ERROR'
      });
    }

  },

  /**
   * Mettre à jour un établissement
   */
  updateEtablissement: async (req, res) => {
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
      let updates = req.body;

      const etablissement = await Etablissement.findByPk(id);

      if (!etablissement) {
        return res.status(404).json({
          error: 'Établissement non trouvé',
          code: 'ETABLISSEMENT_NOT_FOUND'
        });
      }

      // Assurer que statut est toujours présent s'il est fourni
      if (updates.statut === undefined) {
        updates = { ...updates, statut: etablissement.statut };
      }

      await etablissement.update(updates);

      res.json({
        message: 'Établissement mis à jour avec succès',
        etablissement,
        code: 'ETABLISSEMENT_UPDATED'
      });

    } catch (error) {
      console.error('Erreur mise à jour établissement:', error);
      res.status(500).json({
        error: 'Erreur lors de la mise à jour de l\'établissement',
        message: error.message,
        details: error.stack,
        code: 'ETABLISSEMENT_UPDATE_ERROR'
      });
    }

  },

  /**
   * Générer un nouveau code d'accès
   */
  generateNewAccessCode: async (req, res) => {
    try {
      const { id } = req.params;

      const etablissement = await Etablissement.findByPk(id);

      if (!etablissement) {
        return res.status(404).json({
          error: 'Établissement non trouvé',
          code: 'ETABLISSEMENT_NOT_FOUND'
        });
      }

      const newCode = etablissement.generateNewAccessCode();
      await etablissement.save();

      res.json({
        message: 'Nouveau code d\'accès généré avec succès',
        code_acces: newCode,
        code: 'ACCESS_CODE_REGENERATED'
      });

    } catch (error) {
      console.error('Erreur génération code accès:', error);
      res.status(500).json({
        error: 'Erreur lors de la génération du code d\'accès',
        message: error.message,
        details: error.stack,
        code: 'ACCESS_CODE_GENERATION_ERROR'
      });
    }

  },

  /**
   * Obtenir les statistiques d'un établissement
   */
  getEtablissementStats: async (req, res) => {
    try {
      const { id } = req.params;

      const etablissement = await Etablissement.findByPk(id);
      if (!etablissement) {
        return res.status(404).json({
          error: 'Établissement non trouvé',
          code: 'ETABLISSEMENT_NOT_FOUND'
        });
      }

      const [
        totalUsers,
        totalClasses,
        totalEnseignants,
        totalSalles,
        totalMatieres,
        activeClasses,
        activeEnseignants
      ] = await Promise.all([
        Utilisateur.count({ where: { etablissement_id: id } }),
        Classe.count({ where: { etablissement_id: id } }),
        Enseignant.count({ where: { etablissement_id: id } }),
        Salle.count({ where: { etablissement_id: id } }),
        Matiere.count({ where: { etablissement_id: id } }),
        Classe.count({ where: { etablissement_id: id, statut: StatutClasse.ACTIVE } }),
        Enseignant.count({ where: { etablissement_id: id, statut: 'ACTIF' } })
      ]);

      res.json({
        stats: {
          total_users: totalUsers,
          total_classes: totalClasses,
          total_enseignants: totalEnseignants,
          total_salles: totalSalles,
          total_matieres: totalMatieres,
          active_classes: activeClasses,
          active_enseignants: activeEnseignants
        },
        code: 'RECUPERATION_ETABLISSEMENT_STATS_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur récupération statistiques établissement:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques',
        code: 'RECUPERATION_ETABLISSEMENT_STATS_ERROR'
      });
    }
  }
};

module.exports = etablissementController;