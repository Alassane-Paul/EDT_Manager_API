// controllers/enseignantController.js
const { Enseignant, Utilisateur, Cours, Disponibilite, Matiere, CreneauCours, LogModification } = require('../database/models');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { StatutProfessionnel, PreferenceHoraire, TypeOperation, RoleUtilisateur } = require('../utils/enums');

const isAdminSystem = (utilisateur = {}) => utilisateur.role === RoleUtilisateur.ADMIN;

const resolveScopedEtablissementId = (req) => {
  const fromQuery = req.query?.etablissement_id;
  const fromBody = req.body?.etablissement_id;
  if (isAdminSystem(req.utilisateur)) {
    return fromQuery || fromBody || req.utilisateur?.etablissement_id || null;
  }
  return req.utilisateur?.etablissement_id || null;
};

const applyEtablissementScope = (req, baseWhere = {}) => {
  const scopedId = resolveScopedEtablissementId(req);
  if (!isAdminSystem(req.utilisateur)) {
    return { ...baseWhere, etablissement_id: scopedId };
  }
  // Admin système : scoper si un id est fourni, sinon global
  if (scopedId) {
    return { ...baseWhere, etablissement_id: scopedId };
  }
  return baseWhere;
};

const enseignantController = {
  /**
   * Récupérer tous les enseignants
   */
  getAllEnseignants: async (req, res) => {
    try {
      const { page = 1, limit = 100, statut, search } = req.query;
      const offset = (page - 1) * limit;
      const scopedEtablissementId = resolveScopedEtablissementId(req);

      if (!isAdminSystem(req.utilisateur) && !scopedEtablissementId) {
        return res.status(403).json({
          error: 'Établissement requis pour lister les enseignants',
          code: 'ESTABLISSEMENT_SCOPE_REQUIRED'
        });
      }
      const whereClause = applyEtablissementScope(req, {});

      if (statut) {
        whereClause.statut = statut;
      }

      if (search) {
        whereClause[Op.or] = [
          { '$utilisateur.nom$': { [Op.like]: `%${search}%` } },
          { '$utilisateur.prenom$': { [Op.like]: `%${search}%` } },
          { matricule: { [Op.like]: `%${search}%` } }
        ];
      }

      const { count, rows: enseignants } = await Enseignant.findAndCountAll({
        where: whereClause,
        include: [
          {
            association: 'utilisateur',
            attributes: ['id', 'nom', 'prenom', 'email', 'telephone']
          },
          {
            association: 'etablissement',
            attributes: ['id', 'nom']
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      res.json({
        enseignants,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        code: 'RECUPERATION_TEACHERS_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur récupération enseignants:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des enseignants',
        code: 'RECUPERATION_TEACHERS_ERROR'
      });
    }
  },

  /**
   * Récupérer un enseignant par ID
   */
  getEnseignantById: async (req, res) => {
    try {
      const { id } = req.params;

      const enseignant = await Enseignant.findOne({
        where: applyEtablissementScope(req, { id }),
        include: [
          {
            association: 'utilisateur',
            attributes: ['id', 'nom', 'prenom', 'email', 'telephone', 'photo_url']
          },
          {
            association: 'etablissement',
            attributes: ['id', 'nom']
          },
          {
            association: 'cours',
            include: [
              {
                association: 'matiere',
                attributes: ['id', 'nom_matiere', 'code_matiere', 'couleur_affichage']
              },
              {
                association: 'classe',
                attributes: ['id', 'nom_classe', 'niveau']
              }
            ]
          },
          {
            association: 'matieres',
            through: { attributes: [] },
            attributes: ['id', 'nom_matiere', 'code_matiere', 'couleur_affichage']
          },
          {
            association: 'disponibilites',
            attributes: ['id', 'jour_semaine', 'heure_debut', 'heure_fin', 'type', 'recurrent']
          }
        ]
      });

      if (!enseignant) {
        return res.status(404).json({
          error: 'Enseignant non trouvé',
          code: 'TEACHER_NOT_FOUND'
        });
      }

      res.json({
        enseignant,
        code: 'RECUPERATION_TEACHER_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur récupération enseignant:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération de l\'enseignant',
        code: 'RECUPERATION_TEACHER_ERROR'
      });
    }
  },

  /**
   * Créer un nouvel enseignant
   */
  createEnseignant: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Données invalides',
          details: errors.array(),
          code: 'VALIDATION_ERROR'
        });
      }
      console.log(req.body);


      const {
        utilisateur_id,
        matricule,
        statut,
        date_embauche,
        heures_contractuelles_hebdo,
        heures_max_journalieres,
        cours_consecutifs_max,
        preference_horaire,
        multi_sites,
        etablissement_id: etablissementIdBody
      } = req.body;

      const targetEtablissementId = resolveScopedEtablissementId(req) || etablissementIdBody;

      if (!targetEtablissementId && !isAdminSystem(req.utilisateur)) {
        return res.status(400).json({
          error: 'Établissement requis pour créer un enseignant',
          code: 'ESTABLISSEMENT_REQUIRED'
        });
      }

      if (!targetEtablissementId) {
        return res.status(400).json({
          error: 'Établissement cible manquant',
          code: 'ESTABLISSEMENT_REQUIRED'
        });
      }

      // Vérifier si le matricule existe déjà dans l'établissement ciblé
      const existingEnseignant = await Enseignant.findOne({
        where: {
          matricule,
          ...(targetEtablissementId ? { etablissement_id: targetEtablissementId } : {})
        }
      });

      if (existingEnseignant) {
        return res.status(409).json({
          error: 'Un enseignant avec ce matricule existe déjà',
          code: 'TEACHER_MATRICULE_EXISTS'
        });
      }

      // Vérifier que l'utilisateur existe
      const utilisateur = await Utilisateur.findOne({
        where: {
          id: utilisateur_id,
          ...(targetEtablissementId ? { etablissement_id: targetEtablissementId } : {})
        }
      });

      if (!utilisateur) {
        return res.status(404).json({
          error: 'Utilisateur non trouvé',
          code: 'USER_NOT_FOUND'
        });
      }

      const enseignant = await Enseignant.create({
        utilisateur_id,
        matricule,
        statut,
        date_embauche,
        heures_contractuelles_hebdo,
        heures_max_journalieres: heures_max_journalieres || 480,
        cours_consecutifs_max: cours_consecutifs_max || 4,
        preference_horaire: preference_horaire || PreferenceHoraire.INDIFFERENT,
        multi_sites: multi_sites || false,
        etablissement_id: targetEtablissementId
      });

      await LogModification.create({
        utilisateur_id: req.utilisateur.id,
        table_concernee: 'enseignants',
        id_entite_concernee: enseignant.id,
        type_operation: TypeOperation.CREATION,
        valeur_avant: null,
        valeur_apres: {
          utilisateur_id,
          matricule,
          statut,
          etablissement_id: targetEtablissementId
        },
        adresse_ip: req.ip
      });

      res.status(201).json({
        message: 'Enseignant créé avec succès',
        enseignant,
        code: 'TEACHER_CREATED'
      });

    } catch (error) {
      console.error('Erreur création enseignant:', error);
      res.status(500).json({
        error: 'Erreur lors de la création de l\'enseignant',
        code: 'TEACHER_CREATION_ERROR'
      });
    }
  },

  /**
   * Mettre à jour un enseignant
   */
  updateEnseignant: async (req, res) => {
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

      const whereClause = { id };
      if (!isAdminSystem(req.utilisateur)) {
        whereClause.etablissement_id = req.utilisateur.etablissement_id;
      }

      const enseignant = await Enseignant.findOne({ where: whereClause });

      if (!enseignant) {
        return res.status(404).json({
          error: 'Enseignant non trouvé',
          code: 'TEACHER_NOT_FOUND'
        });
      }

      // Vérifier si le nouveau matricule existe déjà (sauf pour cet enseignant)
      if (updates.matricule && updates.matricule !== enseignant.matricule) {
        const existingEnseignant = await Enseignant.findOne({
          where: {
            matricule: updates.matricule,
            etablissement_id: enseignant.etablissement_id,
            id: { [Op.ne]: id }
          }
        });

        if (existingEnseignant) {
          return res.status(409).json({
            error: 'Un enseignant avec ce matricule existe déjà',
            code: 'TEACHER_MATRICULE_EXISTS'
          });
        }
      }

      await enseignant.update(updates);

      await LogModification.create({
        utilisateur_id: req.utilisateur.id,
        table_concernee: 'enseignants',
        id_entite_concernee: enseignant.id,
        type_operation: TypeOperation.MODIFICATION,
        valeur_avant: { id: enseignant.id },
        valeur_apres: updates,
        adresse_ip: req.ip
      });

      res.json({
        message: 'Enseignant mis à jour avec succès',
        enseignant,
        code: 'TEACHER_UPDATED'
      });

    } catch (error) {
      console.error('Erreur mise à jour enseignant:', error);
      res.status(500).json({
        error: 'Erreur lors de la mise à jour de l\'enseignant',
        code: 'TEACHER_UPDATE_ERROR'
      });
    }
  },

  /**
   * Associer des matières à un enseignant
   */
  assignMatieres: async (req, res) => {
    try {
      const { id } = req.params;
      const { matiere_ids } = req.body;

      const enseignant = await Enseignant.findOne({
        where: applyEtablissementScope(req, { id })
      });

      if (!enseignant) {
        return res.status(404).json({
          error: 'Enseignant non trouvé',
          code: 'TEACHER_NOT_FOUND'
        });
      }

      // Vérifier que toutes les matières existent dans le même établissement
      const matieres = await Matiere.findAll({
        where: {
          id: matiere_ids,
          etablissement_id: enseignant.etablissement_id
        }
      });

      if (matieres.length !== matiere_ids.length) {
        return res.status(404).json({
          error: 'Une ou plusieurs matières non trouvées',
          code: 'MATIERES_NOT_FOUND'
        });
      }

      await enseignant.setMatieres(matieres);

      await LogModification.create({
        utilisateur_id: req.utilisateur.id,
        table_concernee: 'enseignants_matieres',
        id_entite_concernee: enseignant.id,
        type_operation: TypeOperation.MODIFICATION,
        valeur_avant: null,
        valeur_apres: { matiere_ids },
        adresse_ip: req.ip
      });

      res.json({
        message: 'Matières associées à l\'enseignant avec succès',
        code: 'MATIERES_ASSIGNED'
      });

    } catch (error) {
      console.error('Erreur association matières:', error);
      res.status(500).json({
        error: 'Erreur lors de l\'association des matières',
        code: 'MATIERES_ASSIGNMENT_ERROR'
      });
    }
  },

  /**
   * Obtenir l'emploi du temps d'un enseignant
   */
  getEmploiTemps: async (req, res) => {
    try {
      const { id } = req.params;
      const { date_debut, date_fin } = req.query;

      const enseignant = await Enseignant.findOne({
        where: applyEtablissementScope(req, { id }),
        include: [{
          association: 'utilisateur',
          attributes: ['prenom', 'nom']
        }]
      });

      if (!enseignant) {
        return res.status(404).json({
          error: 'Enseignant non trouvé',
          code: 'TEACHER_NOT_FOUND'
        });
      }

      const whereClause = { enseignant_id: id };

      if (date_debut && date_fin) {
        whereClause[Op.and] = [
          { date_fin_validite: { [Op.gte]: date_debut } },
          { date_debut_validite: { [Op.lte]: date_fin } }
        ];
      }

      const creneaux = await CreneauCours.findAll({
        where: whereClause,
        include: [
          {
            association: 'cours',
            include: [
              {
                association: 'matiere',
                attributes: ['id', 'nom_matiere', 'code_matiere', 'couleur_affichage']
              },
              {
                association: 'classe',
                attributes: ['id', 'nom_classe', 'niveau']
              },
              {
                association: 'salle',
                attributes: ['id', 'nom_salle', 'batiment']
              }
            ]
          },
          {
            association: 'emploi_temps',
            attributes: ['id', 'nom_version', 'statut']
          }
        ],
        order: [
          ['jour_semaine', 'ASC'],
          ['heure_debut', 'ASC']
        ]
      });

      res.json({
        enseignant: {
          id: enseignant.id,
          nom_complet: `${enseignant.utilisateur.prenom} ${enseignant.utilisateur.nom}`,
          matricule: enseignant.matricule
        },
        creneaux,
        code: 'RECUPERATION_TEACHER_SCHEDULE_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur récupération emploi du temps:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération de l\'emploi du temps',
        code: 'RECUPERATION_TEACHER_SCHEDULE_ERROR'
      });
    }
  },

  /**
   * Obtenir les statistiques d'un enseignant
   */
  getEnseignantStats: async (req, res) => {
    try {
      const { id } = req.params;

      const enseignant = await Enseignant.findOne({
        where: applyEtablissementScope(req, { id }),
        include: [{
          association: 'utilisateur',
          attributes: ['nom', 'prenom']
        }]
      });

      if (!enseignant) {
        return res.status(404).json({
          error: 'Enseignant non trouvé',
          code: 'TEACHER_NOT_FOUND'
        });
      }

      const [
        totalCours,
        totalMatieres,
        totalClasses,
        totalHeuresHebdo,
        totalDisponibilites
      ] = await Promise.all([
        Cours.count({ where: { enseignant_id: id } }),
        enseignant.countMatieres(),
        Cours.count({
          where: { enseignant_id: id },
          distinct: true,
          col: 'classe_id'
        }),
        Cours.sum('volume_horaire_hebdo', { where: { enseignant_id: id } }),
        Disponibilite.count({ where: { enseignant_id: id } })
      ]);

      res.json({
        stats: {
          nom_complet: `${enseignant.utilisateur.prenom} ${enseignant.utilisateur.nom}`,
          matricule: enseignant.matricule,
          statut: enseignant.statut,
          heures_contractuelles: enseignant.heures_contractuelles_hebdo,
          total_cours: totalCours,
          total_matieres: totalMatieres,
          total_classes: totalClasses,
          total_heures_hebdo: totalHeuresHebdo || 0,
          total_disponibilites: totalDisponibilites
        },
        code: 'RECUPERATION_TEACHER_STATS_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur récupération statistiques enseignant:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques',
        code: 'RECUPERATION_TEACHER_STATS_ERROR'
      });
    }
  },
  /**
 * Obtenir les disponibilités d'un enseignant
 */
  getDisponibilites: async (req, res) => {
    try {
      const { id } = req.params;

      const enseignant = await Enseignant.findOne({
        where: applyEtablissementScope(req, { id })
      });

      if (!enseignant) {
        return res.status(404).json({
          error: 'Enseignant non trouvé',
          code: 'TEACHER_NOT_FOUND'
        });
      }

      const disponibilites = await Disponibilite.findAll({
        where: { enseignant_id: id },
        order: [
          ['jour_semaine', 'ASC'],
          ['heure_debut', 'ASC']
        ]
      });

      res.json({
        disponibilites,
        code: 'DISPONIBILITES_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération disponibilités:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des disponibilités',
        code: 'DISPONIBILITES_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Créer une disponibilité pour un enseignant
   */
  createDisponibilite: async (req, res) => {
    try {
      const { id } = req.params;
      const { jour_semaine, heure_debut, heure_fin, type, recurrent } = req.body;

      const enseignant = await Enseignant.findOne({
        where: applyEtablissementScope(req, { id })
      });

      if (!enseignant) {
        return res.status(404).json({
          error: 'Enseignant non trouvé',
          code: 'TEACHER_NOT_FOUND'
        });
      }

      // Vérifier les chevauchements
      const conflit = await Disponibilite.findOne({
        where: {
          enseignant_id: id,
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
        }
      });

      if (conflit) {
        return res.status(409).json({
          error: 'Une disponibilité existe déjà sur cette plage horaire',
          code: 'DISPONIBILITE_CONFLICT'
        });
      }

      const disponibilite = await Disponibilite.create({
        enseignant_id: id,
        jour_semaine,
        heure_debut,
        heure_fin,
        type: type || 'disponible',
        recurrent: recurrent || false
      });

      res.status(201).json({
        message: 'Disponibilité créée avec succès',
        disponibilite,
        code: 'DISPONIBILITE_CREATED'
      });

    } catch (error) {
      console.error('Erreur création disponibilité:', error);
      res.status(500).json({
        error: 'Erreur lors de la création de la disponibilité',
        code: 'DISPONIBILITE_CREATION_ERROR'
      });
    }
  },

  /**
   * Supprimer une disponibilité
   */
  deleteDisponibilite: async (req, res) => {
    try {
      const { id, disponibiliteId } = req.params;

      const enseignant = await Enseignant.findOne({
        where: applyEtablissementScope(req, { id })
      });

      if (!enseignant) {
        return res.status(404).json({
          error: 'Enseignant non trouvé',
          code: 'TEACHER_NOT_FOUND'
        });
      }

      const disponibilite = await Disponibilite.findOne({
        where: {
          id: disponibiliteId,
          enseignant_id: id
        }
      });

      if (!disponibilite) {
        return res.status(404).json({
          error: 'Disponibilité non trouvée',
          code: 'DISPONIBILITE_NOT_FOUND'
        });
      }

      await disponibilite.destroy();

      res.json({
        message: 'Disponibilité supprimée avec succès',
        code: 'DISPONIBILITE_DELETED'
      });

    } catch (error) {
      console.error('Erreur suppression disponibilité:', error);
      res.status(500).json({
        error: 'Erreur lors de la suppression de la disponibilité',
        code: 'DISPONIBILITE_DELETION_ERROR'
      });
    }
  }
};

module.exports = enseignantController;