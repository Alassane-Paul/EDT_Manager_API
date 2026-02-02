const { RepartitionSalle, SessionExamen, Salle, Eleve, Enseignant, Classe, Utilisateur } = require('../database/models');
const { Op } = require('sequelize');

const repartitionController = {
    // Répartition automatique des élèves dans les salles
    autoAssign: async (req, res) => {
        try {
            const { sessionId } = req.params;

            const session = await SessionExamen.findByPk(sessionId, {
                include: [{ model: Classe, as: 'classe' }]
            });

            if (!session) return res.status(404).json({ error: 'Session non trouvée' });

            // Récupérer tous les élèves de la classe
            const eleves = await Eleve.findAll({
                where: { classe_id: session.classe_id },
                include: [{ model: Utilisateur, as: 'utilisateur' }],
                order: [[{ model: Utilisateur, as: 'utilisateur' }, 'nom', 'ASC']]
            });

            if (eleves.length === 0) {
                return res.status(400).json({ error: 'Aucun élève dans cette classe' });
            }

            // Récupérer les salles disponibles (même établissement que la classe)
            const salles = await Salle.findAll({
                where: {
                    etablissement_id: session.classe.etablissement_id,
                    statut: 'DISPONIBLE'
                },
                order: [['capacite', 'DESC']] // Grandes salles d'abord
            });

            if (salles.length === 0) {
                return res.status(400).json({ error: 'Aucune salle disponible' });
            }

            // Supprimer les anciennes répartitions
            await RepartitionSalle.destroy({ where: { session_examen_id: sessionId } });

            // Algorithme de répartition
            const repartitions = [];
            let eleveIndex = 0;

            for (const salle of salles) {
                if (eleveIndex >= eleves.length) break;

                const elevesAssignes = [];
                const capacite = salle.capacite;

                for (let i = 0; i < capacite && eleveIndex < eleves.length; i++) {
                    elevesAssignes.push(eleves[eleveIndex].id);
                    eleveIndex++;
                }

                const repartition = await RepartitionSalle.create({
                    session_examen_id: sessionId,
                    salle_id: salle.id,
                    eleves_assignes: elevesAssignes,
                    nombre_places_utilisees: elevesAssignes.length
                });

                repartitions.push(repartition);
            }

            res.json({
                message: 'Répartition effectuée',
                repartitions,
                total_eleves: eleves.length,
                salles_utilisees: repartitions.length,
                code: 'AUTO_ASSIGN_SUCCESS'
            });

        } catch (error) {
            console.error('Erreur répartition auto:', error);
            res.status(500).json({ error: 'Erreur répartition', code: 'AUTO_ASSIGN_ERROR' });
        }
    },

    // Voir la répartition d'une session
    getRepartition: async (req, res) => {
        try {
            const { sessionId } = req.params;

            const repartitions = await RepartitionSalle.findAll({
                where: { session_examen_id: sessionId },
                include: [
                    { model: Salle, as: 'salle' },
                    { model: Enseignant, as: 'surveillant', include: ['utilisateur'] }
                ]
            });

            res.json({ repartitions, code: 'REPARTITION_RETRIEVED' });
        } catch (error) {
            console.error('Erreur récupération répartition:', error);
            res.status(500).json({ error: 'Erreur serveur', code: 'REPARTITION_ERROR' });
        }
    },

    // Modifier une répartition (assigner surveillant, modifier élèves)
    updateRepartition: async (req, res) => {
        try {
            const { id } = req.params;
            const { surveillant_id, eleves_assignes } = req.body;

            const repartition = await RepartitionSalle.findByPk(id);
            if (!repartition) return res.status(404).json({ error: 'Répartition non trouvée' });

            const updates = {};
            if (surveillant_id !== undefined) updates.surveillant_id = surveillant_id;
            if (eleves_assignes !== undefined) {
                updates.eleves_assignes = eleves_assignes;
                updates.nombre_places_utilisees = eleves_assignes.length;
            }

            await repartition.update(updates);
            res.json({ message: 'Répartition mise à jour', repartition, code: 'REPARTITION_UPDATED' });
        } catch (error) {
            console.error('Erreur mise à jour répartition:', error);
            res.status(500).json({ error: 'Erreur mise à jour', code: 'REPARTITION_UPDATE_ERROR' });
        }
    }
};

module.exports = repartitionController;
