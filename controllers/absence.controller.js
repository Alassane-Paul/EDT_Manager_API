// controllers/absenceController.js
const { Absence, Enseignant, Cours, Utilisateur, LogModification } = require('../database/models');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { StatutAbsence, TypeOperation } = require('../utils/enums');
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

const absenceController = {
  /**
   * Récupérer toutes les absences
   */
  getAllAbsences: async (req, res) => {
    try {
      const { page = 1, limit = 100, enseignant_id, statut, date_debut, date_fin } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {};

      const scopedEtablissementId = resolveScopedEtablissementId(req);
      const selfEnseignantId = await resolveEnseignantIdFromUser(req.utilisateur);

      // Filtrer par établissement via les relations
      const includeClause = [
        {
          association: 'cours',
          attributes: ['id'],
          include: [
            {
              association: 'matiere',
              attributes: ['id', 'nom_matiere', 'code_matiere']
            },
            {
              association: 'enseignant',
              attributes: ['id', 'etablissement_id']
            }
          ]
        },
        {
          association: 'eleve',
          attributes: ['id', 'utilisateur_id'],
          include: [{
            association: 'utilisateur',
            attributes: ['id', 'nom', 'prenom']
          }]
        }
      ];

      // Si l'utilisateur connecté est un enseignant, filtrer par ses cours
      if (selfEnseignantId) {
        // Récupérer tous les cours de cet enseignant
        const Cours = require('../database/models').Cours;
        const mesCours = await Cours.findAll({
          where: { enseignant_id: selfEnseignantId },
          attributes: ['id']
        });
        const mesCourseIds = mesCours.map(c => c.id);
        
        // Filtrer les absences qui sont soit:
        // 1. Déclarées directement par l'enseignant (enseignant_id = selfEnseignantId)
        // 2. Pour les élèves dans ses cours (eleve_id set et cours_id in mesCourseIds)
        whereClause[Op.or] = [
          { enseignant_id: selfEnseignantId },
          {
            [Op.and]: [
              { eleve_id: { [Op.ne]: null } },
              { cours_id: { [Op.in]: mesCourseIds } }
            ]
          }
        ];
      } else if (enseignant_id) {
        whereClause.enseignant_id = enseignant_id;
      }

      if (statut) {
        whereClause.statut = statut;
      }

      if (date_debut && date_fin) {
        // Utiliser Op.and correctement sans écraser Op.or
        const dateRange = {
          [Op.and]: [
            { date_debut: { [Op.lte]: date_fin } },
            { date_fin: { [Op.gte]: date_debut } }
          ]
        };
        
        if (whereClause[Op.or]) {
          // Combiner avec le Op.or existant
          whereClause[Op.and] = [
            { [Op.or]: whereClause[Op.or] },
            dateRange
          ];
          delete whereClause[Op.or];
        } else {
          Object.assign(whereClause, dateRange[Op.and][0], dateRange[Op.and][1]);
        }
      }

      const { count, rows: absences } = await Absence.findAndCountAll({
        where: whereClause,
        include: includeClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['date_debut', 'DESC']]
      });

      res.json({
        absences,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        code: 'ABSENCES_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération absences:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des absences',
        code: 'ABSENCES_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Récupérer une absence par ID
   */
  getAbsenceById: async (req, res) => {
    try {
      const { id } = req.params;

      const scopedEtablissementId = resolveScopedEtablissementId(req);
      const selfEnseignantId = await resolveEnseignantIdFromUser(req.utilisateur);

      const absence = await Absence.findOne({
        where: { id },
        include: [
          {
            association: 'enseignant',
            where: { etablissement_id: scopedEtablissementId },
            include: [{
              association: 'utilisateur',
              attributes: ['id', 'nom', 'prenom', 'email', 'telephone']
            }]
          },
          {
            association: 'cours',
            include: [
              {
                association: 'classe',
                attributes: ['id', 'nom_classe', 'niveau']
              },
              {
                association: 'matiere',
                attributes: ['id', 'nom_matiere', 'code_matiere']
              }
            ]
          }
        ]
      });

      if (!absence) {
        return res.status(404).json({
          error: 'Absence non trouvée',
          code: 'ABSENCE_NOT_FOUND'
        });
      }

      if (selfEnseignantId && absence.enseignant_id !== selfEnseignantId) {
        return res.status(403).json({
          error: 'Accès refusé à cette absence',
          code: 'ABSENCE_FORBIDDEN'
        });
      }

      res.json({
        absence,
        code: 'ABSENCE_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération absence:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération de l\'absence',
        code: 'ABSENCE_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Déclarer une nouvelle absence
   */
  declarerAbsence: async (req, res) => {
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
        enseignant_id,
        cours_id,
        date_debut,
        date_fin,
        motif,
        necessite_remplacement,
        cours_concernes
      } = req.body;

      // Vérifier que l'enseignant appartient à l'établissement
      const scopedEtablissementId = resolveScopedEtablissementId(req);
      const selfEnseignantId = await resolveEnseignantIdFromUser(req.utilisateur);

      if (selfEnseignantId && enseignant_id !== selfEnseignantId) {
        return res.status(403).json({
          error: 'Un enseignant ne peut déclarer que ses propres absences',
          code: 'ABSENCE_SELF_ONLY'
        });
      }

      const enseignant = await Enseignant.findOne({
        where: {
          id: enseignant_id,
          etablissement_id: scopedEtablissementId
        }
      });

      if (!enseignant) {
        return res.status(404).json({
          error: 'Enseignant non trouvé',
          code: 'TEACHER_NOT_FOUND'
        });
      }

      // Vérifier que le cours appartient à l'établissement (si fourni)
      if (cours_id) {
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
      }

      const absence = await Absence.create({
        enseignant_id,
        cours_id,
        date_debut,
        date_fin,
        motif,
        necessite_remplacement: necessite_remplacement || false,
        cours_concernes,
        statut: StatutAbsence.DECLAREE
      });
      await LogModification.create({
        utilisateur_id: req.utilisateur.id,
        table_concernee: 'absences',
        id_entite_concernee: absence.id,
        type_operation: TypeOperation.CREATION,
        valeur_avant: null,
        valeur_apres: {
          enseignant_id,
          cours_id,
          date_debut,
          date_fin,
          motif
        },
        adresse_ip: req.ip
      });

      // Notifier les responsables pédagogiques
      try {
        // Recharger l'absence avec les relations nécessaires pour la notification
        const absenceFull = await Absence.findByPk(absence.id, {
          include: [{
            association: 'enseignant',
            include: [{ association: 'utilisateur' }]
          }]
        });
        await NotificationService.notifierAbsence(absenceFull, req.io);
      } catch (notifyError) {
        console.error('Erreur notification absence:', notifyError);
      }

      res.status(201).json({
        message: 'Absence déclarée avec succès',
        absence,
        code: 'ABSENCE_DECLARED'
      });

    } catch (error) {
      console.error('Erreur déclaration absence:', error);
      res.status(500).json({
        error: 'Erreur lors de la déclaration de l\'absence',
        code: 'ABSENCE_DECLARATION_ERROR'
      });
    }
  },

  /**
   * Valider une absence
   */
  validerAbsence: async (req, res) => {
    try {
      const { id } = req.params;

      const absence = await Absence.findOne({
        where: { id },
        include: [{
          association: 'enseignant',
          where: { etablissement_id: req.utilisateur.etablissement_id }
        }]
      });

      if (!absence) {
        return res.status(404).json({
          error: 'Absence non trouvée',
          code: 'ABSENCE_NOT_FOUND'
        });
      }

      await absence.valider();

      await LogModification.create({
        utilisateur_id: req.utilisateur.id,
        table_concernee: 'absences',
        id_entite_concernee: absence.id,
        type_operation: TypeOperation.MODIFICATION,
        valeur_avant: { statut: absence.statut },
        valeur_apres: { statut: StatutAbsence.VALIDEE },
        adresse_ip: req.ip
      });

      res.json({
        message: 'Absence validée avec succès',
        absence,
        code: 'ABSENCE_VALIDATED'
      });

    } catch (error) {
      console.error('Erreur validation absence:', error);
      res.status(500).json({
        error: 'Erreur lors de la validation de l\'absence',
        code: 'ABSENCE_VALIDATION_ERROR'
      });
    }
  },

  /**
   * Refuser une absence
   */
  refuserAbsence: async (req, res) => {
    try {
      const { id } = req.params;
      const { raison } = req.body;

      const absence = await Absence.findOne({
        where: { id },
        include: [{
          association: 'enseignant',
          where: { etablissement_id: req.utilisateur.etablissement_id }
        }]
      });

      if (!absence) {
        return res.status(404).json({
          error: 'Absence non trouvée',
          code: 'ABSENCE_NOT_FOUND'
        });
      }

      await absence.refuser(raison);

      await LogModification.create({
        utilisateur_id: req.utilisateur.id,
        table_concernee: 'absences',
        id_entite_concernee: absence.id,
        type_operation: TypeOperation.MODIFICATION,
        valeur_avant: { statut: absence.statut },
        valeur_apres: { statut: 'refusee', raison },
        adresse_ip: req.ip
      });

      res.json({
        message: 'Absence refusée avec succès',
        absence,
        code: 'ABSENCE_REFUSED'
      });

    } catch (error) {
      console.error('Erreur refus absence:', error);
      res.status(500).json({
        error: 'Erreur lors du refus de l\'absence',
        code: 'ABSENCE_REFUSAL_ERROR'
      });
    }
  },

  /**
   * Obtenir les absences en cours
   */
  getAbsencesEnCours: async (req, res) => {
    try {
      const aujourdhui = new Date().toISOString().split('T')[0];

      const absences = await Absence.findAll({
        where: {
          date_debut: { [Op.lte]: aujourdhui },
          date_fin: { [Op.gte]: aujourdhui },
          statut: StatutAbsence.VALIDEE
        },
        include: [
          {
            association: 'enseignant',
            where: { etablissement_id: req.utilisateur.etablissement_id },
            include: [{
              association: 'utilisateur',
              attributes: ['id', 'nom', 'prenom']
            }]
          },
          {
            association: 'cours',
            include: [
              {
                association: 'classe',
                attributes: ['id', 'nom_classe']
              },
              {
                association: 'matiere',
                attributes: ['id', 'nom_matiere']
              }
            ]
          }
        ],
        order: [['date_fin', 'ASC']]
      });

      res.json({
        absences_en_cours: absences,
        total: absences.length,
        code: 'CURRENT_ABSENCES_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération absences en cours:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des absences en cours',
        code: 'CURRENT_ABSENCES_ERROR'
      });
    }
  },

  /**
   * Obtenir les statistiques des absences
   */
  getAbsenceStats: async (req, res) => {
    try {
      const { periode_debut, periode_fin } = req.query;

      const whereClause = {};

      if (periode_debut && periode_fin) {
        whereClause.date_debut = {
          [Op.between]: [periode_debut, periode_fin]
        };
      }

      const stats = await Absence.findAll({
        where: whereClause,
        include: [{
          association: 'enseignant',
          where: { etablissement_id: req.utilisateur.etablissement_id }
        }],
        attributes: [
          'statut',
          'necessite_remplacement',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['statut', 'necessite_remplacement']
      });

      const total = await Absence.count({
        where: whereClause,
        include: [{
          association: 'enseignant',
          where: { etablissement_id: req.utilisateur.etablissement_id }
        }]
      });

      const moyenneDuree = await Absence.findOne({
        where: whereClause,
        include: [{
          association: 'enseignant',
          where: { etablissement_id: req.utilisateur.etablissement_id }
        }],
        attributes: [
          [sequelize.fn('AVG',
            sequelize.literal(`DATEDIFF(date_fin, date_debut)`)
          ), 'moyenne_duree']
        ]
      });

      res.json({
        stats: {
          total,
          par_statut_remplacement: stats,
          moyenne_duree_jours: moyenneDuree?.dataValues.moyenne_duree || 0
        },
        code: 'ABSENCES_STATS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération statistiques absences:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques',
        code: 'ABSENCES_STATS_ERROR'
      });
    }
  },

  /**
   * Enregistrer les absences des élèves (Appel)
   */
  declarerAbsencesEleves: async (req, res) => {
    try {
      const { cours_id, date, absences } = req.body;
      // absences: [{ eleve_id, motif, statut }]

      if (!absences || !Array.isArray(absences)) {
        return res.status(400).json({
          error: 'Liste d absences invalide',
          code: 'INVALID_ABSENCE_LIST'
        });
      }

      // Vérifier le cours
      const cours = await Cours.findByPk(cours_id);
      if (!cours) {
        return res.status(404).json({
          error: 'Cours non trouvé',
          code: 'COURS_NOT_FOUND'
        });
      }

      // Supprimer les anciennes absences déclarées pour ce cours/date (gestion ré-appel)
      // Attention: ne touche pas aux absences validées/justifiées si on veut préserver l'historique administratif ?
      // Pour l'instant, on suppose que l'enseignant peut modifier l'appel du jour.
      await Absence.destroy({
        where: {
          cours_id,
          date_debut: { [Op.gte]: new Date(date) },
          date_fin: { [Op.lte]: new Date(date) },
          enseignant_id: null
        }
      });

      const absencesToCreate = absences.map(a => ({
        eleve_id: a.eleve_id,
        cours_id,
        date_debut: date,
        date_fin: date,
        statut: StatutAbsence.DECLAREE,
        motif: a.motif || 'Absence au cours',
        necessite_remplacement: false
      }));

      if (absencesToCreate.length > 0) {
        await Absence.bulkCreate(absencesToCreate, { validate: true });
      }

      res.status(201).json({
        message: 'Appel enregistré avec succès',
        count: absencesToCreate.length,
        code: 'STUDENT_ATTENDANCE_SAVED'
      });
    } catch (error) {
      console.error('Erreur enregistrement appel élèves:', error.message);
      console.error('Stack:', error.stack);
      res.status(500).json({
        error: error.message || 'Erreur lors de l enregistrement de l appel',
        details: error.errors ? error.errors.map(e => e.message).join(', ') : undefined,
        code: 'STUDENT_ATTENDANCE_ERROR'
      });
    }
  },

  /**
   * Récupérer les absences de l'étudiant connecté
   */
  getMesAbsencesEtudiant: async (req, res) => {
    try {
      const utilisateur = req.utilisateur;

      const Eleve = require('../database/models').Eleve;
      const eleve = await Eleve.findOne({
        where: { utilisateur_id: utilisateur.id }
      });

      if (!eleve) {
        return res.status(404).json({
          error: 'Élève non trouvé',
          code: 'STUDENT_NOT_FOUND'
        });
      }

      const absences = await Absence.findAll({
        where: { eleve_id: eleve.id },
        include: [
          {
            association: 'cours',
            attributes: ['id', 'volume_horaire_hebdo'],
            required: false,
            include: [
              {
                association: 'matiere',
                attributes: ['id', 'nom_matiere', 'code_matiere', 'couleur_affichage'],
                required: false
              },
              {
                association: 'enseignant',
                required: false,
                include: [{
                  association: 'utilisateur',
                  attributes: ['id', 'nom', 'prenom'],
                  required: false
                }]
              }
            ]
          }
        ],
        order: [['date_debut', 'DESC']]
      });

      res.json({
        absences,
        total: absences.length,
        code: 'MY_ABSENCES_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération absences étudiant:', error.message);
      console.error('Stack:', error.stack);
      res.status(500).json({
        error: error.message || 'Erreur lors de la récupération des absences',
        code: 'MY_ABSENCES_ERROR'
      });
    }
  }
};

module.exports = absenceController;