// controllers/teacherAbsenceController.js
const { Absence, Enseignant, Cours, Utilisateur, LogModification } = require('../database/models');
const NotificationService = require('../services/notification.service');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { StatutAbsence, TypeOperation } = require('../utils/enums');
const { resolveEnseignantId } = require('../middleware/auth');

/**
 * Helper to get the Enseignant ID for the logged‑in user.
 */
const getEnseignantId = async (utilisateur) => {
    return await resolveEnseignantId(utilisateur);
};

/**
 * Helper to extract client IP address
 */
const getClientIp = (req) => {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress || 
           req.connection.socket?.remoteAddress || 
           '127.0.0.1';
};

const teacherAbsenceController = {
    /**
     * Retrieve absences belonging to the authenticated teacher.
     */
    getMyAbsences: async (req, res) => {
        try {
            const utilisateur = req.utilisateur;
            const enseignantId = await getEnseignantId(utilisateur);
            if (!enseignantId) {
                return res.status(403).json({ error: 'Enseignant non trouvé ou accès refusé', code: 'TEACHER_NOT_FOUND' });
            }

            const absences = await Absence.findAll({
                where: { enseignant_id: enseignantId },
                attributes: {
                    exclude: ['eleve_id']
                },
                include: [
                    {
                        association: 'enseignant',
                        attributes: ['id', 'utilisateur_id', 'matricule'],
                        include: [
                            {
                                association: 'utilisateur',
                                attributes: ['id', 'prenom', 'nom']
                            }
                        ]
                    },
                    {
                        association: 'cours',
                        attributes: ['id', 'classe_id', 'matiere_id'],
                        include: [
                            {
                                association: 'matiere',
                                attributes: ['id', 'nom_matiere']
                            },
                            {
                                association: 'classe',
                                attributes: ['id', 'nom_classe'],
                                include: [
                                    {
                                        association: 'eleves',
                                        attributes: ['id', 'utilisateur_id', 'matricule'],
                                        include: [
                                            {
                                                association: 'utilisateur',
                                                attributes: ['id', 'prenom', 'nom']
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ],
                order: [['date_debut', 'DESC']]
            });

            res.json({
                success: true,
                absences: absences,
                code: 'TEACHER_ABSENCES_RETRIEVED'
            });
        } catch (error) {
            console.error('Erreur récupération absences enseignant:', error);
            res.status(500).json({
                success: false,
                error: 'Erreur serveur',
                code: 'TEACHER_ABSENCES_ERROR',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    },

    /**
     * Declare a new absence for the authenticated teacher.
     */
    declarerMyAbsence: async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array(), code: 'VALIDATION_ERROR' });
            }

            const utilisateur = req.utilisateur;
            const enseignantId = await getEnseignantId(utilisateur);
            if (!enseignantId) {
                return res.status(403).json({ error: 'Enseignant non trouvé ou accès refusé', code: 'TEACHER_NOT_FOUND' });
            }

            const { cours_id, date_debut, date_fin, motif, code } = req.body;

            // Basic validation – ensure required fields are present
            if (!cours_id || !date_debut || !date_fin || !motif) {
                return res.status(400).json({ error: 'Paramètres manquants', code: 'MISSING_PARAMS' });
            }

            const absence = await Absence.create({
                enseignant_id: enseignantId,
                cours_id,
                date_debut,
                date_fin,
                motif,
                code,
                statut: StatutAbsence.DECLAREE
            });

            // Log the creation
            await LogModification.create({
                utilisateur_id: utilisateur.id,
                table_concernee: 'Absence',
                id_entite_concernee: absence.id,
                type_operation: TypeOperation.CREATION,
                valeur_apres: JSON.stringify({ cours_id, date_debut, date_fin, motif }),
                adresse_ip: getClientIp(req)
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
                success: true,
                absence,
                code: 'ABSENCE_DECLARED'
            });
        } catch (error) {
            console.error('Erreur déclaration absence enseignant:', error);
            res.status(500).json({
                success: false,
                error: 'Erreur serveur',
                code: 'DECLARE_ABSENCE_ERROR',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
};

module.exports = teacherAbsenceController;
