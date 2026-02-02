const { Evaluation, Periode, Matiere, Classe, LogModification } = require('../database/models');
const { validationResult } = require('express-validator');
const { TypeOperation } = require('../utils/enums');

const evaluationController = {
    getAllEvaluations: async (req, res) => {
        try {
            const { classe_id, matiere_id, periode_id, enseignant_id } = req.query;
            const where = {};
            if (classe_id) where.classe_id = classe_id;
            if (matiere_id) where.matiere_id = matiere_id;
            if (periode_id) where.periode_id = periode_id;
            const { RoleUtilisateur } = require('../utils/enums');

            // Securité: Un prof ne voit que ses évals
            if (req.utilisateur.role === RoleUtilisateur.ENSEIGNANT) {
                const enseignantId = req.utilisateur.enseignant?.id;
                if (!enseignantId) return res.status(400).json({ error: 'Enseignant non identifié' });
                where.enseignant_id = enseignantId;
            } else if (enseignant_id) {
                where.enseignant_id = enseignant_id;
            }

            const evaluations = await Evaluation.findAll({
                where,
                include: [
                    { model: Matiere, as: 'matiere', attributes: ['nom_matiere'] },
                    { model: Classe, as: 'classe', attributes: ['nom_classe'] },
                    { model: Periode, as: 'periode', attributes: ['libelle'] }
                ],
                order: [['date_evaluation', 'DESC']]
            });
            res.json({ evaluations, code: 'EVALS_RETRIEVED' });
        } catch (error) {
            console.error('Erreur récupération évaluations:', error);
            res.status(500).json({ error: 'Erreur récupération', code: 'EVALS_ERROR' });
        }
    },

    createEvaluation: async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return res.status(400).json({ error: 'Données invalides', details: errors.array() });

            const { titre, type, matiere_id, classe_id, periode_id, coefficient, note_sur, date_evaluation } = req.body;

            // L'enseignant est celui connecté (ou passé si admin)
            const enseignant_id = req.body.enseignant_id || req.utilisateur.enseignant?.id;

            if (!enseignant_id) {
                return res.status(400).json({ error: 'Enseignant non identifié' });
            }

            const evaluation = await Evaluation.create({
                titre, type, matiere_id, classe_id, periode_id, coefficient, note_sur, date_evaluation, enseignant_id
            });

            await LogModification.create({
                utilisateur_id: req.utilisateur.id,
                table_concernee: 'evaluations',
                id_entite_concernee: evaluation.id,
                type_operation: TypeOperation.CREATION,
                adresse_ip: req.ip
            });

            res.status(201).json({ message: 'Évaluation créée', evaluation, code: 'EVAL_CREATED' });
        } catch (error) {
            console.error('Erreur création évaluation:', error);
            res.status(500).json({
                error: 'Erreur création évaluation',
                code: 'EVAL_CREATION_ERROR',
                message: error.message,
                details: error.name === 'SequelizeValidationError' ? error.errors.map(e => e.message) : error.stack
            });
        }
    },

    updateEvaluation: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;
            const evaluation = await Evaluation.findByPk(id);

            if (!evaluation) return res.status(404).json({ error: 'Évaluation non trouvée' });

            const { RoleUtilisateur } = require('../utils/enums');
            const isAdminOrDirector = [RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE].includes(req.utilisateur.role);

            // Vérif droits: Admin/Dir ou le prof créateur
            if (!isAdminOrDirector && evaluation.enseignant_id !== req.utilisateur.enseignant?.id) {
                return res.status(403).json({ error: 'Accès non autorisé à cette évaluation', code: 'EVAL_ACCESS_DENIED' });
            }

            await evaluation.update(updates);
            res.json({ message: 'Évaluation mise à jour', evaluation, code: 'EVAL_UPDATED' });
        } catch (error) {
            console.error('Erreur MAJ évaluation:', error);
            res.status(500).json({ error: 'Erreur MAJ évaluation', code: 'EVAL_UPDATE_ERROR' });
        }
    },

    deleteEvaluation: async (req, res) => {
        try {
            const { id } = req.params;
            const evaluation = await Evaluation.findByPk(id);
            const { RoleUtilisateur } = require('../utils/enums');
            const isAdminOrDirector = [RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE].includes(req.utilisateur.role);

            // Vérif droits: Admin/Dir ou le prof créateur
            if (!isAdminOrDirector && evaluation.enseignant_id !== req.utilisateur.enseignant?.id) {
                return res.status(403).json({ error: 'Accès non autorisé à cette évaluation', code: 'EVAL_ACCESS_DENIED' });
            }

            await evaluation.destroy();
            res.json({ message: 'Évaluation supprimée', code: 'EVAL_DELETED' });
        } catch (error) {
            console.error('Erreur suppression évaluation:', error);
            res.status(500).json({ error: 'Erreur suppression évaluation', code: 'EVAL_DELETE_ERROR' });
        }
    }
};

module.exports = evaluationController;
