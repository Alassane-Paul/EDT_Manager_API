const { SessionExamen, Cours, Classe, Matiere, Etablissement } = require('../database/models');
const { Op } = require('sequelize');

class ExamGenerationService {
    /**
     * Génère en masse des sessions d'examen pour un ensemble de classes sur une période donnée
     */
    static async bulkGenerate(params) {
        const {
            etablissement_id,
            classe_ids,
            date_debut,
            date_fin,
            type_examen,
            max_examens_par_jour = 2,
            pause_dejeuner_debut = '12:00',
            pause_dejeuner_fin = '14:00'
        } = params;

        // 1. Récupérer l'établissement pour les horaires par défaut
        const etablissement = await Etablissement.findByPk(etablissement_id);
        const startDayStr = etablissement?.heure_debut_journee || '08:00';
        const endDayStr = etablissement?.heure_fin_journee || '18:00';

        // 2. Récupérer tous les cours (matières actives) pour les classes cibles
        const allCours = await Cours.findAll({
            where: {
                classe_id: { [Op.in]: classe_ids }
            },
            include: [
                { model: Matiere, as: 'matiere' },
                { model: Classe, as: 'classe' }
            ]
        });

        if (allCours.length === 0) {
            throw new Error("Aucun cours trouvé pour les classes sélectionnées.");
        }

        // 3. Préparer la liste des dates disponibles (exclu week-ends pour simplifier)
        const dates = this.getAvailableDates(date_debut, date_fin);
        if (dates.length === 0) {
            throw new Error("Aucun jour ouvrable trouvé dans la période sélectionnée.");
        }

        const createdSessions = [];
        const errors = [];

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

        const lunchStartMin = timeToMin(pause_dejeuner_debut);
        const lunchEndMin = timeToMin(pause_dejeuner_fin);
        const dayStartMin = timeToMin(startDayStr);

        // 4. Planification par classe
        for (const classeId of classe_ids) {
            const coursClasse = allCours.filter(c => c.classe_id === classeId);
            let dateIndex = 0;
            let currentExamsToday = 0;
            let currentMin = dayStartMin;

            for (const cours of coursClasse) {
                // Si on a atteint la limite par jour ou plus de temps, on passe au lendemain
                if (currentExamsToday >= max_examens_par_jour || currentMin >= timeToMin(endDayStr)) {
                    dateIndex++;
                    currentExamsToday = 0;
                    currentMin = dayStartMin;
                }

                // Si on a épuisé les dates, on arrête pour cette classe
                if (dateIndex >= dates.length) {
                    errors.push(`Pas assez de jours pour planifier tous les examens de la classe ${cours.classe.nom_classe}`);
                    break;
                }

                const date = dates[dateIndex];
                const duree = cours.matiere.duree_standard || 120;

                // Gérer la pause déjeuner
                if (currentMin < lunchStartMin && (currentMin + duree) > lunchStartMin) {
                    currentMin = lunchEndMin;
                }

                const heureDebut = minToTime(currentMin);
                const heureFin = minToTime(currentMin + duree);

                // Créer la session
                const session = await SessionExamen.create({
                    titre: `${type_examen} - ${cours.matiere.nom_matiere}`,
                    matiere_id: cours.matiere_id,
                    classe_id: cours.classe_id,
                    date_examen: date,
                    heure_debut: heureDebut,
                    heure_fin: heureFin,
                    duree_minutes: duree,
                    type: type_examen,
                    coefficient: cours.matiere.coefficient || 2,
                    statut: 'PLANIFIE'
                });

                createdSessions.push(session);
                currentMin += duree + 30; // 30 min de pause entre examens
                currentExamsToday++;
            }
        }

        return {
            total_created: createdSessions.length,
            sessions: createdSessions,
            warnings: errors
        };
    }

    static getAvailableDates(start, end) {
        const dates = [];
        let current = new Date(start);
        const endDate = new Date(end);

        while (current <= endDate) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) { // Exclure Dimanche et Samedi
                dates.push(current.toISOString().split('T')[0]);
            }
            current.setDate(current.getDate() + 1);
        }
        return dates;
    }
}

module.exports = ExamGenerationService;
