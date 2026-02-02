// controllers/emploiTempsController.js
const { EmploiTemps, Classe, Etablissement, Utilisateur, CreneauCours, Cours, Enseignant, Matiere, Salle, Eleve } = require('../database/models');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { StatutEmploiTemps, ModeGeneration, RoleUtilisateur, StatutCreneau } = require('../utils/enums');
const NotificationService = require('../services/notification.service');
const PDFDocument = require('pdfkit');
const { resolveScopedEtablissementId, applyEtablissementScope, isAdminSystem } = require('../utils/scope');
const GenerationService = require('../services/generation.service');

const emploiTempsController = {
  /**
   * Récupérer l'emploi du temps de l'utilisateur connecté
   */
  getMonEmploiTemps: async (req, res) => {
    try {
      const { semaine } = req.query;
      const utilisateur = req.utilisateur;

      let emploiTemps = null;

      // Selon le rôle, récupérer l'emploi du temps approprié
      if (utilisateur.role === RoleUtilisateur.ETUDIANT) {
        // Trouver l'élève et sa classe
        const eleve = await Eleve.findOne({
          where: { utilisateur_id: utilisateur.id },
          include: [{ association: 'classe', attributes: ['id'] }]
        });

        if (!eleve || !eleve.classe) {
          return res.status(404).json({
            error: 'Classe non trouvée pour cet élève',
            code: 'CLASS_NOT_FOUND'
          });
        }

        emploiTemps = await getEmploiTempsActif(eleve.classe.id, semaine, resolveScopedEtablissementId(req), true);
      }
      else if (utilisateur.role === RoleUtilisateur.ENSEIGNANT) {
        const enseignant = await Enseignant.findOne({
          where: { utilisateur_id: utilisateur.id }
        });

        if (!enseignant) {
          return res.status(404).json({
            error: 'Enseignant non trouvé',
            code: 'TEACHER_NOT_FOUND'
          });
        }

        emploiTemps = await getEmploiTempsEnseignant(enseignant.id, semaine, resolveScopedEtablissementId(req));
      }
      else {
        return res.status(403).json({
          error: 'Accès non autorisé',
          code: 'ACCESS_DENIED'
        });
      }

      if (!emploiTemps) {
        // Construction d'une réponse vide mais structurellement valide
        let emptyResponse = {
          seances: [],
          creneaux: [],
          statistiques: {
            heures_total: 0,
            nombre_seances: 0,
            matieres_count: 0
          }
        };

        // Si c'est un étudiant, on ajoute les infos de sa classe
        if (utilisateur.role === RoleUtilisateur.ETUDIANT) {
          const eleve = await Eleve.findOne({
            where: { utilisateur_id: utilisateur.id },
            include: [{ association: 'classe', attributes: ['id', 'nom_classe', 'niveau'] }]
          });
          if (eleve && eleve.classe) {
            emptyResponse.classe = eleve.classe;
          }
        }
        // Si c'est un enseignant, on pourrait aussi ajouter ses infos?
        // Pour l'instant on se concentre sur l'élève comme demandé.

        return res.json({
          emploi_temps: emptyResponse,
          code: 'NO_SCHEDULE'
        });
      }

      // Transformer les créneaux en séances pour le frontend
      const creneaux = emploiTemps.creneaux || [];
      const seances = creneaux.map(c => ({
        id: c.id,
        cours_id: c.cours_id,
        matiere_nom: c.cours?.matiere?.nom_matiere || 'N/A',
        enseignant_id: c.cours?.enseignant_id || '',
        enseignant_nom: c.cours?.enseignant?.utilisateur ? `${c.cours.enseignant.utilisateur.prenom} ${c.cours.enseignant.utilisateur.nom}` : 'N/A',
        classe_id: c.cours?.classe_id || (emploiTemps.classe_id || ''),
        classe_nom: c.cours?.classe?.nom_classe || (emploiTemps.classe?.nom_classe || 'N/A'),
        salle_id: c.salle_id || '',
        salle_nom: c.salle?.nom_salle || 'N/A',
        jour: c.jour_semaine.toLowerCase(),
        heure_debut: c.heure_debut.substring(0, 5),
        heure_fin: c.heure_fin.substring(0, 5),
        type: c.est_rattrapage ? 'rattrapage' : 'cours',
        statut: c.statut || 'planifie',
        couleur: c.cours?.matiere?.couleur_affichage
      }));

      // Calculer les statistiques
      const stats = {
        heures_total: creneaux.reduce((total, c) => {
          const hStart = parseInt(c.heure_debut.split(':')[0]);
          const hEnd = parseInt(c.heure_fin.split(':')[0]);
          return total + (hEnd - hStart);
        }, 0),
        nombre_seances: creneaux.length,
        matieres_count: new Set(creneaux.map(c => c.cours?.matiere_id)).size
      };

      // Debug: Log pour vérifier les données
      console.log('EmploiTemps trouvé:', {
        id: emploiTemps.id,
        nombreCreneaux: emploiTemps.creneaux?.length || 0,
        statut: emploiTemps.statut
      });

      res.json({
        emploi_temps: {
          ...emploiTemps.toJSON(),
          seances,
          statistiques: stats
        },
        code: 'SCHEDULE_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération emploi du temps utilisateur:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération de l\'emploi du temps',
        code: 'SCHEDULE_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Récupérer l'emploi du temps d'une classe
   */
  getEmploiTempsParClasse: async (req, res) => {
    try {
      const { classeId } = req.params;
      const { semaine } = req.query;

      // Vérifier que la classe existe et appartient à l'établissement
      const classe = await Classe.findOne({
        where: applyEtablissementScope(req, { id: classeId })
      });

      if (!classe) {
        return res.status(404).json({
          error: 'Classe non trouvée',
          code: 'CLASS_NOT_FOUND'
        });
      }

      const emploiTemps = await getEmploiTempsActif(classeId, semaine, resolveScopedEtablissementId(req));

      if (!emploiTemps) {
        return res.status(404).json({
          error: 'Aucun emploi du temps publié trouvé pour cette classe',
          code: 'SCHEDULE_NOT_FOUND'
        });
      }

      res.json({
        emploi_temps: emploiTemps,
        code: 'SCHEDULE_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération emploi du temps classe:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération de l\'emploi du temps',
        code: 'SCHEDULE_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Récupérer l'emploi du temps d'un enseignant
   */
  getEmploiTempsParEnseignant: async (req, res) => {
    try {
      const { enseignantId } = req.params;
      const { semaine } = req.query;

      // Vérifier que l'enseignant existe avec le scope approprié
      const enseignant = await Enseignant.findOne({
        where: applyEtablissementScope(req, { id: enseignantId }),
        include: [{
          association: 'utilisateur',
          attributes: ['id', 'nom', 'prenom', 'etablissement_id']
        }]
      });

      if (!enseignant) {
        return res.status(404).json({
          error: 'Enseignant non trouvé',
          code: 'TEACHER_NOT_FOUND'
        });
      }

      // Utiliser l'id d'établissement de l'enseignant pour la recherche si on est admin non scopé
      const targetEtabId = enseignant.etablissement_id;

      const emploiTemps = await getEmploiTempsEnseignant(
        enseignantId,
        semaine,
        targetEtabId,
        isAdminSystem(req.utilisateur) || req.utilisateur.role === RoleUtilisateur.DIRECTEUR // includeDrafts
      );

      if (!emploiTemps) {
        return res.status(404).json({
          error: 'Aucun emploi du temps trouvé pour cet enseignant',
          code: 'SCHEDULE_NOT_FOUND'
        });
      }

      res.json({
        emploi_temps: emploiTemps,
        code: 'SCHEDULE_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération emploi du temps enseignant:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération de l\'emploi du temps',
        code: 'SCHEDULE_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Récupérer tous les emplois du temps
   */
  getAllEmploisTemps: async (req, res) => {
    try {
      const { page = 1, limit = 100, classe_id, statut, search } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = applyEtablissementScope(req, {});

      if (classe_id) whereClause.classe_id = classe_id;
      if (statut) whereClause.statut = statut;
      if (search) whereClause.nom_version = { [Op.like]: `%${search}%` };

      const { count, rows: emploisTemps } = await EmploiTemps.findAndCountAll({
        where: whereClause,
        include: [
          {
            association: 'classe',
            attributes: ['id', 'nom_classe', 'niveau']
          },
          {
            association: 'etablissement',
            attributes: ['id', 'nom']
          },
          {
            association: 'generateur',
            attributes: ['id', 'nom', 'prenom']
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      res.json({
        emplois_temps: emploisTemps,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        code: 'SCHEDULES_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération emplois du temps:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des emplois du temps',
        code: 'SCHEDULES_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Récupérer un emploi du temps par ID
   */
  getEmploiTempsById: async (req, res) => {
    try {
      const { id } = req.params;

      const emploiTemps = await EmploiTemps.findOne({
        where: applyEtablissementScope(req, { id }),
        include: [
          {
            association: 'classe',
            attributes: ['id', 'nom_classe', 'niveau', 'effectif']
          },
          {
            association: 'etablissement',
            attributes: ['id', 'nom']
          },
          {
            association: 'generateur',
            attributes: ['id', 'nom', 'prenom']
          },
          {
            association: 'creneaux',
            include: [
              {
                association: 'cours',
                include: [
                  {
                    association: 'matiere',
                    attributes: ['id', 'nom_matiere', 'code_matiere', 'couleur_affichage']
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
                association: 'salle',
                attributes: ['id', 'nom_salle', 'batiment', 'capacite']
              }
            ],
            order: [
              ['jour_semaine', 'ASC'],
              ['heure_debut', 'ASC']
            ]
          }
        ]
      });

      if (!emploiTemps) {
        return res.status(404).json({
          error: 'Emploi du temps non trouvé',
          code: 'SCHEDULE_NOT_FOUND'
        });
      }

      res.json({
        emploi_temps: emploiTemps,
        code: 'SCHEDULE_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération emploi du temps:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération de l\'emploi du temps',
        code: 'SCHEDULE_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Récupérer le statut de génération d'un emploi du temps
   */
  getEmploiTempsStatus: async (req, res) => {
    try {
      const { id } = req.params;

      const emploiTemps = await EmploiTemps.findOne({
        where: applyEtablissementScope(req, { id }),
        attributes: ['id', 'statut', 'score_qualite', 'duree_generation', 'commentaires', 'updated_at'],
        include: [
          {
            association: 'creneaux',
            attributes: ['id']
          }
        ]
      });

      if (!emploiTemps) {
        return res.status(404).json({
          error: 'Emploi du temps non trouvé',
          code: 'SCHEDULE_NOT_FOUND'
        });
      }

      const isGenerating = emploiTemps.statut === StatutEmploiTemps.EN_COURS;
      const isComplete = emploiTemps.statut === StatutEmploiTemps.BROUILLON ||
        emploiTemps.statut === StatutEmploiTemps.VALIDE ||
        emploiTemps.statut === StatutEmploiTemps.PUBLIE;

      res.json({
        id: emploiTemps.id,
        statut: emploiTemps.statut,
        is_generating: isGenerating,
        is_complete: isComplete,
        score_qualite: emploiTemps.score_qualite,
        duree_generation: emploiTemps.duree_generation,
        nombre_creneaux: emploiTemps.creneaux?.length || 0,
        commentaires: emploiTemps.commentaires,
        updated_at: emploiTemps.updated_at,
        code: 'SCHEDULE_STATUS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération statut emploi du temps:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération du statut',
        code: 'SCHEDULE_STATUS_ERROR'
      });
    }
  },

  /**
   * Générer un nouvel emploi du temps
   */
  genererEmploiTemps: async (req, res) => {
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
        classe_id,
        nom_version,
        periode_debut,
        periode_fin,
        mode_generation,
        parametres_generation,
        commentaires
      } = req.body;

      const classe = await Classe.findOne({
        where: applyEtablissementScope(req, { id: classe_id })
      });

      if (!classe) {
        return res.status(404).json({
          error: 'Classe non trouvée',
          code: 'CLASS_NOT_FOUND'
        });
      }

      // Use establishment from the found class, creating scoped context
      const targetEtablissementId = classe.etablissement_id;

      const existingEmploiTemps = await EmploiTemps.findOne({
        where: {
          nom_version,
          etablissement_id: targetEtablissementId
        }
      });

      if (existingEmploiTemps) {
        return res.status(409).json({
          error: 'Un emploi du temps avec ce nom existe déjà',
          code: 'SCHEDULE_NAME_EXISTS'
        });
      }

      const startTime = Date.now();

      const emploiTemps = await EmploiTemps.create({
        classe_id,
        nom_version,
        periode_debut,
        periode_fin,
        statut: StatutEmploiTemps.EN_COURS, // Changed to EN_COURS for async generation
        score_qualite: 0,
        mode_generation: mode_generation || ModeGeneration.EQUILIBRE,
        parametres_generation: parametres_generation || {},
        commentaires,
        generateur_id: req.utilisateur.id,
        etablissement_id: targetEtablissementId,
        duree_generation: 0
      });

      // Lancer la génération en arrière-plan (async, non-bloquant)
      (async () => {
        const startTime = Date.now();
        try {
          const resultatGeneration = await GenerationService.genererEmploiTemps(classe_id, {
            ...(parametres_generation || {}),
            periode_debut: emploiTemps.periode_debut,
            periode_fin: emploiTemps.periode_fin
          });

          // Sauvegarder les créneaux générés
          if (resultatGeneration.creneaux && resultatGeneration.creneaux.length > 0) {
            const creneauxADb = resultatGeneration.creneaux.map(creneau => ({
              emploi_temps_id: emploiTemps.id,
              cours_id: creneau.cours_id,
              salle_id: creneau.salle_id,
              jour_semaine: creneau.jour_semaine,
              heure_debut: creneau.heure_debut,
              heure_fin: creneau.heure_fin,
              date_debut_validite: periode_debut,
              date_fin_validite: periode_fin,
              statut: StatutCreneau?.PLANIFIE || 'planifie',
              est_rattrapage: false
            }));

            await CreneauCours.bulkCreate(creneauxADb);
          }

          const dureeGeneration = Date.now() - startTime;

          // Mettre à jour le statut à BROUILLON une fois terminé
          await emploiTemps.update({
            statut: StatutEmploiTemps.BROUILLON,
            duree_generation: Math.floor(dureeGeneration / 1000),
            score_qualite: Math.min(100, Math.max(0, resultatGeneration.score_qualite || 0))
          });

          console.log(`Génération terminée pour l'emploi du temps ${emploiTemps.id}`);
        } catch (error) {
          console.error('Erreur lors de la génération asynchrone:', error);

          // Marquer l'emploi du temps comme ayant échoué
          await emploiTemps.update({
            statut: StatutEmploiTemps.BROUILLON,
            commentaires: `Erreur de génération: ${error.message}`
          });
        }
      })();

      // Retourner immédiatement avec le statut EN_COURS
      res.status(201).json({
        message: 'Génération de l\'emploi du temps démarrée',
        emploi_temps: emploiTemps,
        code: 'SCHEDULE_GENERATION_STARTED'
      });

    } catch (error) {
      console.error('Erreur génération emploi du temps:', error);

      // Check if this is a validation/business logic error
      const validationErrors = [
        'Aucun cours à planifier pour cette classe',
        'Aucune salle disponible pour la génération',
        'Aucun enseignant disponible'
      ];

      if (validationErrors.some(msg => error.message?.includes(msg))) {
        return res.status(400).json({
          error: error.message,
          code: 'GENERATION_PREREQUISITES_MISSING'
        });
      }

      // For other errors, return 500
      res.status(500).json({
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        code: 'SCHEDULE_GENERATION_ERROR'
      });
    }
  },

  /**
   * Valider un emploi du temps
   */
  validerEmploiTemps: async (req, res) => {
    try {
      const { id } = req.params;

      const emploiTemps = await EmploiTemps.findOne({
        where: applyEtablissementScope(req, { id })
      });

      if (!emploiTemps) {
        return res.status(404).json({
          error: 'Emploi du temps non trouvé',
          code: 'SCHEDULE_NOT_FOUND'
        });
      }

      await emploiTemps.valider();

      res.json({
        message: 'Emploi du temps validé avec succès',
        emploi_temps: emploiTemps,
        code: 'SCHEDULE_VALIDATED'
      });

    } catch (error) {
      console.error('Erreur validation emploi du temps:', error);
      res.status(500).json({
        error: 'Erreur lors de la validation de l\'emploi du temps',
        code: 'SCHEDULE_VALIDATION_ERROR'
      });
    }
  },

  /**
   * Publier un emploi du temps
   */
  publierEmploiTemps: async (req, res) => {
    try {
      const { id } = req.params;

      const emploiTemps = await EmploiTemps.findOne({
        where: applyEtablissementScope(req, { id })
      });

      if (!emploiTemps) {
        return res.status(404).json({
          error: 'Emploi du temps non trouvé',
          code: 'SCHEDULE_NOT_FOUND'
        });
      }

      if (emploiTemps.statut !== StatutEmploiTemps.VALIDE) {
        return res.status(400).json({
          error: 'L\'emploi du temps doit être validé avant publication',
          code: 'SCHEDULE_NOT_VALIDATED'
        });
      }

      await emploiTemps.publier();

      // Notifier les utilisateurs concernés
      try {
        await NotificationService.notifierGenerationEmploiTemps(emploiTemps, req.io);
      } catch (notifyError) {
        console.error('Erreur notification publication EDT:', notifyError);
      }

      res.json({
        message: 'Emploi du temps publié avec succès',
        emploi_temps: emploiTemps,
        code: 'SCHEDULE_PUBLISHED'
      });

    } catch (error) {
      console.error('Erreur publication emploi du temps:', error);
      res.status(500).json({
        error: 'Erreur lors de la publication de l\'emploi du temps',
        code: 'SCHEDULE_PUBLICATION_ERROR'
      });
    }
  },

  /**
   * Archiver un emploi du temps
   */
  archiverEmploiTemps: async (req, res) => {
    try {
      const { id } = req.params;

      const emploiTemps = await EmploiTemps.findOne({
        where: applyEtablissementScope(req, { id })
      });

      if (!emploiTemps) {
        return res.status(404).json({
          error: 'Emploi du temps non trouvé',
          code: 'SCHEDULE_NOT_FOUND'
        });
      }

      await emploiTemps.archiver();

      res.json({
        message: 'Emploi du temps archivé avec succès',
        emploi_temps: emploiTemps,
        code: 'SCHEDULE_ARCHIVED'
      });

    } catch (error) {
      console.error('Erreur archivage emploi du temps:', error);
      res.status(500).json({
        error: 'Erreur lors de l\'archivage de l\'emploi du temps',
        code: 'SCHEDULE_ARCHIVE_ERROR'
      });
    }
  },

  /**
   * Supprimer un emploi du temps
   */
  deleteEmploiTemps: async (req, res) => {
    try {
      const { id } = req.params;

      const emploiTemps = await EmploiTemps.findOne({
        where: applyEtablissementScope(req, { id })
      });

      if (!emploiTemps) {
        return res.status(404).json({
          error: 'Emploi du temps non trouvé',
          code: 'SCHEDULE_NOT_FOUND'
        });
      }

      // Supprimer les créneaux associés
      await CreneauCours.destroy({
        where: { emploi_temps_id: id }
      });

      await emploiTemps.destroy();

      res.json({
        message: 'Emploi du temps supprimé avec succès',
        code: 'SCHEDULE_DELETED'
      });

    } catch (error) {
      console.error('Erreur suppression emploi du temps:', error);
      res.status(500).json({
        error: 'Erreur lors de la suppression de l\'emploi du temps',
        code: 'SCHEDULE_DELETE_ERROR'
      });
    }
  },

  /**
   * Dupliquer un emploi du temps
   */
  dupliquerEmploiTemps: async (req, res) => {
    try {
      const { id } = req.params;
      const { nom_nouvelle_version } = req.body;

      const emploiTempsOriginal = await EmploiTemps.findOne({
        where: applyEtablissementScope(req, { id }),
        include: [{ association: 'creneaux' }]
      });

      if (!emploiTempsOriginal) {
        return res.status(404).json({
          error: 'Emploi du temps non trouvé',
          code: 'SCHEDULE_NOT_FOUND'
        });
      }

      const existingEmploiTemps = await EmploiTemps.findOne({
        where: {
          nom_version: nom_nouvelle_version,
          etablissement_id: req.utilisateur.etablissement_id
        }
      });

      if (existingEmploiTemps) {
        return res.status(409).json({
          error: 'Un emploi du temps avec ce nom existe déjà',
          code: 'SCHEDULE_NAME_EXISTS'
        });
      }

      const nouvelEmploiTemps = await EmploiTemps.create({
        classe_id: emploiTempsOriginal.classe_id,
        nom_version: nom_nouvelle_version,
        periode_debut: emploiTempsOriginal.periode_debut,
        periode_fin: emploiTempsOriginal.periode_fin,
        statut: StatutEmploiTemps.BROUILLON,
        score_qualite: emploiTempsOriginal.score_qualite,
        mode_generation: emploiTempsOriginal.mode_generation,
        parametres_generation: emploiTempsOriginal.parametres_generation,
        commentaires: `Copie de ${emploiTempsOriginal.nom_version}`,
        generateur_id: req.utilisateur.id,
        etablissement_id: req.utilisateur.etablissement_id
      });

      if (emploiTempsOriginal.creneaux && emploiTempsOriginal.creneaux.length > 0) {
        const creneauxCopies = emploiTempsOriginal.creneaux.map(creneau => ({
          emploi_temps_id: nouvelEmploiTemps.id,
          cours_id: creneau.cours_id,
          salle_id: creneau.salle_id,
          jour_semaine: creneau.jour_semaine,
          heure_debut: creneau.heure_debut,
          heure_fin: creneau.heure_fin,
          date_debut_validite: creneau.date_debut_validite,
          date_fin_validite: creneau.date_fin_validite,
          sequence_type: creneau.sequence_type,
          est_rattrapage: creneau.est_rattrapage,
          statut: StatutCreneau.PLANIFIE
        }));

        await CreneauCours.bulkCreate(creneauxCopies);
      }

      res.status(201).json({
        message: 'Emploi du temps dupliqué avec succès',
        emploi_temps: nouvelEmploiTemps,
        code: 'SCHEDULE_DUPLICATED'
      });

    } catch (error) {
      console.error('Erreur duplication emploi du temps:', error);
      res.status(500).json({
        error: 'Erreur lors de la duplication de l\'emploi du temps',
        code: 'SCHEDULE_DUPLICATION_ERROR'
      });
    }
  },

  /**
   * Obtenir les statistiques d'un emploi du temps
   */
  getEmploiTempsStats: async (req, res) => {
    try {
      const { id } = req.params;

      const emploiTemps = await EmploiTemps.findOne({
        where: applyEtablissementScope(req, { id }),
        include: [
          {
            association: 'classe',
            attributes: ['nom_classe', 'effectif']
          },
          {
            association: 'creneaux',
            attributes: ['id', 'jour_semaine', 'heure_debut', 'heure_fin']
          }
        ]
      });

      if (!emploiTemps) {
        return res.status(404).json({
          error: 'Emploi du temps non trouvé',
          code: 'SCHEDULE_NOT_FOUND'
        });
      }

      const totalCreneaux = emploiTemps.creneaux.length;
      const creneauxParJour = {};
      let totalHeures = 0;

      emploiTemps.creneaux.forEach(creneau => {
        const jour = creneau.jour_semaine;
        creneauxParJour[jour] = (creneauxParJour[jour] || 0) + 1;

        const [debutHeures, debutMinutes] = creneau.heure_debut.split(':').map(Number);
        const [finHeures, finMinutes] = creneau.heure_fin.split(':').map(Number);
        const duree = (finHeures * 60 + finMinutes) - (debutHeures * 60 + debutMinutes);
        totalHeures += duree;
      });

      const heuresTotales = (totalHeures / 60).toFixed(2);

      res.json({
        stats: {
          nom_version: emploiTemps.nom_version,
          classe: emploiTemps.classe.nom_classe,
          effectif: emploiTemps.classe.effectif,
          periode: `${emploiTemps.periode_debut} au ${emploiTemps.periode_fin}`,
          statut: emploiTemps.statut,
          score_qualite: emploiTemps.score_qualite,
          total_creneaux: totalCreneaux,
          creneaux_par_jour: creneauxParJour,
          heures_totales: heuresTotales,
          duree_generation: emploiTemps.duree_generation
        },
        code: 'SCHEDULE_STATS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération statistiques emploi du temps:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques',
        code: 'SCHEDULE_STATS_ERROR'
      });
    }
  },

  /**
   * Créer une nouvelle séance
   */
  createSeance: async (req, res) => {
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
        emploi_temps_id,
        cours_id,
        salle_id,
        jour_semaine,
        heure_debut,
        heure_fin,
        date_debut_validite,
        date_fin_validite,
        est_rattrapage
      } = req.body;

      // Vérifier que l'emploi du temps existe
      const emploiTemps = await EmploiTemps.findOne({
        where: {
          id: emploi_temps_id,
          etablissement_id: req.utilisateur.etablissement_id
        }
      });

      if (!emploiTemps) {
        return res.status(404).json({
          error: 'Emploi du temps non trouvé',
          code: 'SCHEDULE_NOT_FOUND'
        });
      }

      // Vérifier les conflits de créneaux
      const conflit = await CreneauCours.findOne({
        where: {
          emploi_temps_id,
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
          error: 'Un créneau existe déjà sur cette plage horaire',
          code: 'TIME_SLOT_CONFLICT'
        });
      }

      const seance = await CreneauCours.create({
        emploi_temps_id,
        cours_id,
        salle_id,
        jour_semaine,
        heure_debut,
        heure_fin,
        date_debut_validite,
        date_fin_validite,
        est_rattrapage: est_rattrapage || false,
        statut: StatutCreneau.PLANIFIE
      });

      const seanceComplete = await CreneauCours.findByPk(seance.id, {
        include: [
          {
            association: 'cours',
            include: [
              {
                association: 'matiere',
                attributes: ['id', 'nom_matiere', 'code_matiere', 'couleur_affichage']
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
            association: 'salle',
            attributes: ['id', 'nom_salle', 'batiment', 'capacite']
          }
        ]
      });

      res.status(201).json({
        message: 'Séance créée avec succès',
        seance: seanceComplete,
        code: 'SESSION_CREATED'
      });

    } catch (error) {
      console.error('Erreur création séance:', error);
      res.status(500).json({
        error: 'Erreur lors de la création de la séance',
        code: 'SESSION_CREATION_ERROR'
      });
    }
  },

  /**
   * Mettre à jour une séance
   */
  updateSeance: async (req, res) => {
    try {
      const { id } = req.params;
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Données invalides',
          details: errors.array(),
          code: 'VALIDATION_ERROR'
        });
      }

      const seance = await CreneauCours.findOne({
        where: { id },
        include: [{
          association: 'emploiTemps',
          where: { etablissement_id: req.utilisateur.etablissement_id }
        }]
      });

      if (!seance) {
        return res.status(404).json({
          error: 'Séance non trouvée',
          code: 'SESSION_NOT_FOUND'
        });
      }

      const {
        cours_id,
        salle_id,
        jour_semaine,
        heure_debut,
        heure_fin,
        date_debut_validite,
        date_fin_validite,
        est_rattrapage
      } = req.body;

      // Vérifier les conflits si horaire modifié
      if (jour_semaine || heure_debut || heure_fin) {
        const conflit = await CreneauCours.findOne({
          where: {
            id: { [Op.ne]: id },
            emploi_temps_id: seance.emploi_temps_id,
            jour_semaine: jour_semaine || seance.jour_semaine,
            [Op.or]: [
              {
                heure_debut: {
                  [Op.between]: [
                    heure_debut || seance.heure_debut,
                    heure_fin || seance.heure_fin
                  ]
                }
              },
              {
                heure_fin: {
                  [Op.between]: [
                    heure_debut || seance.heure_debut,
                    heure_fin || seance.heure_fin
                  ]
                }
              }
            ]
          }
        });

        if (conflit) {
          return res.status(409).json({
            error: 'Un créneau existe déjà sur cette plage horaire',
            code: 'TIME_SLOT_CONFLICT'
          });
        }
      }

      await seance.update({
        cours_id: cours_id || seance.cours_id,
        salle_id: salle_id !== undefined ? salle_id : seance.salle_id,
        jour_semaine: jour_semaine || seance.jour_semaine,
        heure_debut: heure_debut || seance.heure_debut,
        heure_fin: heure_fin || seance.heure_fin,
        date_debut_validite: date_debut_validite || seance.date_debut_validite,
        date_fin_validite: date_fin_validite || seance.date_fin_validite,
        est_rattrapage: est_rattrapage !== undefined ? est_rattrapage : seance.est_rattrapage
      });

      const seanceComplete = await CreneauCours.findByPk(id, {
        include: [
          {
            association: 'cours',
            include: [
              { association: 'matiere' },
              {
                association: 'enseignant',
                include: [{ association: 'utilisateur' }]
              }
            ]
          },
          { association: 'salle' }
        ]
      });

      res.json({
        message: 'Séance mise à jour avec succès',
        seance: seanceComplete,
        code: 'SESSION_UPDATED'
      });

    } catch (error) {
      console.error('Erreur mise à jour séance:', error);
      res.status(500).json({
        error: 'Erreur lors de la mise à jour de la séance',
        code: 'SESSION_UPDATE_ERROR'
      });
    }
  },

  /**
   * Supprimer une séance
   */
  deleteSeance: async (req, res) => {
    try {
      const { id } = req.params;

      const seance = await CreneauCours.findOne({
        where: { id },
        include: [{
          association: 'emploiTemps',
          where: { etablissement_id: req.utilisateur.etablissement_id }
        }]
      });

      if (!seance) {
        return res.status(404).json({
          error: 'Séance non trouvée',
          code: 'SESSION_NOT_FOUND'
        });
      }

      await seance.destroy();

      res.json({
        message: 'Séance supprimée avec succès',
        code: 'SESSION_DELETED'
      });

    } catch (error) {
      console.error('Erreur suppression séance:', error);
      res.status(500).json({
        error: 'Erreur lors de la suppression de la séance',
        code: 'SESSION_DELETION_ERROR'
      });
    }
  },

  /**
   * Annuler une séance
   */
  annulerSeance: async (req, res) => {
    try {
      const { id } = req.params;
      const { motif } = req.body;

      const seance = await CreneauCours.findOne({
        where: { id },
        include: [{
          association: 'emploiTemps',
          where: { etablissement_id: req.utilisateur.etablissement_id }
        }]
      });

      if (!seance) {
        return res.status(404).json({
          error: 'Séance non trouvée',
          code: 'SESSION_NOT_FOUND'
        });
      }

      await seance.update({
        statut: StatutCreneau.ANNULE,
        motif_annulation: motif,
        date_annulation: new Date()
      });

      const seanceComplete = await CreneauCours.findByPk(id, {
        include: [
          {
            association: 'cours',
            include: [
              { association: 'matiere' },
              {
                association: 'enseignant',
                include: [{ association: 'utilisateur' }]
              }
            ]
          },
          { association: 'salle' }
        ]
      });

      // Notifier de la disponibilité du créneau
      await NotificationService.notifierCreneauDisponible(seanceComplete, req.io);

      res.json({
        message: 'Séance annulée avec succès',
        seance: seanceComplete,
        code: 'SESSION_CANCELLED'
      });

    } catch (error) {
      console.error('Erreur annulation séance:', error);
      res.status(500).json({
        error: 'Erreur lors de l\'annulation de la séance',
        code: 'SESSION_CANCELLATION_ERROR'
      });
    }
  },

  /**
   * Exporter l'emploi du temps en PDF
   */
  exportPDF: async (req, res) => {
    try {
      const { id, classe_id, enseignant_id, semaine } = req.query;
      const etablissement_id = resolveScopedEtablissementId(req);
      const includeDrafts = isAdminSystem(req.utilisateur) ||
        [RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE].includes(req.utilisateur.role);

      let emploiTemps;

      if (id) {
        emploiTemps = await EmploiTemps.findOne({
          where: applyEtablissementScope(req, { id }),
          include: [
            {
              association: 'classe',
              attributes: ['id', 'nom_classe', 'niveau', 'effectif']
            },
            {
              association: 'etablissement',
              attributes: ['id', 'nom']
            },
            {
              association: 'creneaux',
              include: [
                {
                  association: 'cours',
                  include: [
                    {
                      association: 'matiere',
                      attributes: ['id', 'nom_matiere', 'code_matiere', 'couleur_affichage']
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
                  association: 'salle',
                  attributes: ['id', 'nom_salle', 'batiment', 'capacite']
                }
              ],
              order: [
                ['jour_semaine', 'ASC'],
                ['heure_debut', 'ASC']
              ]
            }
          ]
        });
      } else if (classe_id) {
        emploiTemps = await getEmploiTempsActif(classe_id, semaine, etablissement_id, includeDrafts);
      } else if (enseignant_id) {
        emploiTemps = await getEmploiTempsEnseignant(enseignant_id, semaine, etablissement_id, includeDrafts);
      } else {
        return res.status(400).json({
          error: 'Veuillez spécifier une classe ou un enseignant',
          code: 'MISSING_PARAMETERS'
        });
      }

      if (!emploiTemps) {
        return res.status(404).json({
          error: 'Aucun emploi du temps trouvé',
          code: 'SCHEDULE_NOT_FOUND'
        });
      }

      // Créer le PDF
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 30
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=emploi-temps-${Date.now()}.pdf`);

      doc.pipe(res);

      // --- CONFIGURATION DU GRID ---
      const MARGIN_LEFT = 60;
      const MARGIN_TOP = 120; // Raised from 80
      const GRID_WIDTH = doc.page.width - MARGIN_LEFT - 40;
      const GRID_HEIGHT = doc.page.height - MARGIN_TOP - 40;
      const COL_WIDTH = GRID_WIDTH / 5;
      const START_HOUR = 8;
      const END_HOUR = 19;
      const TOTAL_HOURS = END_HOUR - START_HOUR;
      const PIXELS_PER_HOUR = GRID_HEIGHT / TOTAL_HOURS;

      const joursArr = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
      const joursMap = { 'Lundi': 0, 'Mardi': 1, 'Mercredi': 2, 'Jeudi': 3, 'Vendredi': 4 };

      // Helpers
      const timeToY = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return MARGIN_TOP + (h - START_HOUR + m / 60) * PIXELS_PER_HOUR;
      };

      const getHexColor = (color) => {
        if (!color) return '#e2e8f0'; // Default gray-200
        if (color.startsWith('#')) return color;
        // Basic mapping for named colors if any
        const colors = {
          'blue': '#3b82f6', 'red': '#ef4444', 'green': '#22c55e',
          'yellow': '#eab308', 'purple': '#a855f7', 'pink': '#ec4899'
        };
        return colors[color] || '#e2e8f0';
      };

      // --- EN-TÊTE ---
      if (emploiTemps.etablissement) {
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#475569').text(emploiTemps.etablissement.nom.toUpperCase(), MARGIN_LEFT, 15);
      }
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#000000').text(emploiTemps.nom_version || 'Emploi du Temps', MARGIN_LEFT, 30);

      let subTitle = '';
      if (emploiTemps.classe) subTitle += `Classe: ${emploiTemps.classe.nom_classe} | `;

      // Gérer la période pour les emplois du temps virtuels (enseignants)
      if (emploiTemps.periode_debut && emploiTemps.periode_fin) {
        subTitle += `Période: ${emploiTemps.periode_debut} au ${emploiTemps.periode_fin}`;
      } else if (semaine) {
        subTitle += `Semaine: ${semaine}`;
      } else {
        subTitle += `Année scolaire en cours`;
      }

      doc.font('Helvetica').fontSize(10).fillColor('#64748b').text(subTitle, MARGIN_LEFT, 55);

      // --- DESSIN DU GRID (LIGNES ET JOURS) ---
      // Lignes horizontales (Heures)
      for (let i = 0; i <= TOTAL_HOURS; i++) {
        const y = MARGIN_TOP + i * PIXELS_PER_HOUR;
        doc.moveTo(MARGIN_LEFT, y).lineTo(MARGIN_LEFT + GRID_WIDTH, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.fillColor('#94a3b8').fontSize(8).text(`${START_HOUR + i}:00`, MARGIN_LEFT - 35, y - 4);
      }

      // Colonnes verticales (Jours)
      joursArr.forEach((jour, i) => {
        const x = MARGIN_LEFT + i * COL_WIDTH;
        doc.moveTo(x, MARGIN_TOP).lineTo(x, MARGIN_TOP + GRID_HEIGHT).strokeColor('#e2e8f0').stroke();

        doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10)
          .text(jour.toUpperCase(), x, MARGIN_TOP - 20, { width: COL_WIDTH, align: 'center' });
      });
      // Dernière ligne verticale
      doc.moveTo(MARGIN_LEFT + GRID_WIDTH, MARGIN_TOP).lineTo(MARGIN_LEFT + GRID_WIDTH, MARGIN_TOP + GRID_HEIGHT).stroke();

      // --- DESSIN DES CRÉNEAUX ---
      const creneaux = emploiTemps.creneaux || [];
      creneaux.forEach(creneau => {
        // Mapping case-insensitive pour les jours
        const jourNormalized = creneau.jour_semaine.charAt(0).toUpperCase() + creneau.jour_semaine.slice(1).toLowerCase();
        const dayIdx = joursMap[jourNormalized];
        if (dayIdx === undefined) return;

        const x = MARGIN_LEFT + dayIdx * COL_WIDTH + 2;
        const yStart = timeToY(creneau.heure_debut);
        const yEnd = timeToY(creneau.heure_fin);
        const height = yEnd - yStart;
        const width = COL_WIDTH - 4;

        const color = getHexColor(creneau.cours?.matiere?.couleur_affichage);

        // Dessiner le bloc
        doc.rect(x, yStart, width, height)
          .fillAndStroke(color, '#cbd5e1');

        // Texte inside
        const padding = 5;
        const innerWidth = width - padding * 2;

        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8) // Set text to white
          .text(creneau.cours?.matiere?.nom_matiere || 'N/A', x + padding, yStart + padding, { width: innerWidth, height: 10, ellipsis: true });

        doc.font('Helvetica').fontSize(7).fillColor('#FFFFFF'); // Set second line to white

        let infoLine = "";
        if (creneau.cours?.enseignant?.utilisateur) {
          infoLine += `${creneau.cours.enseignant.utilisateur.prenom[0]}. ${creneau.cours.enseignant.utilisateur.nom}`;
        }
        if (creneau.salle) {
          infoLine += ` • ${creneau.salle.nom_salle}`;
        }

        doc.text(infoLine, x + padding, yStart + 18, { width: innerWidth, height: 20 });
        doc.text(`${creneau.heure_debut} - ${creneau.heure_fin}`, x + padding, yStart + height - 12, { width: innerWidth, align: 'right' });
      });

      doc.end();

    } catch (error) {
      console.error('Erreur export PDF:', error);
      res.status(500).json({
        error: 'Erreur lors de l\'export PDF',
        code: 'PDF_EXPORT_ERROR'
      });
    }
  }
};

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Récupère l'emploi du temps actif publié pour une classe
 */
async function getEmploiTempsActif(classeId, semaine, etablissementId, includeDrafts = false) {
  console.log('🔍 getEmploiTempsActif parameters:', { classeId, semaine, etablissementId, includeDrafts });

  // Debug: verify inputs are valid
  if (!classeId) console.warn('⚠️ classeId is missing!');

  const whereClause = {
    classe_id: classeId,
    etablissement_id: etablissementId,
    statut: includeDrafts
      ? { [Op.not]: StatutEmploiTemps.ARCHIVE }
      : { [Op.in]: [StatutEmploiTemps.PUBLIE, StatutEmploiTemps.VALIDE] }
  };

  if (semaine) {
    const [annee, semaineNum] = semaine.split('-W');
    const dateDebut = getDateFromWeek(parseInt(annee), parseInt(semaineNum));
    const dateFin = new Date(dateDebut);
    dateFin.setDate(dateFin.getDate() + 6);

    // Set hours to cover entire days
    dateDebut.setHours(0, 0, 0, 0);
    dateFin.setHours(23, 59, 59, 999);

    console.log('📅 Date filtering:', { annee, semaineNum, dateDebut, dateFin });

    // Important: we want to find a timetable that overlaps with this week
    // Logic: timetable_start <= week_end AND timetable_end >= week_start
    whereClause.periode_debut = { [Op.lte]: dateFin };
    whereClause.periode_fin = { [Op.gte]: dateDebut };
  }

  console.log('🛠️ Constructed WhereClause:', JSON.stringify(whereClause, null, 2));

  try {
    const emploiTemps = await EmploiTemps.findOne({
      where: whereClause,
      include: [
        {
          association: 'classe',
          attributes: ['id', 'nom_classe', 'niveau', 'effectif']
        },
        {
          association: 'etablissement',
          attributes: ['id', 'nom']
        },
        {
          association: 'creneaux',
          // Pour l'instant, on désactive le filtrage par date des créneaux pour s'assurer qu'ils s'affichent
          // where: semaine ? getCreneauWhereClause(semaine) : {},
          required: false,
          include: [
            {
              association: 'cours',
              include: [
                {
                  association: 'matiere',
                  attributes: ['id', 'nom_matiere', 'code_matiere', 'couleur_affichage']
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
              association: 'salle',
              attributes: ['id', 'nom_salle', 'batiment', 'capacite']
            }
          ],
          order: [
            ['jour_semaine', 'ASC'],
            ['heure_debut', 'ASC']
          ]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    return emploiTemps;

  } catch (error) {
    console.error('❌ Erreur getEmploiTempsActif:', error);
    throw error;
  }
}

/**
 * Récupère l'emploi du temps consolidé d'un enseignant
 */
async function getEmploiTempsEnseignant(enseignantId, semaine, etablissementId, includeDrafts = false) {
  const whereClause = {
    etablissement_id: etablissementId,
    statut: includeDrafts
      ? { [Op.not]: StatutEmploiTemps.ARCHIVE }
      : StatutEmploiTemps.PUBLIE
  };

  if (semaine) {
    const [annee, semaineNum] = semaine.split('-W');
    const dateDebut = getDateFromWeek(parseInt(annee), parseInt(semaineNum));
    const dateFin = new Date(dateDebut);
    dateFin.setDate(dateFin.getDate() + 6);

    whereClause.periode_debut = { [Op.lte]: dateFin };
    whereClause.periode_fin = { [Op.gte]: dateDebut };
  }

  const emploisTemps = await EmploiTemps.findAll({
    where: whereClause,
    include: [
      {
        association: 'classe',
        attributes: ['id', 'nom_classe', 'niveau']
      },
      {
        association: 'etablissement',
        attributes: ['id', 'nom']
      },
      {
        association: 'creneaux',
        where: {
          ...(semaine ? getCreneauWhereClause(semaine) : {})
        },
        required: true,
        include: [
          {
            association: 'cours',
            where: { enseignant_id: enseignantId },
            required: true,
            include: [
              {
                association: 'matiere',
                attributes: ['id', 'nom_matiere', 'code_matiere', 'couleur_affichage']
              },
              {
                association: 'enseignant',
                include: [{
                  association: 'utilisateur',
                  attributes: ['id', 'nom', 'prenom']
                }]
              },
              {
                association: 'classe',
                attributes: ['id', 'nom_classe', 'niveau']
              }
            ]
          },
          {
            association: 'salle',
            attributes: ['id', 'nom_salle', 'batiment', 'capacite']
          }
        ],
        order: [
          ['jour_semaine', 'ASC'],
          ['heure_debut', 'ASC']
        ]
      }
    ],
    order: [['created_at', 'DESC']]
  });



  // Fusionner tous les créneaux de tous les emplois du temps
  const tousLesCreneaux = [];
  emploisTemps.forEach(et => {
    et.creneaux.forEach(creneau => {
      tousLesCreneaux.push({
        ...creneau.toJSON(),
        classe: et.classe
      });
    });
  });

  // Retourner un objet consolidé
  return {
    id: 'enseignant-' + enseignantId,
    nom_version: 'Planning Enseignant',
    periode_debut: emploisTemps[0].periode_debut,
    periode_fin: emploisTemps[0].periode_fin,
    statut: StatutEmploiTemps.PUBLIE,
    etablissement: emploisTemps[0]?.etablissement,
    creneaux: tousLesCreneaux.sort((a, b) => {
      if (a.jour_semaine !== b.jour_semaine) {
        return a.jour_semaine.localeCompare(b.jour_semaine);
      }
      return a.heure_debut.localeCompare(b.heure_debut);
    })
  };
}

/**
 * Génère la clause WHERE pour filtrer les créneaux par semaine
 */
function getCreneauWhereClause(semaine) {
  const [annee, semaineNum] = semaine.split('-W');
  const dateDebut = getDateFromWeek(parseInt(annee), parseInt(semaineNum));
  const dateFin = new Date(dateDebut);
  dateFin.setDate(dateFin.getDate() + 6);

  return {
    [Op.or]: [
      {
        date_debut_validite: { [Op.lte]: dateFin },
        date_fin_validite: { [Op.gte]: dateDebut }
      },
      {
        date_debut_validite: null,
        date_fin_validite: null
      }
    ]
  };
}

/**
 * Convertit une semaine ISO (année, numéro de semaine) en date
 */
function getDateFromWeek(year, week) {
  const firstDayOfYear = new Date(year, 0, 1);
  const daysOffset = (week - 1) * 7;
  const firstMonday = new Date(firstDayOfYear);

  // Trouver le premier lundi de l'année
  const dayOfWeek = firstDayOfYear.getDay();
  const daysToMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7;
  firstMonday.setDate(firstDayOfYear.getDate() + daysToMonday);

  // Ajouter les semaines
  firstMonday.setDate(firstMonday.getDate() + daysOffset);

  return firstMonday;
}



module.exports = emploiTempsController;