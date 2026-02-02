// controllers/coursController.js
const { Cours, Classe, Matiere, Enseignant, Salle, CreneauCours, Eleve, Rattrapage, Absence } = require('../database/models');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { TypeCours, TypeOperation, RoleUtilisateur } = require('../utils/enums');
const { resolveScopedEtablissementId, isAdminSystem } = require('../utils/scope');

/**
 * Calcule les statistiques de base pour un ensemble de créneaux
 * @param {Array} creneaux 
 * @returns {Object}
 */
const calculerStatsCours = (creneaux = []) => {
  const heuresPlanifiees = creneaux.reduce((total, c) => {
    if (!c.heure_debut || !c.heure_fin) return total;
    const [hD, mD] = c.heure_debut.split(':').map(Number);
    const [hF, mF] = c.heure_fin.split(':').map(Number);
    return total + ((hF * 60 + mF) - (hD * 60 + mD)) / 60;
  }, 0);
  return { heuresPlanifiees };
};

const coursController = {
  /**
   * Récupérer tous les cours
   */
  getAllCours: async (req, res) => {
    try {
      const { page = 1, limit = 100, classe_id, matiere_id, enseignant_id, type_cours } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {};

      const scopedEtablissementId = resolveScopedEtablissementId(req);

      // Filtrer par établissement via les relations
      const includeClause = [
        {
          association: 'classe',
          where: { etablissement_id: scopedEtablissementId },
          attributes: ['id', 'nom_classe']
        },
        {
          association: 'matiere',
          attributes: ['id', 'nom_matiere', 'code_matiere', 'coefficient']
        },
        {
          association: 'enseignant',
          include: [{
            association: 'utilisateur',
            attributes: ['id', 'nom', 'prenom']
          }]
        },
        {
          association: 'salle',
          attributes: ['id', 'nom_salle', 'batiment']
        }
      ];

      if (classe_id) {
        whereClause.classe_id = classe_id;
      }

      if (matiere_id) {
        whereClause.matiere_id = matiere_id;
      }

      if (enseignant_id) {
        whereClause.enseignant_id = enseignant_id;
      }

      if (type_cours) {
        whereClause.type_cours = type_cours;
      }

      // Restriction pour les élèves : voir uniquement les cours de leur classe
      if (req.utilisateur.role === RoleUtilisateur.ELEVE) {
        const eleve = await Eleve.findOne({
          where: { utilisateur_id: req.utilisateur.id },
          attributes: ['id', 'classe_id']
        });

        if (!eleve || !eleve.classe_id) {
          // Si l'élève n'a pas de classe, il ne voit aucun cours
          return res.json({
            cours: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              pages: 0
            },
            code: 'NO_CLASS_ASSIGNED'
          });
        }

        // Force le filtrage sur la classe de l'élève
        whereClause.classe_id = eleve.classe_id;
      }

      const { count, rows: cours } = await Cours.findAndCountAll({
        where: whereClause,
        include: includeClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      res.json({
        cours,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        code: 'COURS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération cours:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des cours',
        code: 'COURS_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Récupérer un cours par ID
   */
  getCoursById: async (req, res) => {
    try {
      const { id } = req.params;

      const scopedEtablissementId = resolveScopedEtablissementId(req);

      const cours = await Cours.findOne({
        where: { id },
        include: [
          {
            association: 'classe',
            where: { etablissement_id: scopedEtablissementId },
            attributes: ['id', 'nom_classe', 'niveau', 'effectif']
          },
          {
            association: 'matiere',
            attributes: ['id', 'nom_matiere', 'code_matiere', 'couleur_affichage', 'coefficient']
          },
          {
            association: 'enseignant',
            include: [{
              association: 'utilisateur',
              attributes: ['id', 'nom', 'prenom', 'email']
            }]
          },
          {
            association: 'salle',
            attributes: ['id', 'nom_salle', 'batiment', 'capacite']
          },
          {
            association: 'creneaux',
            include: [{
              association: 'emploi_temps',
              attributes: ['id', 'nom_version', 'statut']
            }]
          },
          {
            association: 'rattrapages',
            attributes: ['id', 'type_rattrapage', 'statut', 'date_demande']
          },
          {
            association: 'absences',
            attributes: ['id', 'date_debut', 'date_fin', 'statut']
          }
        ]
      });

      if (!cours) {
        return res.status(404).json({
          error: 'Cours non trouvé',
          code: 'COURS_NOT_FOUND'
        });
      }

      res.json({
        cours,
        code: 'COURS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération cours:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération du cours',
        code: 'COURS_RETRIEVAL_ERROR'
      });
    }
  },

  /**
   * Créer un nouveau cours
   */
  createCours: async (req, res) => {
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
        matiere_id,
        enseignant_id,
        salle_id,
        volume_horaire_hebdo,
        duree_seance_standard,
        type_cours,
        enseignement_en_ligne,
        effectif_max,
        couleur_affichage,
        groupe_id
      } = req.body;

      // 1. Récupérer et valider la classe
      const classe = await Classe.findByPk(classe_id);

      if (!classe) {
        return res.status(404).json({
          error: 'Classe non trouvée',
          code: 'CLASS_NOT_FOUND'
        });
      }

      // Vérification des permissions
      const userEtablissementId = await resolveScopedEtablissementId(req);
      const isAdmin = isAdminSystem(req.utilisateur);

      console.log(`[createCours] User: ${req.utilisateur.id}, Role: ${req.utilisateur.role}, EtabId: ${userEtablissementId}, ClassEtabId: ${classe.etablissement_id}`);

      // Si pas admin et la classe n'est pas dans l'établissement de l'utilisateur
      if (!isAdmin && classe.etablissement_id !== userEtablissementId) {
        return res.status(403).json({
          error: 'Accès refusé à cette classe (établissement différent)',
          details: {
            userEtabId: userEtablissementId,
            classEtabId: classe.etablissement_id
          },
          code: 'CLASS_ACCESS_DENIED'
        });
      }

      // L'établissement du cours sera celui de la classe
      const etablissementId = classe.etablissement_id;

      // 2. Vérifier et valider la matière
      const matiere = await Matiere.findByPk(matiere_id);

      if (!matiere) {
        return res.status(404).json({
          error: 'Matière non trouvée',
          code: 'MATIERE_NOT_FOUND'
        });
      }

      if (matiere.etablissement_id !== etablissementId) {
        return res.status(400).json({
          error: 'La matière n\'appartient pas au même établissement que la classe',
          code: 'ESTABLISHMENT_MISMATCH'
        });
      }

      // 3. Vérifier et valider l'enseignant
      const enseignant = await Enseignant.findByPk(enseignant_id);

      if (!enseignant) {
        return res.status(404).json({
          error: 'Enseignant non trouvé',
          code: 'TEACHER_NOT_FOUND'
        });
      }

      if (enseignant.etablissement_id !== etablissementId) {
        return res.status(400).json({
          error: 'L\'enseignant n\'appartient pas au même établissement que la classe',
          code: 'ESTABLISHMENT_MISMATCH'
        });
      }

      // Vérifier que la salle appartient à l'établissement (si fournie)
      if (salle_id) {
        const salle = await Salle.findByPk(salle_id);

        if (!salle) {
          return res.status(404).json({
            error: 'Salle non trouvée',
            code: 'SALLE_NOT_FOUND'
          });
        }

        if (salle.etablissement_id !== etablissementId && salle.etablissement_id !== null) {
          return res.status(400).json({
            error: 'La salle n\'appartient pas au même établissement',
            code: 'ESTABLISHMENT_MISMATCH'
          });
        }
      }

      const cours = await Cours.create({
        classe_id,
        matiere_id,
        enseignant_id,
        salle_id,
        volume_horaire_hebdo,
        duree_seance_standard,
        type_cours,
        enseignement_en_ligne: enseignement_en_ligne || false,
        effectif_max,
        couleur_affichage,
        groupe_id
      });

      res.status(201).json({
        message: 'Cours créé avec succès',
        cours,
        code: 'COURS_CREATED'
      });

    } catch (error) {
      console.error('Erreur création cours:', error);
      res.status(500).json({
        error: 'Erreur lors de la création du cours',
        code: 'COURS_CREATION_ERROR'
      });
    }
  },

  /**
   * Mettre à jour un cours
   */
  updateCours: async (req, res) => {
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

      const userEtablissementId = await resolveScopedEtablissementId(req);
      const isAdmin = isAdminSystem(req.utilisateur);

      const cours = await Cours.findOne({
        where: { id },
        include: [{
          association: 'classe',
          where: isAdmin ? {} : { etablissement_id: userEtablissementId }
        }]
      });

      if (!cours) {
        return res.status(404).json({
          error: 'Cours non trouvé ou accès refusé',
          code: 'COURS_NOT_FOUND'
        });
      }

      // Vérifier les relations si elles sont mises à jour
      if (updates.classe_id) {
        const classe = await Classe.findOne({
          where: {
            id: updates.classe_id,
            etablissement_id: req.utilisateur.etablissement_id
          }
        });

        if (!classe) {
          return res.status(404).json({
            error: 'Classe non trouvée',
            code: 'CLASS_NOT_FOUND'
          });
        }
      }

      if (updates.matiere_id) {
        const matiere = await Matiere.findOne({
          where: {
            id: updates.matiere_id,
            etablissement_id: req.utilisateur.etablissement_id
          }
        });

        if (!matiere) {
          return res.status(404).json({
            error: 'Matière non trouvée',
            code: 'MATIERE_NOT_FOUND'
          });
        }
      }

      if (updates.enseignant_id) {
        const enseignant = await Enseignant.findOne({
          where: {
            id: updates.enseignant_id,
            etablissement_id: req.utilisateur.etablissement_id
          }
        });

        if (!enseignant) {
          return res.status(404).json({
            error: 'Enseignant non trouvé',
            code: 'TEACHER_NOT_FOUND'
          });
        }
      }

      if (updates.salle_id) {
        const salle = await Salle.findOne({
          where: {
            id: updates.salle_id,
            etablissement_id: req.utilisateur.etablissement_id
          }
        });

        if (!salle) {
          return res.status(404).json({
            error: 'Salle non trouvée',
            code: 'SALLE_NOT_FOUND'
          });
        }
      }

      await cours.update(updates);

      res.json({
        message: 'Cours mis à jour avec succès',
        cours,
        code: 'COURS_UPDATED'
      });

    } catch (error) {
      console.error('Erreur mise à jour cours:', error);
      res.status(500).json({
        error: 'Erreur lors de la mise à jour du cours',
        code: 'COURS_UPDATE_ERROR'
      });
    }
  },

  /**
   * Obtenir les créneaux d'un cours
   */
  getCreneaux: async (req, res) => {
    try {
      const { id } = req.params;

      const cours = await Cours.findOne({
        where: { id },
        include: [{
          association: 'classe',
          where: { etablissement_id: req.utilisateur.etablissement_id }
        }]
      });

      if (!cours) {
        return res.status(404).json({
          error: 'Cours non trouvé',
          code: 'COURS_NOT_FOUND'
        });
      }

      const creneaux = await CreneauCours.findAll({
        where: { cours_id: id },
        include: [
          {
            association: 'emploi_temps',
            attributes: ['id', 'nom_version', 'statut', 'periode_debut', 'periode_fin']
          },
          {
            association: 'salle',
            attributes: ['id', 'nom_salle', 'batiment']
          }
        ],
        order: [
          ['jour_semaine', 'ASC'],
          ['heure_debut', 'ASC']
        ]
      });

      res.json({
        cours: {
          id: cours.id,
          type_cours: cours.type_cours,
          volume_horaire_hebdo: cours.volume_horaire_hebdo
        },
        creneaux,
        code: 'COURS_SLOTS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération créneaux:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des créneaux',
        code: 'COURS_SLOTS_ERROR'
      });
    }
  },

  /**
   * Obtenir les statistiques d'un cours
   */
  getCoursStats: async (req, res) => {
    try {
      const { id } = req.params;

      const cours = await Cours.findOne({
        where: { id },
        include: [
          {
            association: 'classe',
            where: { etablissement_id: req.utilisateur.etablissement_id }
          },
          {
            association: 'matiere',
            attributes: ['nom_matiere']
          },
          {
            association: 'enseignant',
            include: [{
              association: 'utilisateur',
              attributes: ['nom', 'prenom']
            }]
          }
        ]
      });

      if (!cours) {
        return res.status(404).json({
          error: 'Cours non trouvé',
          code: 'COURS_NOT_FOUND'
        });
      }

      const [
        totalCreneaux,
        creneauxConfirmes,
        totalRattrapages,
        totalAbsences,
        nombreSeancesHebdo
      ] = await Promise.all([
        CreneauCours.count({ where: { cours_id: id } }),
        CreneauCours.count({ where: { cours_id: id, statut: 'confirme' } }),
        Rattrapage.count({ where: { cours_id: id } }),
        Absence.count({ where: { cours_id: id } }),
        cours.getNombreSeancesHebdo()
      ]);

      res.json({
        stats: {
          matiere: cours.matiere.nom_matiere,
          classe: cours.classe.nom_classe,
          enseignant: `${cours.enseignant.utilisateur.prenom} ${cours.enseignant.utilisateur.nom}`,
          type_cours: cours.type_cours,
          volume_horaire_hebdo: cours.volume_horaire_hebdo,
          nombre_seances_hebdo: nombreSeancesHebdo,
          total_creneaux: totalCreneaux,
          creneaux_confirmes: creneauxConfirmes,
          total_rattrapages: totalRattrapages,
          total_absences: totalAbsences,
          taux_presence: totalCreneaux > 0 ? ((totalCreneaux - totalAbsences) / totalCreneaux * 100).toFixed(2) : 0
        },
        code: 'COURS_STATS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération statistiques cours:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques',
        code: 'COURS_STATS_ERROR'
      });
    }
  },

  /**
   * Récupérer les cours de l'enseignant connecté avec statistiques
   */
  getMesCours: async (req, res) => {
    try {
      const utilisateur = req.utilisateur;

      // Gestionnaire pour les élèves
      if (req.utilisateur.role === RoleUtilisateur.ETUDIANT) {
        const eleve = await Eleve.findOne({
          where: { utilisateur_id: req.utilisateur.id },
          include: [{ association: 'classe' }]
        });

        if (!eleve || !eleve.classe) {
          return res.status(404).json({
            error: 'Classe non trouvée pour cet élève',
            code: 'CLASS_NOT_FOUND'
          });
        }

        // Récupérer les cours de la classe
        const cours = await Cours.findAll({
          where: { classe_id: eleve.classe.id },
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
              association: 'salle',
              attributes: ['id', 'nom_salle', 'batiment']
            },
            {
              association: 'creneaux',
              attributes: ['id', 'jour_semaine', 'heure_debut', 'heure_fin', 'salle_id']
            }
          ]
        });

        const coursFormates = cours.map(c => {
          const stats = calculerStatsCours(c.creneaux);
          return {
            id: c.id,
            matiere_id: c.matiere_id,
            matiere_nom: c.matiere?.nom_matiere || 'Matière inconnue',
            enseignant_id: c.enseignant_id,
            enseignant_nom: c.enseignant?.utilisateur ?
              `${c.enseignant.utilisateur.nom} ${c.enseignant.utilisateur.prenom}` : 'Non assigné',
            classe_id: eleve.classe.id,
            classe_nom: eleve.classe.nom_classe,
            salle_nom: c.salle?.nom_salle || 'Non assignée',
            heures_total: c.volume_horaire_hebdo || 0, // Fallback if planned hours not available
            heures_effectuees: stats.heuresPlanifiees, // Using planned as proxy for now
            couleur: c.matiere?.couleur_affichage,
            creneaux: c.creneaux,
            matiere: c.matiere,
            classe: eleve.classe
          };
        });

        return res.json({
          cours: coursFormates,
          code: 'COURS_RETRIEVED'
        });
      }

      const { role, id: userId } = utilisateur;
      let targetEnseignantId = req.query.enseignantId;

      // Déterminer l'enseignant cible
      let enseignant;
      if (targetEnseignantId) {
        // Si un ID est fourni, vérifier les permissions
        const rolesSuperieurs = [RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE];
        if (!rolesSuperieurs.includes(role)) {
          // Un enseignant ne peut voir que ses propres cours
          const monEnseignant = await Enseignant.findOne({ where: { utilisateur_id: userId } });
          if (!monEnseignant || monEnseignant.id !== targetEnseignantId) {
            return res.status(403).json({ error: 'Accès non autorisé', code: 'FORBIDDEN' });
          }
          enseignant = monEnseignant;
        } else {
          enseignant = await Enseignant.findByPk(targetEnseignantId);
        }
      } else {
        // Sinon, chercher l'enseignant correspondant à l'utilisateur connecté
        enseignant = await Enseignant.findOne({
          where: { utilisateur_id: userId }
        });
      }

      if (!enseignant) {
        return res.status(404).json({
          error: 'Enseignant non trouvé',
          code: 'TEACHER_NOT_FOUND'
        });
      }

      // Récupérer tous les cours de l'enseignant
      const cours = await Cours.findAll({
        where: { enseignant_id: enseignant.id },
        include: [
          {
            association: 'matiere',
            attributes: ['id', 'nom_matiere', 'code_matiere', 'couleur_affichage', 'coefficient']
          },
          {
            association: 'classe',
            attributes: ['id', 'nom_classe', 'niveau', 'effectif'],
            include: [{
              association: 'eleves',
              attributes: ['id', 'matricule'],
              include: [{
                association: 'utilisateur',
                attributes: ['id', 'nom', 'prenom', 'email', 'photo_url']
              }]
            }]
          },
          {
            association: 'creneaux',
            attributes: ['id', 'jour_semaine', 'heure_debut', 'heure_fin', 'date_debut_validite', 'date_fin_validite'],
            separate: true,
            include: [{
              association: 'salle',
              attributes: ['id', 'nom_salle']
            }]
          }
        ]
      });

      // Calculer les statistiques pour chaque cours
      const coursAvecStats = (cours || []).map(c => {
        const creneaux = c.creneaux || [];

        // Calculer heures totales (basé sur volume horaire hebdomadaire)
        const heuresTotal = c.volume_horaire_hebdo || 0;

        // Calculer heures effectuées (basé sur les créneaux passés)
        const now = new Date();
        const creneauxPasses = creneaux.filter(creneau => {
          if (!creneau.date_fin_validite) return false;
          return new Date(creneau.date_fin_validite) < now;
        });

        const minutesEffectuees = creneauxPasses.reduce((total, creneau) => {
          if (!creneau.heure_debut || !creneau.heure_fin) return total;
          try {
            const [hD, mD] = creneau.heure_debut.split(':').map(Number);
            const [hF, mF] = creneau.heure_fin.split(':').map(Number);
            return total + ((hF * 60 + mF) - (hD * 60 + mD));
          } catch (e) {
            return total;
          }
        }, 0);

        const heuresEffectuees = Math.round((minutesEffectuees / 60) * 100) / 100;

        // Trouver le prochain cours
        const creneauxFuturs = creneaux
          .filter(creneau => {
            if (!creneau.date_debut_validite) return true;
            const dateDebut = new Date(creneau.date_debut_validite);
            // Si la date est aujourd'hui ou dans le futur
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return dateDebut >= today;
          })
          .sort((a, b) => {
            const joursOrdre = { lundi: 0, mardi: 1, mercredi: 2, jeudi: 3, vendredi: 4, samedi: 5, dimanche: 6 };
            const jourA = joursOrdre[a.jour_semaine?.toLowerCase()] ?? 99;
            const jourB = joursOrdre[b.jour_semaine?.toLowerCase()] ?? 99;
            if (jourA !== jourB) return jourA - jourB;
            return (a.heure_debut || "").localeCompare(b.heure_debut || "");
          });

        const prochainCreneau = creneauxFuturs[0];
        let prochainCours = null;
        if (prochainCreneau && prochainCreneau.jour_semaine) {
          const jourCapitalized = prochainCreneau.jour_semaine.charAt(0).toUpperCase() +
            prochainCreneau.jour_semaine.slice(1);
          prochainCours = `${jourCapitalized} ${(prochainCreneau.heure_debut || "").substring(0, 5)}`;
        }

        // Récupérer les élèves de la classe
        const elevesMappes = (c.classe?.eleves || []).map(e => {
          const u = e.utilisateur || {};
          return {
            id: e.id,
            matricule: e.matricule,
            nom: u.nom || 'N/A',
            prenom: u.prenom || '',
            photo: u.photo_url,
            email: u.email
          };
        });

        return {
          id: c.id,
          matiere_id: c.matiere_id,
          matiere_nom: c.matiere?.nom_matiere || 'Matière inconnue',
          matiere_code: c.matiere?.code_matiere || '',
          classe_id: c.classe?.id,
          classe_nom: c.classe?.nom_classe || 'N/A',
          classe_niveau: c.classe?.niveau || '',
          couleur: c.matiere?.couleur_affichage || c.couleur_affichage || '#e2e8f0',
          heures_total: heuresTotal,
          heures_effectuees: heuresEffectuees,
          nbEtudiants: elevesMappes.length || c.classe?.effectif || 0,
          prochainCours: prochainCours,
          salle: prochainCreneau?.salle?.nom_salle || null,
          type_cours: c.type_cours,
          creneaux: c.creneaux,
          eleves: elevesMappes,
          matiere: c.matiere,
          classe: c.classe
        };
      });

      res.json({
        cours: coursAvecStats,
        code: 'MY_COURSES_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération mes cours:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération de vos cours',
        code: 'MY_COURSES_ERROR'
      });
    }
  },

  // Supprimer un cours
  deleteCours: async (req, res) => {
    try {
      const { id } = req.params;
      const etablissement_id = await resolveScopedEtablissementId(req);

      const cours = await Cours.findOne({
        where: { id },
        include: [{
          model: Classe,
          as: 'classe',
          where: etablissement_id ? { etablissement_id } : {}
        }]
      });

      if (!cours) {
        return res.status(404).json({
          error: 'Cours non trouvé',
          code: 'COURS_NOT_FOUND'
        });
      }

      await cours.destroy();

      res.json({
        message: 'Cours supprimé avec succès',
        code: 'COURS_DELETED'
      });

    } catch (error) {
      console.error('Erreur suppression cours:', error);
      res.status(500).json({
        error: 'Erreur lors de la suppression du cours',
        code: 'COURS_DELETE_ERROR'
      });
    }
  }
};

module.exports = coursController;