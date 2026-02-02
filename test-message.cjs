const { Message, Conversation, Utilisateur, ConversationParticipant } = require('./database/models');

async function testSendMessage() {
    try {
        console.log('🧪 Testing message sending...');

        // 1. Get a conversation
        const conv = await Conversation.findOne({ where: { type: 'DIRECT' } });
        if (!conv) {
            console.error('No conversation found. Run conversation test first.');
            process.exit(1);
        }

        // 2. Get a user
        const user = await Utilisateur.findOne();
        if (!user) {
            console.error('No user found.');
            process.exit(1);
        }

        console.log(`Using conv ${conv.id} and user ${user.id}`);

        // 3. Try to create a message
        try {
            const msg = await Message.create({
                conversation_id: conv.id,
                sender_id: user.id,
                content: 'Hello, this is a test message',
                type: 'TEXT'
            });
            console.log('✅ Message created successfully:', msg.id);

            // Clean up
            await Message.destroy({ where: { id: msg.id } });
            console.log('✅ Cleanup successful');
        } catch (err) {
            console.error('❌ Failed to create message:', err.message);
            if (err.errors) {
                console.error('Validation errors:', err.errors.map(e => `${e.path}: ${e.message}`));
            }
            throw err;
        }

    } catch (error) {
        console.error('Outer error:', error.message);
        process.exit(1);
    }
    process.exit(0);
}

testSendMessage();
