// controllers/salleController.js
const { Salle, Etablissement, Cours, CreneauCours } = require('../database/models');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { TypeSalle, StatutSalle, TypeOperation } = require('../utils/enums');
const { applyEtablissementScope, resolveScopedEtablissementId } = require('../utils/scope');

const salleController = {
  /**
   * Récupérer toutes les salles
   */
  getAllSalles: async (req, res) => {
    try {
      const { page = 1, limit = 100, type_salle, statut, search } = req.query;
      const offset = (page - 1) * limit;

      const scopedEtablissementId = resolveScopedEtablissementId(req);
      const whereClause = applyEtablissementScope(req, {});

      if (type_salle) {
        whereClause.type_salle = type_salle;
      }

      if (statut) {
        whereClause.statut = statut;
      }

      if (search) {
        whereClause[Op.or] = [
          { nom_salle: { [Op.like]: `%${search}%` } },
          { batiment: { [Op.like]: `%${search}%` } }
        ];
      }

      const { count, rows: salles } = await Salle.findAndCountAll({
        where: whereClause,
        include: [{
          association: 'etablissement',
          attributes: ['id', 'nom']
        }],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['batiment', 'ASC'], ['nom_salle', 'ASC']]
      });

      res.json({
        salles,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        code: 'RECUPERATION_SALLES_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur récupération salles:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des salles',
        code: 'RECUPERATION_SALLES_ERROR'
      });
    }
  },

  /**
   * Récupérer une salle par ID
   */
  getSalleById: async (req, res) => {
    try {
      const { id } = req.params;

      const salle = await Salle.findOne({
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
                association: 'matiere',
                attributes: ['id', 'nom_matiere', 'code_matiere']
              },
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
            association: 'creneaux',
            include: [
              {
                association: 'cours',
                attributes: ['id', 'type_cours']
              },
              {
                association: 'emploi_temps',
                attributes: ['id', 'nom_version']
              }
            ],
            limit: 10,
            order: [['created_at', 'DESC']]
          }
        ]
      });

      if (!salle) {
        return res.status(404).json({
          error: 'Salle non trouvée',
          code: 'SALLE_NOT_FOUND'
        });
      }

      res.json({
        salle,
        code: 'SALLE_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération salle:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération de la salle',
        code: 'RECUPERATION_SALLE_ERROR'
      });
    }
  },

  /**
   * Créer une nouvelle salle
   */
  createSalle: async (req, res) => {
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
        nom_salle,
        batiment,
        etage,
        type_salle,
        capacite,
        surface,
        accessibilite_pmr,
        statut
      } = req.body;

      // Vérifier si la salle existe déjà dans le même bâtiment
      const existingSalle = await Salle.findOne({
        where: applyEtablissementScope(req, { nom_salle, batiment })
      });

      if (existingSalle) {
        return res.status(409).json({
          error: 'Une salle avec ce nom existe déjà dans ce bâtiment',
          code: 'SALLE_ALREADY_EXISTS'
        });
      }

      const salle = await Salle.create({
        nom_salle,
        batiment,
        etage,
        type_salle,
        capacite,
        surface,
        accessibilite_pmr: accessibilite_pmr || false,
        statut: statut || StatutSalle.DISPONIBLE,
        etablissement_id: resolveScopedEtablissementId(req)
      });

      res.status(201).json({
        message: 'Salle créée avec succès',
        salle,
        code: 'SALLE_CREATED'
      });

    } catch (error) {
      console.error('Erreur création salle:', error);
      res.status(500).json({
        error: 'Erreur lors de la création de la salle',
        code: 'SALLE_CREATION_ERROR'
      });
    }
  },

  /**
   * Mettre à jour une salle
   */
  updateSalle: async (req, res) => {
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

      const salle = await Salle.findOne({
        where: {
          id,
          etablissement_id: req.utilisateur.etablissement_id
        }
      });

      if (!salle) {
        return res.status(404).json({
          error: 'Salle non trouvée',
          code: 'SALLE_NOT_FOUND'
        });
      }

      // Vérifier si le nouveau nom existe déjà (sauf pour cette salle)
      if (updates.nom_salle && updates.nom_salle !== salle.nom_salle) {
        const existingSalle = await Salle.findOne({
          where: {
            nom_salle: updates.nom_salle,
            batiment: updates.batiment || salle.batiment,
            etablissement_id: req.utilisateur.etablissement_id,
            id: { [Op.ne]: id }
          }
        });

        if (existingSalle) {
          return res.status(409).json({
            error: 'Une salle avec ce nom existe déjà dans ce bâtiment',
            code: 'SALLE_ALREADY_EXISTS'
          });
        }
      }

      await salle.update(updates);

      res.json({
        message: 'Salle mise à jour avec succès',
        salle,
        code: 'SALLE_UPDATED'
      });

    } catch (error) {
      console.error('Erreur mise à jour salle:', error);
      res.status(500).json({
        error: 'Erreur lors de la mise à jour de la salle',
        code: 'SALLE_UPDATE_ERROR'
      });
    }
  },

  /**
   * Mettre une salle en maintenance
   */
  setMaintenance: async (req, res) => {
    try {
      const { id } = req.params;

      const salle = await Salle.findOne({
        where: {
          id,
          etablissement_id: req.utilisateur.etablissement_id
        }
      });

      if (!salle) {
        return res.status(404).json({
          error: 'Salle non trouvée',
          code: 'SALLE_NOT_FOUND'
        });
      }

      await salle.mettreEnMaintenance();

      res.json({
        message: 'Salle mise en maintenance avec succès',
        salle,
        code: 'SALLE_MAINTENANCE_SET'
      });

    } catch (error) {
      console.error('Erreur mise en maintenance salle:', error);
      res.status(500).json({
        error: 'Erreur lors de la mise en maintenance de la salle',
        code: 'SALLE_MAINTENANCE_ERROR'
      });
    }
  },

  /**
   * Rendre une salle disponible
   */
  setDisponible: async (req, res) => {
    try {
      const { id } = req.params;

      const salle = await Salle.findOne({
        where: {
          id,
          etablissement_id: req.utilisateur.etablissement_id
        }
      });

      if (!salle) {
        return res.status(404).json({
          error: 'Salle non trouvée',
          code: 'SALLE_NOT_FOUND'
        });
      }

      await salle.rendreDisponible();

      res.json({
        message: 'Salle rendue disponible avec succès',
        salle,
        code: 'SALLE_AVAILABLE_SET'
      });

    } catch (error) {
      console.error('Erreur rendu disponible salle:', error);
      res.status(500).json({
        error: 'Erreur lors du rendu disponible de la salle',
        code: 'SALLE_AVAILABLE_ERROR'
      });
    }
  },

  /**
   * Vérifier la disponibilité d'une salle
   */
  checkDisponibilite: async (req, res) => {
    try {
      const { id } = req.params;
      const { jour_semaine, heure_debut, heure_fin, date } = req.body;

      const salle = await Salle.findOne({
        where: {
          id,
          etablissement_id: req.utilisateur.etablissement_id
        }
      });

      if (!salle) {
        return res.status(404).json({
          error: 'Salle non trouvée',
          code: 'SALLE_NOT_FOUND'
        });
      }

      if (!salle.estDisponible()) {
        return res.json({
          disponible: false,
          raison: `Salle ${salle.statut}`,
          code: 'SALLE_NOT_AVAILABLE'
        });
      }

      // Vérifier les conflits de créneaux
      const conflits = await CreneauCours.findAll({
        where: {
          salle_id: id,
          jour_semaine,
          [Op.or]: [
            {
              heure_debut: { [Op.between]: [heure_debut, heure_fin] }
            },
            {
              heure_fin: { [Op.between]: [heure_debut, heure_fin] }
            },
            {
              [Op.and]: [
                { heure_debut: { [Op.lte]: heure_debut } },
                { heure_fin: { [Op.gte]: heure_fin } }
              ]
            }
          ]
        },
        include: [{
          association: 'cours',
          attributes: ['id', 'type_cours']
        }]
      });

      const disponible = conflits.length === 0;

      res.json({
        disponible,
        conflits: disponible ? [] : conflits,
        salle: {
          id: salle.id,
          nom_salle: salle.nom_salle,
          capacite: salle.capacite,
          type_salle: salle.type_salle
        },
        code: disponible ? 'SALLE_AVAILABLE' : 'SALLE_OCCUPIED'
      });

    } catch (error) {
      console.error('Erreur vérification disponibilité:', error);
      res.status(500).json({
        error: 'Erreur lors de la vérification de la disponibilité',
        code: 'AVAILABILITY_CHECK_ERROR'
      });
    }
  },

  /**
   * Obtenir les statistiques d'une salle
   */
  getSalleStats: async (req, res) => {
    try {
      const { id } = req.params;

      const salle = await Salle.findOne({
        where: {
          id,
          etablissement_id: req.utilisateur.etablissement_id
        }
      });

      if (!salle) {
        return res.status(404).json({
          error: 'Salle non trouvée',
          code: 'SALLE_NOT_FOUND'
        });
      }

      const [
        totalCours,
        totalCreneaux,
        utilisationSemaine,
        occupationRate
      ] = await Promise.all([
        Cours.count({ where: { salle_id: id } }),
        CreneauCours.count({ where: { salle_id: id } }),
        CreneauCours.count({
          where: {
            salle_id: id,
            date_debut_validite: { [Op.gte]: new Date() }
          }
        }),
        // Calculer le taux d'occupation (simplifié)
        CreneauCours.count({
          where: {
            salle_id: id,
            statut: 'confirme'
          }
        })
      ]);

      res.json({
        stats: {
          nom_salle: salle.nom_salle,
          type_salle: salle.type_salle,
          capacite: salle.capacite,
          statut: salle.statut,
          total_cours: totalCours,
          total_creneaux: totalCreneaux,
          utilisation_semaine: utilisationSemaine,
          taux_occupation: totalCreneaux > 0 ? (occupationRate / totalCreneaux * 100).toFixed(2) : 0
        },
        code: 'RECUPERATION_SALLE_STATS_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur récupération statistiques salle:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques',
        code: 'RECUPERATION_SALLE_STATS_ERROR'
      });
    }
  }
};

module.exports = salleController;