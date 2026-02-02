require('dotenv').config();
const { sequelize } = require('../config/database');

async function normalizeEmails() {
  try {
    console.log('🔄 Starting email normalization...');

    // Execute raw SQL to normalize all emails
    const results = await sequelize.query(`
      UPDATE utilisateurs 
      SET email = LOWER(TRIM(email)) 
      WHERE email != LOWER(TRIM(email))
    `);

    console.log(`✅ Email normalization completed`);

    // Verify the updates
    const users = await sequelize.query(
      'SELECT id, email FROM utilisateurs LIMIT 5',
      { type: sequelize.QueryTypes.SELECT }
    );
    console.log('Sample users after normalization:', users);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error normalizing emails:', error);
    process.exit(1);
  }
}

normalizeEmails();
