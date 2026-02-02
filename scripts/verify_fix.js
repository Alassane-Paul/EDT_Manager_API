const { StatutProfessionnel } = require('../utils/enums');

console.log('Testing StatutProfessionnel enum...');
console.log('VACATAIRE value:', StatutProfessionnel.VACATAIRE);

if (StatutProfessionnel.VACATAIRE === 'vacataire') {
    console.log('✅ SUCCESS: VACATAIRE is correctly defined.');
    process.exit(0);
} else {
    console.error('❌ FAILURE: VACATAIRE is undefined or incorrect.');
    process.exit(1);
}
