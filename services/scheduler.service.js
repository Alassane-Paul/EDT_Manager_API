// src/services/schedulerService.js
const UsageTrackingService = require('./usageTracking.service');
const BillingService = require('./billing.service');

/**
 * Service de planification des tâches en arrière-plan
 * Utilise des intervalles pour simuler des tâches cron sans dépendances externes
 */
class SchedulerService {
    constructor() {
        this.intervals = [];
    }

    /**
     * Démarrer tous les schedulers
     */
    start() {
        console.log('[Scheduler] Démarrage des tâches automatisées...');

        // 1. Capture quotidienne des métriques (toutes les 24h)
        // On l'exécute aussi une fois au démarrage
        this.scheduleTask('Usage Capture', () => UsageTrackingService.scheduleDailyCapture(), 24 * 60 * 60 * 1000);

        // 2. Vérification quotidienne des factures et suspensions (toutes les 24h)
        this.scheduleTask('Overdue Check', () => BillingService.checkOverdueInvoices(), 24 * 60 * 60 * 1000);

        // 3. Génération mensuelle des factures (vérification toutes les 12h)
        this.scheduleTask('Monthly Billing', () => BillingService.generateMonthlyInvoices(), 12 * 60 * 60 * 1000);

        console.log('[Scheduler] Toutes les tâches ont été planifiées.');
    }

    /**
     * Planifier une tâche
     * @param {string} name Nom de la tâche
     * @param {Function} task Fonction à exécuter
     * @param {number} interval Intervalle en ms
     */
    scheduleTask(name, task, interval) {
        // Exécuter immédiatement au démarrage (optionnel, mais utile pour le dev/test)
        // Pour la prod, on voudrait peut-être attendre le premier intervalle
        setTimeout(async () => {
            console.log(`[Scheduler] Exécution initiale de: ${name}`);
            try {
                await task();
            } catch (err) {
                console.error(`[Scheduler] Erreur lors de l'exécution initiale de ${name}:`, err);
            }
        }, 5000); // Délai de 5s pour laisser le serveur démarrer proprement

        const timer = setInterval(async () => {
            console.log(`[Scheduler] Exécution planifiée de: ${name}`);
            try {
                await task();
            } catch (err) {
                console.error(`[Scheduler] Erreur lors de l'exécution de ${name}:`, err);
            }
        }, interval);

        this.intervals.push({ name, timer });
    }

    /**
     * Arrêter tous les schedulers
     */
    stop() {
        console.log('[Scheduler] Arrêt des tâches automatisées...');
        this.intervals.forEach(({ name, timer }) => {
            clearInterval(timer);
            console.log(`[Scheduler] Tâche arrêtée: ${name}`);
        });
        this.intervals = [];
    }
}

// Singleton
module.exports = new SchedulerService();
