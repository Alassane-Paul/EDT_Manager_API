const subscriptionController = require('../controllers/subscription.controller');

// Mock request and response
const req = {
    utilisateur: {
        id: 'test-user-id',
        etablissement_id: '190cf2b5-2c51-473e-bb98-21ab8f7a1104',
        role: 'directeur'
    },
    query: {
        period: 'current_month'
    }
};

const res = {
    status: function (code) {
        this.statusCode = code;
        return this;
    },
    json: function (data) {
        this.data = data;
        console.log(`Status: ${this.statusCode || 200}`);
        console.log('Response:', JSON.stringify(data, null, 2));
        return this;
    }
};

async function verify() {
    try {
        console.log('--- Testing getSubscription ---');
        await subscriptionController.getSubscription(req, res);

        console.log('\n--- Testing getUsageStats ---');
        await subscriptionController.getUsageStats(req, res);

        console.log('\n✅ Verification complete!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Verification failed:', error);
        process.exit(1);
    }
}

verify();
