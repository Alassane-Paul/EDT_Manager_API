const { Note, Evaluation, Eleve, Utilisateur, LogModification } = require('../database/models');
const { validationResult } = require('express-validator');

const noteController = {
    // Récupérer les notes d'une évaluation (pour le prof)
    getNotesByEvaluation: async (req, res) => {
        try {
            const { evaluation_id } = req.params;
            const { RoleUtilisateur } = require('../utils/enums');
            const evaluation = await Evaluation.findByPk(evaluation_id);
            if (!evaluation) return res.status(404).json({ error: 'Évaluation non trouvée' });

            const isAdminOrDirector = [RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE].includes(req.utilisateur.role);
            if (!isAdminOrDirector && evaluation.enseignant_id !== req.utilisateur.enseignant?.id) {
                return res.status(403).json({ error: 'Accès non autorisé aux notes de cette évaluation', code: 'NOTES_ACCESS_DENIED' });
            }

            const notes = await Note.findAll({
                where: { evaluation_id },
                include: [
                    {
                        model: Eleve,
                        as: 'eleve',
                        include: [{ model: Utilisateur, as: 'utilisateur', attributes: ['nom', 'prenom'] }]
                    }
                ]
            });
            res.json({ notes, code: 'NOTES_RETRIEVED' });
        } catch (error) {
            console.error('Erreur récupération notes:', error);
            res.status(500).json({ error: 'Erreur récupération notes', code: 'NOTES_ERROR' });
        }
    },

    // Saisie groupée de notes (pour une évaluation)
    bulkUpdateNotes: async (req, res) => {
        try {
            const { evaluation_id } = req.params;
            const { notes } = req.body; // Array of { eleve_id, valeur, appreciation, absent }

            if (!Array.isArray(notes)) return res.status(400).json({ error: 'Format invalide' });

            const evaluation = await Evaluation.findByPk(evaluation_id);
            if (!evaluation) return res.status(404).json({ error: 'Évaluation non trouvée' });

            const { RoleUtilisateur } = require('../utils/enums');
            const isAdminOrDirector = [RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE].includes(req.utilisateur.role);
            if (!isAdminOrDirector && evaluation.enseignant_id !== req.utilisateur.enseignant?.id) {
                return res.status(403).json({ error: 'Accès non autorisé pour modifier les notes de cette évaluation', code: 'NOTES_UPDATE_DENIED' });
            }

            // On boucle (bulkCreate avec updateOnDuplicate est possible mais complexe avec les UUID et Sequelize parfois)
            // L'approche simple transactionnelle est boucle upsert.
            for (const n of notes) {
                const { eleve_id, valeur, appreciation, absent } = n;

                const [noteObj, created] = await Note.findOrCreate({
                    where: { evaluation_id, eleve_id },
                    defaults: { valeur: valeur || 0, appreciation, absent }
                });

                if (!created) {
                    await noteObj.update({ valeur: valeur || 0, appreciation, absent });
                }
            }

            res.json({ message: 'Notes enregistrées', code: 'NOTES_SAVED' });
        } catch (error) {
            console.error('Erreur sauvegarde notes:', error);
            res.status(500).json({ error: 'Erreur sauvegarde notes', code: 'NOTES_SAVE_ERROR' });
        }
    },

    // Notes d'un élève (pour le portail élève/parent)
    getStudentGrades: async (req, res) => {
        try {
            // L'élève connecté ou passé en param (admin)
            const eleve_id = req.params.eleve_id || req.utilisateur.eleve?.id;
            if (!eleve_id) return res.status(400).json({ error: 'Élève non identifié' });

            const notes = await Note.findAll({
                where: { eleve_id },
                include: [
                    {
                        model: Evaluation,
                        as: 'evaluation',
                        include: [{ model: Matiere, as: 'matiere', attributes: ['nom_matiere', 'code_matiere'] }]
                    }
                ],
                order: [['created_at', 'DESC']]
            });
            res.json({ notes, code: 'STUDENT_NOTES_RETRIEVED' });
        } catch (error) {
            console.error('Erreur récupération notes élève:', error);
            res.status(500).json({ error: 'Erreur récupération notes', code: 'NOTES_ERROR' });
        }
    }
};

module.exports = noteController;
