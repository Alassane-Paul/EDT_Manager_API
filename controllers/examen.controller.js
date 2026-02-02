const { ExamenEnLigne, Question, ReponseEleve, TentativeExamen, Eleve, Cours } = require('../database/models');
const { validationResult } = require('express-validator');

const examenController = {
    // Liste des examens d'un cours
    getExamensByCours: async (req, res) => {
        try {
            const { cours_id } = req.params;
            const examens = await ExamenEnLigne.findAll({
                where: { cours_id },
                include: [{ model: Question, as: 'questions' }],
                order: [['date_ouverture', 'DESC']]
            });
            res.json({ examens, code: 'EXAMENS_RETRIEVED' });
        } catch (error) {
            console.error('Erreur récupération examens:', error);
            res.status(500).json({ error: 'Erreur serveur', code: 'EXAMENS_ERROR' });
        }
    },

    // Créer un examen
    createExamen: async (req, res) => {
        try {
            const { titre, description, cours_id, duree_minutes, date_ouverture, date_fermeture, note_totale } = req.body;
            const enseignant_id = req.utilisateur.enseignant?.id;

            if (!enseignant_id && req.utilisateur.role !== 'admin') {
                return res.status(403).json({ error: 'Non autorisé' });
            }

            const examen = await ExamenEnLigne.create({
                titre, description, cours_id, duree_minutes, date_ouverture, date_fermeture,
                note_totale, enseignant_id: enseignant_id || null, statut: 'BROUILLON'
            });

            res.status(201).json({ message: 'Examen créé', examen, code: 'EXAMEN_CREATED' });
        } catch (error) {
            console.error('Erreur création examen:', error);
            res.status(500).json({ error: 'Erreur création', code: 'EXAMEN_CREATE_ERROR' });
        }
    },

    // Ajouter une question à un examen
    addQuestion: async (req, res) => {
        try {
            const { examen_id } = req.params;
            const { type, enonce, points, options, reponse_correcte, ordre } = req.body;

            const question = await Question.create({
                examen_id, type, enonce, points, options, reponse_correcte, ordre
            });

            res.status(201).json({ message: 'Question ajoutée', question, code: 'QUESTION_ADDED' });
        } catch (error) {
            console.error('Erreur ajout question:', error);
            res.status(500).json({ error: 'Erreur ajout question', code: 'QUESTION_ADD_ERROR' });
        }
    },

    // Publier un examen
    publishExamen: async (req, res) => {
        try {
            const { id } = req.params;
            const examen = await ExamenEnLigne.findByPk(id);
            if (!examen) return res.status(404).json({ error: 'Examen non trouvé' });

            await examen.update({ statut: 'PUBLIE' });
            res.json({ message: 'Examen publié', examen, code: 'EXAMEN_PUBLISHED' });
        } catch (error) {
            console.error('Erreur publication examen:', error);
            res.status(500).json({ error: 'Erreur publication', code: 'EXAMEN_PUBLISH_ERROR' });
        }
    },

    // Démarrer une tentative (étudiant)
    startTentative: async (req, res) => {
        try {
            const { examen_id } = req.params;
            const eleve_id = req.utilisateur.eleve?.id;

            if (!eleve_id) return res.status(403).json({ error: 'Accès étudiant requis' });

            // Vérifier si l'examen est ouvert
            const examen = await ExamenEnLigne.findByPk(examen_id, { include: [{ model: Question, as: 'questions' }] });
            if (!examen) return res.status(404).json({ error: 'Examen non trouvé' });

            const now = new Date();
            if (now < new Date(examen.date_ouverture) || now > new Date(examen.date_fermeture)) {
                return res.status(400).json({ error: 'Examen non disponible' });
            }

            // Créer une tentative
            const tentative = await TentativeExamen.create({
                examen_id, eleve_id, date_debut: new Date(), statut: 'EN_COURS'
            });

            res.json({ message: 'Tentative démarrée', tentative, examen, code: 'TENTATIVE_STARTED' });
        } catch (error) {
            console.error('Erreur démarrage tentative:', error);
            res.status(500).json({ error: 'Erreur démarrage', code: 'TENTATIVE_START_ERROR' });
        }
    },

    // Soumettre les réponses
    submitReponses: async (req, res) => {
        try {
            const { tentative_id } = req.params;
            const { reponses } = req.body; // Array of { question_id, reponse }

            const tentative = await TentativeExamen.findByPk(tentative_id, {
                include: [{ model: ExamenEnLigne, as: 'examen', include: [{ model: Question, as: 'questions' }] }]
            });

            if (!tentative) return res.status(404).json({ error: 'Tentative non trouvée' });

            let totalPoints = 0;

            // Sauvegarder et corriger automatiquement
            for (const rep of reponses) {
                const question = tentative.examen.questions.find(q => q.id === rep.question_id);
                if (!question) continue;

                let estCorrecte = false;
                let pointsObtenus = 0;

                if (question.type === 'QCM') {
                    const optionChoisie = question.options[parseInt(rep.reponse)];
                    estCorrecte = optionChoisie?.correct === true;
                    pointsObtenus = estCorrecte ? question.points : 0;
                } else if (question.type === 'VRAI_FAUX') {
                    estCorrecte = rep.reponse === question.reponse_correcte;
                    pointsObtenus = estCorrecte ? question.points : 0;
                }

                totalPoints += pointsObtenus;

                await ReponseEleve.create({
                    examen_id: tentative.examen_id,
                    eleve_id: tentative.eleve_id,
                    question_id: rep.question_id,
                    reponse: rep.reponse,
                    est_correcte: estCorrecte,
                    points_obtenus: pointsObtenus
                });
            }

            // Mettre à jour la tentative
            await tentative.update({
                date_fin: new Date(),
                note_obtenue: totalPoints,
                statut: 'CORRIGE'
            });

            res.json({ message: 'Examen soumis', note: totalPoints, code: 'EXAMEN_SUBMITTED' });
        } catch (error) {
            console.error('Erreur soumission:', error);
            res.status(500).json({ error: 'Erreur soumission', code: 'SUBMIT_ERROR' });
        }
    },

    // Résultats d'un étudiant
    getResultats: async (req, res) => {
        try {
            const { tentative_id } = req.params;
            const tentative = await TentativeExamen.findByPk(tentative_id, {
                include: [
                    { model: ExamenEnLigne, as: 'examen' },
                    { model: Eleve, as: 'eleve', include: ['utilisateur'] }
                ]
            });

            if (!tentative) return res.status(404).json({ error: 'Tentative non trouvée' });

            const reponses = await ReponseEleve.findAll({
                where: { examen_id: tentative.examen_id, eleve_id: tentative.eleve_id },
                include: [{ model: Question, as: 'question' }]
            });

            res.json({ tentative, reponses, code: 'RESULTATS_RETRIEVED' });
        } catch (error) {
            console.error('Erreur récupération résultats:', error);
            res.status(500).json({ error: 'Erreur récupération', code: 'RESULTATS_ERROR' });
        }
    }
};

module.exports = examenController;
