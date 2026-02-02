const { Message, Conversation, Utilisateur, ConversationParticipant, sequelize } = require('./database/models');
const { Op } = require('sequelize');

async function testFullMessageFlow() {
    try {
        console.log('🧪 Testing full message sending flow...');

        // 1. Create a dummy conversation and participants
        const user1 = await Utilisateur.findOne();
        const user2 = await Utilisateur.findAll({ limit: 1, offset: 1 }).then(res => res[0]);

        if (!user1 || !user2) {
            console.error('Not enough users.');
            process.exit(1);
        }

        const conv = await Conversation.create({ type: 'DIRECT' });
        await ConversationParticipant.create({ conversation_id: conv.id, utilisateur_id: user1.id });
        await ConversationParticipant.create({ conversation_id: conv.id, utilisateur_id: user2.id });

        console.log(`Created conv ${conv.id} between ${user1.id} and ${user2.id}`);

        // 2. Try to send message from user1
        try {
            console.log('Sending message...');
            const message = await Message.create({
                conversation_id: conv.id,
                sender_id: user1.id,
                content: 'Flow test message',
                type: 'TEXT'
            });
            console.log('✅ Message created:', message.id);

            // Fetch full message (This tests SELECT including file_url)
            const fullMessage = await Message.findOne({
                where: { id: message.id },
                include: [{ model: Utilisateur, as: 'sender', attributes: ['id', 'nom', 'prenom', 'photo_url'] }]
            });
            console.log('✅ Full message fetched');

            // Cleanup
            await Message.destroy({ where: { id: message.id } });
            console.log('Message deleted');
        } catch (err) {
            console.error('❌ SEND FAILED:', err.message);
            if (err.errors) console.error('Details:', err.errors.map(e => e.message));
        }

        // Cleanup
        await ConversationParticipant.destroy({ where: { conversation_id: conv.id } });
        await Conversation.destroy({ where: { id: conv.id } });
        console.log('✅ Cleanup successful');

    } catch (error) {
        console.error('❌ FLOW FAILED:', error.message);
    }
    process.exit(0);
}

testFullMessageFlow();
