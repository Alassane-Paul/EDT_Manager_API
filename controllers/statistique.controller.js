// controllers/statistiqueController.js
const {
  Etablissement,
  Classe,
  Enseignant,
  Cours,
  Salle,
  Matiere,
  EmploiTemps,
  Rattrapage,
  Absence,
  Utilisateur,
  CreneauCours
} = require('../database/models');
const { Op } = require('sequelize');
const { StatutClasse, StatutEmploiTemps, StatutRattrapage, StatutAbsence, RoleUtilisateur } = require('../utils/enums');
const { sequelize } = require('../config/database');

const statistiqueController = {
  /**
   * Obtenir les statistiques générales de l'établissement
   */
  getStatistiquesGenerales: async (req, res) => {
    try {
      const etablissementId = req.utilisateur.etablissement_id;

      const [
        totalClasses,
        totalEnseignants,
        totalSalles,
        totalMatieres,
        totalCours,
        totalUtilisateurs,
        classesActives,
        emploisTempsActifs,
        rattrapagesEnAttente,
        absencesEnCours
      ] = await Promise.all([
        Classe.count({ where: { etablissement_id: etablissementId } }),
        Enseignant.count({ where: { etablissement_id: etablissementId } }),
        Salle.count({ where: { etablissement_id: etablissementId } }),
        Matiere.count({ where: { etablissement_id: etablissementId } }),
        Cours.count({
          include: [{
            association: 'classe',
            where: { etablissement_id: etablissementId }
          }]
        }),
        Utilisateur.count({ where: { etablissement_id: etablissementId } }),
        Classe.count({
          where: {
            etablissement_id: etablissementId,
            statut: StatutClasse.ACTIVE
          }
        }),
        EmploiTemps.count({
          where: {
            etablissement_id: etablissementId,
            statut: StatutEmploiTemps.PUBLIE
          }
        }),
        Rattrapage.count({
          where: { statut: StatutRattrapage.DEMANDE },
          include: [{
            association: 'cours',
            include: [{
              association: 'classe',
              where: { etablissement_id: etablissementId }
            }]
          }]
        }),
        Absence.count({
          where: {
            statut: StatutAbsence.VALIDEE,
            date_debut: { [Op.lte]: new Date() },
            date_fin: { [Op.gte]: new Date() }
          },
          include: [{
            association: 'enseignant',
            where: { etablissement_id: etablissementId }
          }]
        })
      ]);

      // Statistiques d'utilisation des salles
      const sallesUtilisees = await Cours.count({
        where: { salle_id: { [Op.ne]: null } },
        include: [{
          association: 'classe',
          where: { etablissement_id: etablissementId }
        }],
        distinct: true,
        col: 'salle_id'
      });

      const tauxUtilisationSalles = totalSalles > 0 ? (sallesUtilisees / totalSalles * 100).toFixed(2) : 0;

      res.json({
        statistiques: {
          general: {
            total_classes: totalClasses,
            total_enseignants: totalEnseignants,
            total_salles: totalSalles,
            total_matieres: totalMatieres,
            total_cours: totalCours,
            total_utilisateurs: totalUtilisateurs
          },
          etat: {
            classes_actives: classesActives,
            emplois_temps_actifs: emploisTempsActifs,
            rattrapages_en_attente: rattrapagesEnAttente,
            absences_en_cours: absencesEnCours
          },
          utilisation: {
            salles_utilisees: sallesUtilisees,
            taux_utilisation_salles: tauxUtilisationSalles
          }
        },
        code: 'GENERAL_STATS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération statistiques générales:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques générales',
        code: 'GENERAL_STATS_ERROR'
      });
    }
  },

  /**
   * Obtenir les statistiques d'utilisation par période
   */
  getStatistiquesPeriodiques: async (req, res) => {
    try {
      const { periode_debut, periode_fin } = req.query;
      const etablissementId = req.utilisateur.etablissement_id;

      if (!periode_debut || !periode_fin) {
        return res.status(400).json({
          error: 'Les paramètres periode_debut et periode_fin sont requis',
          code: 'PERIOD_PARAMS_REQUIRED'
        });
      }

      const whereClause = {
        created_at: {
          [Op.between]: [periode_debut, periode_fin]
        }
      };

      const [
        nouveauxCours,
        nouveauxEmploisTemps,
        nouvellesAbsences,
        nouveauxRattrapages,
        coursParType,
        absencesParStatut
      ] = await Promise.all([
        Cours.count({
          where: whereClause,
          include: [{
            association: 'classe',
            where: { etablissement_id: etablissementId }
          }]
        }),
        EmploiTemps.count({
          where: {
            ...whereClause,
            etablissement_id: etablissementId
          }
        }),
        Absence.count({
          where: whereClause,
          include: [{
            association: 'enseignant',
            where: { etablissement_id: etablissementId }
          }]
        }),
        Rattrapage.count({
          where: whereClause,
          include: [{
            association: 'cours',
            include: [{
              association: 'classe',
              where: { etablissement_id: etablissementId }
            }]
          }]
        }),
        Cours.findAll({
          where: whereClause,
          include: [{
            association: 'classe',
            where: { etablissement_id: etablissementId }
          }],
          attributes: [
            'type_cours',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count']
          ],
          group: ['type_cours']
        }),
        Absence.findAll({
          where: whereClause,
          include: [{
            association: 'enseignant',
            where: { etablissement_id: etablissementId }
          }],
          attributes: [
            'statut',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count']
          ],
          group: ['statut']
        })
      ]);

      res.json({
        periode: {
          debut: periode_debut,
          fin: periode_fin
        },
        statistiques: {
          nouveaux_cours: nouveauxCours,
          nouveaux_emplois_temps: nouveauxEmploisTemps,
          nouvelles_absences: nouvellesAbsences,
          nouveaux_rattrapages: nouveauxRattrapages,
          repartition_cours_par_type: coursParType,
          repartition_absences_par_statut: absencesParStatut
        },
        code: 'PERIODIC_STATS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération statistiques périodiques:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques périodiques',
        code: 'PERIODIC_STATS_ERROR'
      });
    }
  },

  /**
   * Obtenir les statistiques par classe
   */
  getStatistiquesParClasse: async (req, res) => {
    try {
      const etablissementId = req.utilisateur.etablissement_id;

      const classes = await Classe.findAll({
        where: { etablissement_id: etablissementId },
        attributes: ['id', 'nom_classe', 'niveau', 'effectif', 'statut'],
        include: [
          {
            association: 'cours',
            attributes: [
              [sequelize.fn('COUNT', sequelize.col('id')), 'total_cours'],
              [sequelize.fn('SUM', sequelize.col('volume_horaire_hebdo')), 'total_heures']
            ]
          },
          {
            association: 'emplois_temps',
            where: { statut: StatutEmploiTemps.PUBLIE },
            required: false,
            attributes: [
              [sequelize.fn('COUNT', sequelize.col('id')), 'emplois_actifs']
            ]
          }
        ],
        group: ['Classe.id', 'cours.id', 'emplois_temps.id'],
        raw: true
      });

      const statistiquesClasses = classes.map(classe => ({
        id: classe.id,
        nom_classe: classe.nom_classe,
        niveau: classe.niveau,
        effectif: classe.effectif,
        statut: classe.statut,
        total_cours: classe['cours.total_cours'] || 0,
        total_heures: (classe['cours.total_heures'] || 0) / 60, // Conversion en heures
        emplois_actifs: classe['emplois_temps.emplois_actifs'] || 0
      }));

      res.json({
        statistiques_par_classe: statistiquesClasses,
        code: 'CLASS_STATS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération statistiques par classe:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques par classe',
        code: 'CLASS_STATS_ERROR'
      });
    }
  },

  /**
   * Obtenir les statistiques des enseignants
   */
  getStatistiquesEnseignants: async (req, res) => {
    try {
      const etablissementId = req.utilisateur.etablissement_id;

      const enseignants = await Enseignant.findAll({
        where: { etablissement_id: etablissementId },
        include: [
          {
            association: 'utilisateur',
            attributes: ['nom', 'prenom']
          },
          {
            association: 'cours',
            attributes: [
              [sequelize.fn('COUNT', sequelize.col('id')), 'total_cours'],
              [sequelize.fn('SUM', sequelize.col('volume_horaire_hebdo')), 'total_heures_hebdo']
            ]
          },
          {
            association: 'absences',
            where: { statut: StatutAbsence.VALIDEE },
            required: false,
            attributes: [
              [sequelize.fn('COUNT', sequelize.col('id')), 'absences_validees']
            ]
          }
        ],
        group: ['Enseignant.id', 'utilisateur.id', 'cours.id', 'absences.id'],
        raw: true
      });

      const statistiquesEnseignants = enseignants.map(enseignant => ({
        id: enseignant.id,
        nom_complet: `${enseignant['utilisateur.prenom']} ${enseignant['utilisateur.nom']}`,
        matricule: enseignant.matricule,
        statut: enseignant.statut,
        heures_contractuelles: enseignant.heures_contractuelles_hebdo / 60, // Conversion en heures
        total_cours: enseignant['cours.total_cours'] || 0,
        total_heures_hebdo: (enseignant['cours.total_heures_hebdo'] || 0) / 60, // Conversion en heures
        absences_validees: enseignant['absences.absences_validees'] || 0,
        taux_charge: enseignant.heures_contractuelles_hebdo > 0 ?
          ((enseignant['cours.total_heures_hebdo'] || 0) / enseignant.heures_contractuelles_hebdo * 100).toFixed(2) : 0
      }));

      res.json({
        statistiques_enseignants: statistiquesEnseignants,
        code: 'TEACHER_STATS_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération statistiques enseignants:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques enseignants',
        code: 'TEACHER_STATS_ERROR'
      });
    }
  },

  /**
   * Obtenir le tableau de bord administratif
   */
  getTableauDeBord: async (req, res) => {
    try {
      const etablissementId = req.utilisateur.etablissement_id;
      const aujourdhui = new Date().toISOString().split('T')[0];

      // --- LOGIQUE POUR LES ÉTUDIANTS ---
      if (req.utilisateur.role === "etudiant") { // Using string "etudiant" matching enum
        const eleve = await require('../database/models').Eleve.findOne({
          where: { utilisateur_id: req.utilisateur.id },
          include: [{ association: 'classe' }]
        });

        if (!eleve) {
          return res.status(404).json({ error: 'Élève non trouvé' });
        }

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // Cours d'aujourd'hui (basé sur creneaux)
        // Note: This is a simplified check. Ideally we check the EmploiTemps for the current week.
        // For now, we can count CreneauCours matching today's day of week
        // or just return 0 if too complex to calculate purely from here without duplication.
        // Let's try to query CreneauCours via EmploiTemps of the class.

        // Jours de la semaine: 0=Dimanche, 1=Lundi...
        const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
        const todayDay = days[new Date().getDay()];

        const coursAujourdhui = await require('../database/models').CreneauCours.count({
          where: {
            jour_semaine: todayDay
          },
          include: [{
            association: 'emploi_temps',
            where: {
              classe_id: eleve.classe_id,
              statut: 'publie',
              // Add date range check if possible, or assume active
            }
          }]
        });

        const absences = await Absence.count({ where: { eleve_id: eleve.id } });
        const absencesInjustifiees = await Absence.count({
          where: { eleve_id: eleve.id, statut: 'injustifiee' }
        });

        return res.json({
          tableau_de_bord: {
            etudiant: {
              cours_aujourdhui: coursAujourdhui,
              absences_total: absences,
              absences_injustifiees: absencesInjustifiees,
              classe: eleve.classe ? eleve.classe.nom_classe : 'N/A'
            },
            date_actualisation: aujourdhui
          },
          code: 'DASHBOARD_RETRIEVED'
        });
      }

      // --- LOGIQUE POUR LES ENSEIGNANTS ---
      if (req.utilisateur.role === RoleUtilisateur.ENSEIGNANT) {
        const enseignant = await Enseignant.findOne({
          where: { utilisateur_id: req.utilisateur.id }
        });

        if (!enseignant) {
          return res.status(404).json({ error: 'Enseignant non trouvé' });
        }

        const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
        const todayDay = days[new Date().getDay()];

        const [coursAujourdhui, rattrapagesEnAttente, absencesDeclarees] = await Promise.all([
          CreneauCours.count({
            where: { jour_semaine: todayDay },
            include: [{
              association: 'cours',
              where: { enseignant_id: enseignant.id }
            }]
          }),
          Rattrapage.count({
            where: { statut: StatutRattrapage.DEMANDE },
            include: [{
              association: 'cours',
              where: { enseignant_id: enseignant.id }
            }]
          }),
          Absence.count({
            where: {
              enseignant_id: enseignant.id,
              statut: StatutAbsence.DECLAREE
            }
          })
        ]);

        return res.json({
          tableau_de_bord: {
            enseignant: {
              cours_aujourdhui: coursAujourdhui,
              rattrapages_en_attente: rattrapagesEnAttente,
              absences_declarees: absencesDeclarees
            },
            date_actualisation: aujourdhui
          },
          code: 'DASHBOARD_RETRIEVED'
        });
      }


      // --- LOGIQUE ADMIN/DIRECTEUR (EXISTANTE) ---
      // Alertes et notifications
      const rattrapagesUrgents = await Rattrapage.count({
        where: {
          statut: StatutRattrapage.DEMANDE,
          date_demande: {
            [Op.lte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        },
        include: [{
          association: 'cours',
          include: [{
            association: 'classe',
            where: { etablissement_id: etablissementId }
          }]
        }]
      });

      const sallesEnMaintenance = await Salle.count({
        where: {
          etablissement_id: etablissementId,
          statut: 'maintenance'
        }
      });

      const absencesAValider = await Absence.count({
        where: {
          statut: StatutAbsence.DECLAREE
        },
        include: [{
          association: 'enseignant',
          where: { etablissement_id: etablissementId }
        }]
      });

      // Activité récente
      const activiteRecent = await EmploiTemps.findAll({
        where: {
          etablissement_id: etablissementId,
          created_at: {
            [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        },
        include: [{
          association: 'classe',
          attributes: ['nom_classe']
        }],
        limit: 5,
        order: [['created_at', 'DESC']]
      });

      res.json({
        tableau_de_bord: {
          alertes: {
            rattrapages_urgents: rattrapagesUrgents,
            salles_en_maintenance: sallesEnMaintenance,
            absences_a_valider: absencesAValider
          },
          activite_recente: activiteRecent,
          date_actualisation: aujourdhui
        },
        code: 'DASHBOARD_RETRIEVED'
      });

    } catch (error) {
      console.error('Erreur récupération tableau de bord:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération du tableau de bord',
        code: 'DASHBOARD_ERROR'
      });
    }
  }
};

module.exports = statistiqueController;