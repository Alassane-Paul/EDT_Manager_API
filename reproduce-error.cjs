const { sequelize, Conversation, ConversationParticipant } = require('./database/models');

async function reproduce() {
    try {
        const senderId = '3095b251-f474-4b8a-9d73-194fa47d009e'; // Admin
        const targetUserId = '63f7ba46-ce8a-4ff2-8a34-5bea42bd9e6b'; // Paul Responsable

        console.log(`Reproducing with updated models for ${senderId} -> ${targetUserId}`);

        // Create conversation
        const newConv = await Conversation.create({ type: 'DIRECT' });
        console.log(`✅ Conversation: ${newConv.id}`);

        // Create participants sequentially
        try {
            await ConversationParticipant.create({
                conversation_id: newConv.id,
                utilisateur_id: senderId
            });
            console.log('✅ Participant 1 created');

            await ConversationParticipant.create({
                conversation_id: newConv.id,
                utilisateur_id: targetUserId
            });
            console.log('✅ Participant 2 created');

        } catch (err) {
            console.error('❌ Participant creation failed!');
            if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
                console.error('Validation Errors:', err.errors.map(e => `${e.path}: ${e.message}`));
            } else {
                console.error(err);
            }
        }

        // Cleanup
        await ConversationParticipant.destroy({ where: { conversation_id: newConv.id } });
        await Conversation.destroy({ where: { id: newConv.id } });
        process.exit(0);
    } catch (error) {
        console.error('Outer error:', error);
        process.exit(1);
    }
}

reproduce();
