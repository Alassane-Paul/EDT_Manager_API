const { SessionExamen, Matiere, Classe, RepartitionSalle, Salle, Etablissement, Eleve, Evaluation, Note, Rattrapage, Cours } = require('../database/models');
const { Op } = require('sequelize');
const ExamGenerationService = require('../services/examGeneration.service');

const sessionExamenController = {
    // Liste des sessions d'une classe
    getSessionsByClasse: async (req, res) => {
        try {
            const { classeId } = req.params;
            const sessions = await SessionExamen.findAll({
                where: { classe_id: classeId },
                include: [
                    { model: Matiere, as: 'matiere' },
                    { model: Classe, as: 'classe' },
                    { model: RepartitionSalle, as: 'repartitions', include: [{ model: Salle, as: 'salle' }] }
                ],
                order: [['date_examen', 'ASC'], ['heure_debut', 'ASC']]
            });
            res.json({ sessions, code: 'SESSIONS_RETRIEVED' });
        } catch (error) {
            console.error('Erreur récupération sessions:', error);
            res.status(500).json({ error: 'Erreur serveur', code: 'SESSIONS_ERROR' });
        }
    },

    // Calendrier global des examens
    getCalendrier: async (req, res) => {
        try {
            const { date_debut, date_fin, etablissement_id, classe_id } = req.query;

            const where = {};
            if (date_debut && date_fin) {
                where.date_examen = { [Op.between]: [date_debut, date_fin] };
            }
            if (classe_id) {
                where.classe_id = classe_id;
            }

            const sessions = await SessionExamen.findAll({
                where,
                include: [
                    { model: Matiere, as: 'matiere' },
                    {
                        model: Classe,
                        as: 'classe',
                        where: etablissement_id ? { etablissement_id } : undefined
                    }
                ],
                order: [['date_examen', 'ASC'], ['heure_debut', 'ASC']]
            });

            res.json({ sessions, code: 'CALENDRIER_RETRIEVED' });
        } catch (error) {
            console.error('Erreur récupération calendrier:', error);
            res.status(500).json({ error: 'Erreur serveur', code: 'CALENDRIER_ERROR' });
        }
    },

    // Créer une session d'examen
    createSession: async (req, res) => {
        try {
            const { titre, matiere_id, classe_id, date_examen, heure_debut, heure_fin, duree_minutes, type, coefficient, instructions } = req.body;

            // Vérifier les conflits de salle (optionnel à ce stade)
            // La vérification sera faite lors de la répartition

            const session = await SessionExamen.create({
                titre, matiere_id, classe_id, date_examen, heure_debut, heure_fin,
                duree_minutes, type, coefficient, instructions, statut: 'PLANIFIE'
            });

            res.status(201).json({ message: 'Session créée', session, code: 'SESSION_CREATED' });
        } catch (error) {
            console.error('Erreur création session:', error);
            res.status(500).json({ error: 'Erreur création', code: 'SESSION_CREATE_ERROR' });
        }
    },

    // Modifier une session
    updateSession: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            const session = await SessionExamen.findByPk(id);
            if (!session) return res.status(404).json({ error: 'Session non trouvée' });

            await session.update(updates);
            res.json({ message: 'Session mise à jour', session, code: 'SESSION_UPDATED' });
        } catch (error) {
            console.error('Erreur mise à jour session:', error);
            res.status(500).json({ error: 'Erreur mise à jour', code: 'SESSION_UPDATE_ERROR' });
        }
    },

    // Annuler une session
    deleteSession: async (req, res) => {
        try {
            const { id } = req.params;
            const session = await SessionExamen.findByPk(id);

            if (!session) return res.status(404).json({ error: 'Session non trouvée' });

            await session.update({ statut: 'ANNULE' });
            res.json({ message: 'Session annulée', code: 'SESSION_CANCELLED' });
        } catch (error) {
            console.error('Erreur annulation session:', error);
            res.status(500).json({ error: 'Erreur annulation', code: 'SESSION_CANCEL_ERROR' });
        }
    },

    // Obtenir les élèves éligibles pour un rattrapage
    getEligibleStudents: async (req, res) => {
        try {
            const { id } = req.params;
            const session = await SessionExamen.findByPk(id, {
                include: [{ model: Classe, as: 'classe' }]
            });

            if (!session) return res.status(404).json({ error: 'Session non trouvée' });

            // Récupérer tous les élèves de la classe
            const eleves = await Eleve.findAll({
                where: { classe_id: session.classe_id },
                include: ['utilisateur']
            });

            // Identifier les élèves absents ou ayant échoué
            const eligibles = [];
            for (const eleve of eleves) {
                // Vérifier s'il a une note pour cet examen (via Evaluation liée)
                // Pour simplifier, on considère tous les élèves éligibles
                // Dans une vraie implémentation, vérifier les notes et absences
                eligibles.push({
                    eleve_id: eleve.id,
                    nom: eleve.utilisateur.nom,
                    prenom: eleve.utilisateur.prenom,
                    motif: 'ABSENCE' // À déterminer selon la logique métier
                });
            }

            res.json({ eligibles, total: eligibles.length, code: 'ELIGIBLES_RETRIEVED' });
        } catch (error) {
            console.error('Erreur récupération élèves éligibles:', error);
            res.status(500).json({ error: 'Erreur serveur', code: 'ELIGIBLES_ERROR' });
        }
    },

    // Créer une session de rattrapage
    createRetake: async (req, res) => {
        try {
            const { id } = req.params;
            const { date_examen, heure_debut, heure_fin, eleves_eligibles } = req.body;

            const sessionOriginale = await SessionExamen.findByPk(id);
            if (!sessionOriginale) return res.status(404).json({ error: 'Session originale non trouvée' });

            // Créer la session de rattrapage
            const sessionRattrapage = await SessionExamen.create({
                titre: `Rattrapage - ${sessionOriginale.titre}`,
                matiere_id: sessionOriginale.matiere_id,
                classe_id: sessionOriginale.classe_id,
                date_examen,
                heure_debut,
                heure_fin,
                duree_minutes: sessionOriginale.duree_minutes,
                type: 'RATTRAPAGE',
                coefficient: sessionOriginale.coefficient,
                statut: 'PLANIFIE',
                session_examen_originale_id: id
            });

            // Créer les entrées Rattrapage pour chaque élève

            // Trouver le cours correspondant à cette matière et classe
            const cours = await Cours.findOne({
                where: {
                    matiere_id: sessionOriginale.matiere_id,
                    classe_id: sessionOriginale.classe_id
                }
            });

            const rattrapages = [];
            for (const eleve of eleves_eligibles) {
                const rattrapage = await Rattrapage.create({
                    cours_id: cours?.id || sessionOriginale.matiere_id, // Fallback si pas de cours trouvé (attention aux FK)
                    type_rattrapage: 'examen',
                    duree: sessionOriginale.duree_minutes,
                    eleves_concernes: [eleve.eleve_id],
                    statut: 'PLANIFIE',
                    session_examen_id: sessionRattrapage.id,
                    motif_rattrapage: eleve.motif || 'AUTRE',
                    motif: `Rattrapage examen: ${sessionOriginale.titre}`
                });
                rattrapages.push(rattrapage);
            }

            res.status(201).json({
                message: 'Session de rattrapage créée',
                session: sessionRattrapage,
                rattrapages_count: rattrapages.length,
                code: 'RETAKE_CREATED'
            });
        } catch (error) {
            console.error('Erreur création rattrapage:', error);
            res.status(500).json({ error: 'Erreur création rattrapage', code: 'RETAKE_CREATE_ERROR' });
        }
    },

    // Suggérer un créneau disponible
    suggestSlot: async (req, res) => {
        try {
            const { classe_id, date_examen, duree_minutes } = req.query;

            if (!classe_id || !date_examen || !duree_minutes) {
                return res.status(400).json({ error: 'Paramètres manquants' });
            }

            // 1. Récupérer la classe et son établissement pour les horaires
            const classe = await Classe.findByPk(classe_id, {
                include: [{ model: Etablissement, as: 'etablissement' }]
            });

            if (!classe || !classe.etablissement) {
                return res.status(404).json({ error: 'Classe ou établissement non trouvé' });
            }

            const startDayStr = classe.etablissement.heure_debut_journee || '08:00';
            const endDayStr = classe.etablissement.heure_fin_journee || '18:00';

            // 2. Récupérer les sessions existantes ce jour pour cette classe
            const existingSessions = await SessionExamen.findAll({
                where: {
                    classe_id,
                    date_examen,
                    statut: { [Op.ne]: 'ANNULE' }
                },
                order: [['heure_debut', 'ASC']]
            });

            // Fonctions utilitaires de temps
            const timeToMin = (t) => {
                const [h, m] = t.split(':').map(Number);
                return h * 60 + m;
            };
            const minToTime = (m) => {
                const h = Math.floor(m / 60).toString().padStart(2, '0');
                const min = (m % 60).toString().padStart(2, '0');
                return `${h}:${min}`;
            };

            let currentMin = timeToMin(startDayStr);
            const limitMin = timeToMin(endDayStr);
            const durationMin = parseInt(duree_minutes);

            let suggestedStart = null;

            for (const session of existingSessions) {
                const sessionStart = timeToMin(session.heure_debut);
                const sessionEnd = timeToMin(session.heure_fin);

                if (sessionStart - currentMin >= durationMin) {
                    suggestedStart = currentMin;
                    break;
                }
                currentMin = Math.max(currentMin, sessionEnd);
            }

            if (!suggestedStart && limitMin - currentMin >= durationMin) {
                suggestedStart = currentMin;
            }

            if (suggestedStart !== null) {
                res.json({
                    heure_debut: minToTime(suggestedStart),
                    heure_fin: minToTime(suggestedStart + durationMin),
                    code: 'SLOT_SUGGESTED'
                });
            } else {
                res.status(404).json({ error: 'Aucun créneau disponible ce jour', code: 'NO_SLOT_AVAILABLE' });
            }
        } catch (error) {
            console.error('Erreur suggestion créneau:', error);
            res.status(500).json({ error: 'Erreur serveur', code: 'SUGGEST_ERROR' });
        }
    },

    // Génération automatique d'un calendrier d'examens
    bulkGenerate: async (req, res) => {
        try {
            const {
                etablissement_id,
                classe_ids,
                date_debut,
                date_fin,
                type_examen,
                max_examens_par_jour
            } = req.body;

            if (!etablissement_id || !classe_ids || !date_debut || !date_fin || !type_examen) {
                return res.status(400).json({ error: 'Paramètres manquants' });
            }

            const result = await ExamGenerationService.bulkGenerate({
                etablissement_id,
                classe_ids,
                date_debut,
                date_fin,
                type_examen,
                max_examens_par_jour
            });

            res.status(201).json({
                message: 'Génération terminée',
                ...result,
                code: 'BULK_GENERATE_SUCCESS'
            });
        } catch (error) {
            console.error('Erreur génération bulk:', error);
            res.status(500).json({
                error: error.message || 'Erreur lors de la génération',
                code: 'BULK_GENERATE_ERROR'
            });
        }
    }
};

module.exports = sessionExamenController;
