const { SeanceVirtuelle, Cours } = require('../database/models');

const seanceVirtuelleController = {
    getSeancesByCours: async (req, res) => {
        try {
            const { cours_id } = req.params;
            const seances = await SeanceVirtuelle.findAll({
                where: { cours_id },
                order: [['date_debut', 'DESC']]
            });
            res.json({ seances, code: 'SEANCES_RETRIEVED' });
        } catch (error) {
            console.error('Erreur récupération séances:', error);
            res.status(500).json({ error: 'Erreur serveur', code: 'SEANCES_ERROR' });
        }
    },

    createSeance: async (req, res) => {
        try {
            const { cours_id, date_debut, date_fin, lien_visio, titre } = req.body;

            const seance = await SeanceVirtuelle.create({
                cours_id, date_debut, date_fin, lien_visio, titre, statut: 'PROGRAMMEE'
            });

            res.status(201).json({ message: 'Séance virtuelle programmée', seance, code: 'SEANCE_CREATED' });
        } catch (error) {
            console.error('Erreur création séance:', error);
            res.status(500).json({ error: 'Erreur création séance', code: 'SEANCE_CREATE_ERROR' });
        }
    },

    deleteSeance: async (req, res) => {
        try {
            const { id } = req.params;
            await SeanceVirtuelle.destroy({ where: { id } });
            res.json({ message: 'Séance supprimée', code: 'SEANCE_DELETED' });
        } catch (error) {
            console.error('Erreur suppression séance:', error);
            res.status(500).json({ error: 'Erreur suppression', code: 'SEANCE_DELETE_ERROR' });
        }
    }
};

module.exports = seanceVirtuelleController;
