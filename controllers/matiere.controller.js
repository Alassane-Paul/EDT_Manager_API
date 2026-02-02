// controllers/matiereController.js
const { Matiere, Etablissement, Cours, Enseignant } = require('../database/models');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { CategorieMatiere, TypeCours, TypeOperation } = require('../utils/enums');
const { applyEtablissementScope, resolveScopedEtablissementId } = require('../utils/scope');

const matiereController = {
  /**
   * Récupérer toutes les matières
   */
  getAllMatieres: async (req, res) => {
    try {
      const { page = 1, limit = 100, categorie, type_cours, search } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = applyEtablissementScope(req, {});

      if (categorie) {
        whereClause.categorie = categorie;
      }

      if (type_cours) {
        whereClause.type_cours = type_cours;
      }

      if (search) {
        whereClause[Op.or] = [
          { nom_matiere: { [Op.like]: `%${search}%` } },
          { code_matiere: { [Op.like]: `%${search}%` } }
        ];
      }

      const { count, rows: matieres } = await Matiere.findAndCountAll({
        where: whereClause,
        include: [{
          association: 'etablissement',
          attributes: ['id', 'nom']
        }],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['nom_matiere', 'ASC']]
      });

      res.json({
        matieres,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        code: 'RECUPERATION_MATIERES_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur récupération matières:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des matières',
        code: 'RECUPERATION_MATIERES_ERROR'
      });
    }
  },

  /**
   * Récupérer une matière par ID
   */
  getMatiereById: async (req, res) => {
    try {
      const { id } = req.params;

      const matiere = await Matiere.findOne({
        where: applyEtablissementScope(req, { id }),
        include: [
          {
            association: 'etablissement',
            attributes: ['id', 'nom']
          },
          {
            association: 'cours',
            include: [
              {
                association: 'classe',
                attributes: ['id', 'nom_classe', 'niveau']
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
            association: 'enseignants',
            through: { attributes: [] },
            include: [{
              association: 'utilisateur',
              attributes: ['id', 'nom', 'prenom']
            }]
          }
        ]
      });

      if (!matiere) {
        return res.status(404).json({
          error: 'Matière non trouvée',
          code: 'MATIERE_NOT_FOUND'
        });
      }

      res.json({
        matiere,
        code: 'RECUPERATION_MATIERE_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur récupération matière:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération de la matière',
        code: 'RECUPERATION_MATIERES_ERROR'
      });
    }
  },

  /**
   * Créer une nouvelle matière
   */
  createMatiere: async (req, res) => {
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
        nom_matiere,
        code_matiere,
        categorie,
        coefficient,
        couleur_affichage,
        type_cours,
        duree_standard,
        volume_horaire_hebdo,
        necessite_equipement_special,
        peut_etre_en_ligne
      } = req.body;

      const scopedEtablissementId = resolveScopedEtablissementId(req);
      if (!scopedEtablissementId) {
        return res.status(400).json({
          error: 'Établissement requis pour créer une matière',
          code: 'ESTABLISSEMENT_REQUIRED'
        });
      }

      // Vérifier si le code matière existe déjà
      const existingMatiere = await Matiere.findOne({
        where: applyEtablissementScope(req, {
          code_matiere: code_matiere.toUpperCase()
        })
      });

      if (existingMatiere) {
        return res.status(409).json({
          error: 'Une matière avec ce code existe déjà',
          code: 'MATIERE_CODE_EXISTS'
        });
      }

      const matiere = await Matiere.create({
        nom_matiere,
        code_matiere: code_matiere.toUpperCase(),
        categorie,
        coefficient: coefficient || 1.0,
        couleur_affichage: couleur_affichage || '#3B82F6',
        type_cours,
        duree_standard,
        volume_horaire_hebdo,
        necessite_equipement_special: necessite_equipement_special || false,
        peut_etre_en_ligne: peut_etre_en_ligne || false,
        etablissement_id: scopedEtablissementId
      });

      res.status(201).json({
        message: 'Matière créée avec succès',
        matiere,
        code: 'MATIERE_CREATED'
      });

    } catch (error) {
      console.error('Erreur création matière:', error);
      res.status(500).json({
        error: 'Erreur lors de la création de la matière',
        code: 'MATIERE_CREATION_ERROR'
      });
    }
  },

  /**
   * Mettre à jour une matière
   */
  updateMatiere: async (req, res) => {
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
      const updates = req.body;

      // Si code_matiere est fourni, le mettre en majuscules
      if (updates.code_matiere) {
        updates.code_matiere = updates.code_matiere.toUpperCase();
      }

      const matiere = await Matiere.findOne({
        where: applyEtablissementScope(req, { id })
      });

      if (!matiere) {
        return res.status(404).json({
          error: 'Matière non trouvée',
          code: 'MATIERE_NOT_FOUND'
        });
      }

      // Vérifier si le nouveau code existe déjà (sauf pour cette matière)
      if (updates.code_matiere && updates.code_matiere !== matiere.code_matiere) {
        const existingMatiere = await Matiere.findOne({
          where: {
            code_matiere: updates.code_matiere,
            etablissement_id: matiere.etablissement_id,
            id: { [Op.ne]: id }
          }
        });

        if (existingMatiere) {
          return res.status(409).json({
            error: 'Une matière avec ce code existe déjà',
            code: 'MATIERE_CODE_EXISTS'
          });
        }
      }

      await matiere.update(updates);

      res.json({
        message: 'Matière mise à jour avec succès',
        matiere,
        code: 'MATIERE_UPDATED'
      });

    } catch (error) {
      console.error('Erreur mise à jour matière:', error);
      res.status(500).json({
        error: 'Erreur lors de la mise à jour de la matière',
        code: 'MATIERE_UPDATE_ERROR'
      });
    }
  },

  /**
   * Associer des enseignants à une matière
   */
  assignEnseignants: async (req, res) => {
    try {
      const { id } = req.params;
      const { enseignant_ids } = req.body;

      const matiere = await Matiere.findOne({
        where: applyEtablissementScope(req, { id })
      });

      if (!matiere) {
        return res.status(404).json({
          error: 'Matière non trouvée',
          code: 'MATIERE_NOT_FOUND'
        });
      }

      // Vérifier que tous les enseignants existent dans le même établissement
      const enseignants = await Enseignant.findAll({
        where: {
          id: enseignant_ids,
          etablissement_id: matiere.etablissement_id
        }
      });

      if (enseignants.length !== enseignant_ids.length) {
        return res.status(404).json({
          error: 'Un ou plusieurs enseignants non trouvés',
          code: 'TEACHERS_NOT_FOUND'
        });
      }

      await matiere.setEnseignants(enseignants);

      res.json({
        message: 'Enseignants associés à la matière avec succès',
        code: 'TEACHERS_ASSIGNED'
      });

    } catch (error) {
      console.error('Erreur association enseignants:', error);
      res.status(500).json({
        error: 'Erreur lors de l\'association des enseignants',
        code: 'TEACHERS_ASSIGNMENT_ERROR'
      });
    }
  },

  /**
   * Obtenir les statistiques d'une matière
   */
  getMatiereStats: async (req, res) => {
    try {
      const { id } = req.params;

      const matiere = await Matiere.findOne({
        where: applyEtablissementScope(req, { id })
      });

      if (!matiere) {
        return res.status(404).json({
          error: 'Matière non trouvée',
          code: 'MATIERE_NOT_FOUND'
        });
      }

      const [
        totalCours,
        totalEnseignants,
        totalClasses,
        totalHeures
      ] = await Promise.all([
        Cours.count({ where: { matiere_id: id } }),
        matiere.countEnseignants(),
        Cours.count({
          where: { matiere_id: id },
          distinct: true,
          col: 'classe_id'
        }),
        Cours.sum('volume_horaire_hebdo', { where: { matiere_id: id } })
      ]);

      res.json({
        stats: {
          total_cours: totalCours,
          total_enseignants: totalEnseignants,
          total_classes: totalClasses,
          total_heures_hebdo: totalHeures || 0,
          coefficient: matiere.coefficient,
          duree_standard: matiere.duree_standard
        },
        code: 'RECUPERATION_MATIERE_STATS_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur récupération statistiques matière:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques',
        code: 'RECUPERATION_MATIERE_STATS_ERROR'
      });
    }
  }
};

module.exports = matiereController;