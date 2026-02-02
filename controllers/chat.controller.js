const { Conversation, Message, ConversationParticipant, Utilisateur } = require('../database/models');
const { Op } = require('sequelize');

exports.getConversations = async (req, res) => {
    try {
        const userId = req.utilisateur.id;
        console.log(`DEBUG CHAT: fetching conversations for user ${userId}`);

        const userConversations = await ConversationParticipant.findAll({
            where: { utilisateur_id: userId },
            attributes: ['conversation_id', 'unread_count', 'last_read_at']
        });
        console.log(`DEBUG CHAT: User ${userId} has ${userConversations.length} participations`);

        const conversationIds = userConversations.map(uc => uc.conversation_id);
        console.log(`DEBUG CHAT: Conv IDs: ${conversationIds.join(', ')}`);

        if (conversationIds.length === 0) {
            console.log(`DEBUG CHAT: No conversations for user ${userId}`);
            return res.json([]);
        }

        const fullConversations = await Conversation.findAll({
            where: { id: conversationIds },
            include: [
                {
                    model: Utilisateur,
                    as: 'participants',
                    attributes: ['id', 'nom', 'prenom', 'photo_url', 'role'],
                    through: { attributes: [] }
                },
                {
                    model: Message,
                    as: 'messages',
                    limit: 1,
                    order: [['created_at', 'DESC']]
                }
            ],
            order: [['last_message_at', 'DESC']]
        });
        console.log(`DEBUG CHAT: Found ${fullConversations.length} full conversations`);

        // Merge participant metadata (unread count)
        const result = [];
        for (const conv of fullConversations) {
            try {
                const userMeta = (userConversations || []).find(uc => uc.conversation_id === conv.id);
                const convParticipants = conv.participants || [];
                const otherParticipants = convParticipants.filter(p =>
                    p.id && userId && p.id.toString().toLowerCase() !== userId.toString().toLowerCase()
                );

                const lastMessage = (conv.messages && conv.messages.length > 0) ? conv.messages[0] : null;

                // Determiner le nom de la conversation (si DIRECT, c'est le nom de l'autre)
                let name = "Discussion";
                let photo = null;
                if (conv.type === 'DIRECT' && otherParticipants.length > 0) {
                    const other = otherParticipants[0];
                    name = `${other.prenom} ${other.nom}`;
                    photo = other.photo_url;
                } else if (conv.type === 'GROUP') {
                    name = conv.name || "Groupe";
                }

                result.push({
                    id: conv.id,
                    type: conv.type,
                    name: name,
                    photo: photo,
                    unread_count: userMeta ? userMeta.unread_count : 0,
                    last_message: lastMessage ? {
                        id: lastMessage.id,
                        content: lastMessage.deleted_at ? "Ce message a été supprimé" : lastMessage.content,
                        created_at: lastMessage.created_at,
                        sender_id: lastMessage.sender_id,
                        is_read: lastMessage.is_read,
                        is_deleted: !!lastMessage.deleted_at
                    } : null,
                    participants: convParticipants,
                    updated_at: conv.updated_at
                });
            } catch (err) {
                console.error(`ERROR formatting conversation ${conv.id}:`, err);
            }
        }

        console.log(`DEBUG CHAT: Returning ${result.length} conversations for user ${userId}`);
        res.json(result);
    } catch (error) {
        console.error('ERROR in getConversations:', error);
        res.status(500).json({
            error: 'Erreur serveur lors de la récupération des conversations',
            details: error.message,
            stack: error.stack,
            errorObject: error
        });
    }
};

exports.getMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        const messages = await Message.findAndCountAll({
            where: { conversation_id: id },
            include: [
                {
                    model: Utilisateur,
                    as: 'sender',
                    attributes: ['id', 'nom', 'prenom', 'photo_url']
                }
            ],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // Post-process to hide deleted content
        const rows = messages.rows.map(m => {
            const plain = m.get({ plain: true });
            if (plain.deleted_at) {
                plain.content = "Ce message a été supprimé";
                plain.is_deleted = true;
            }
            return plain;
        });

        res.json({
            messages: rows.reverse(), // On renvoie dans l'ordre chronologique pour l'affichage
            total: messages.count,
            page: parseInt(page),
            totalPages: Math.ceil(messages.count / limit)
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({
            error: 'Erreur serveur lors de la récupération des messages',
            details: error.message,
            stack: error.stack
        });
    }
};

exports.startConversation = async (req, res) => {
    try {
        const senderId = req.utilisateur.id;
        const { targetUserId } = req.body;
        console.log(`DEBUG CHAT: User ${senderId} wants to start conversation with ${targetUserId}`);

        if (!targetUserId) {
            return res.status(400).json({ error: 'ID utilisateur cible requis' });
        }

        if (senderId === targetUserId) {
            return res.status(400).json({ error: 'Impossible de démarrer une discussion avec soi-même via cette méthode' });
        }

        // Logic refined: search for existing direct conversation with BOTH participants
        const candidates = await Conversation.findAll({
            where: { type: 'DIRECT' },
            include: [{
                model: ConversationParticipant,
                as: 'participants_meta',
                where: { utilisateur_id: [senderId, targetUserId] }
            }]
        });

        // A DIRECT conversation must have EXACTLY these 2 participants.
        // The include with where [senderId, targetUserId] will return meta records for those two.
        // We find the conversation that has meta records for BOTH.
        const found = candidates.find(c => c.participants_meta.length === 2);

        if (found) {
            console.log(`DEBUG CHAT: Found existing conversation: ${found.id} for users ${senderId} and ${targetUserId}`);
            console.log(`DEBUG CHAT: Participants matching were:`, found.participants_meta.map(p => p.utilisateur_id));
            return res.json({ id: found.id, isNew: false });
        }

        console.log(`DEBUG CHAT: Creating new DIRECT conversation`);
        const newConv = await Conversation.create({ type: 'DIRECT' });

        console.log(`DEBUG CHAT: Adding participants for conversation: ${newConv.id}`);
        // Use sequential creates instead of bulkCreate for better reliability and individual hook triggering
        await ConversationParticipant.create({
            conversation_id: newConv.id,
            utilisateur_id: senderId
        });

        await ConversationParticipant.create({
            conversation_id: newConv.id,
            utilisateur_id: targetUserId
        });

        console.log(`DEBUG CHAT: New conversation and participants created successfully: ${newConv.id}`);
        res.status(201).json({ id: newConv.id, isNew: true });

    } catch (error) {
        console.error('Error starting conversation:', error);

        let details = error.message;
        if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
            details = error.errors.map(e => `${e.path}: ${e.message}`).join(', ');
            console.error('Validation details:', details);
        }

        res.status(500).json({
            error: 'Erreur serveur lors de l\'initiation de la discussion',
            details: details,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const senderId = req.utilisateur.id;
        const { id: conversationId } = req.params;
        const { content, type = 'TEXT' } = req.body;

        if (!content || content.trim() === '') {
            return res.status(400).json({ error: 'Le contenu du message ne peut pas être vide' });
        }

        // Optional: Verify sender is participant
        const isParticipant = await ConversationParticipant.findOne({
            where: { conversation_id: conversationId, utilisateur_id: senderId }
        });

        if (!isParticipant) {
            console.log(`DEBUG CHAT: User ${senderId} tried to send message to conv ${conversationId} but is NOT a participant`);
            return res.status(403).json({ error: 'Vous ne faites pas partie de cette conversation' });
        }

        console.log(`DEBUG CHAT: Creating message for conv ${conversationId} from sender ${senderId}`);
        const message = await Message.create({
            conversation_id: conversationId,
            sender_id: senderId,
            content: content.trim(),
            type
        });
        console.log(`DEBUG CHAT: Message created: ${message.id}`);

        // Update conversation timestamp
        console.log(`DEBUG CHAT: Updating conversation ${conversationId} timestamp`);
        await Conversation.update(
            { last_message_at: new Date() },
            { where: { id: conversationId } }
        );

        // Increment unread counts for OTHERS
        // 1. Get other participants
        console.log(`DEBUG CHAT: Finding other participants for conv ${conversationId}`);
        const others = await ConversationParticipant.findAll({
            where: {
                conversation_id: conversationId,
                utilisateur_id: { [Op.ne]: senderId }
            }
        });

        // 2. Update their unread count
        console.log(`DEBUG CHAT: Incrementing unread count for ${others.length} participants`);
        for (const p of others) {
            await p.increment('unread_count');
        }

        // Fetch full message with sender info for emission and response
        console.log(`DEBUG CHAT: Fetching full message ${message.id}`);
        const fullMessage = await Message.findOne({
            where: { id: message.id },
            include: [{ model: Utilisateur, as: 'sender', attributes: ['id', 'nom', 'prenom', 'photo_url'] }]
        });


        // Socket.io emission
        if (req.io) {
            req.io.to(`conversation_${conversationId}`).emit('receive_message', fullMessage);

            // Notify ALL participants (including sender) to update their sidebar
            const allParticipants = await ConversationParticipant.findAll({
                where: { conversation_id: conversationId },
                attributes: ['utilisateur_id']
            });

            for (const p of allParticipants) {
                req.io.to(`user_${p.utilisateur_id}`).emit('new_message_notification', {
                    conversationId,
                    message: fullMessage
                });
            }
        } else {
            console.log('DEBUG CHAT: req.io is MISSING');
        }

        res.status(201).json(fullMessage);
    } catch (error) {
        console.error('ERROR in sendMessage:', error);

        let details = error.message;
        if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
            details = error.errors.map(e => `${e.path}: ${e.message}`).join(', ');
            console.error('Validation details:', details);
        }

        res.status(500).json({
            error: 'Erreur serveur lors de l\'envoi du message',
            details: details,
            stack: error.stack,
            errorObject: error
        });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const userId = req.utilisateur.id;
        const { id } = req.params; // conversationId

        await ConversationParticipant.update(
            { unread_count: 0, last_read_at: new Date() },
            { where: { conversation_id: id, utilisateur_id: userId } }
        );

        // Update messages as read
        const now = new Date();
        await Message.update(
            { is_read: true, read_at: now },
            {
                where: {
                    conversation_id: id,
                    sender_id: { [Op.ne]: userId },
                    is_read: false
                }
            }
        );

        // Emit socket event for read status
        if (req.io) {
            req.io.to(`conversation_${id}`).emit('messages_read', {
                conversation_id: id,
                reader_id: userId,
                read_at: now
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error marking as read:', error);
        res.status(500).json({
            error: 'Erreur serveur lors du marquage comme lu',
            details: error.message,
            stack: error.stack
        });
    }
};

exports.acknowledgeDelivery = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.utilisateur.id;
        const now = new Date();

        const message = await Message.findByPk(messageId);
        if (!message) return res.status(404).json({ error: 'Message non trouvé' });

        // Only update if not already delivered (or update with latest delivery if needed, but per-user tracking is better if multi-user)
        // For DIRECT chat, simple delivered_at is enough if it's the recipient
        if (!message.delivered_at && message.sender_id !== userId) {
            await message.update({ delivered_at: now });

            if (req.io) {
                req.io.to(`conversation_${message.conversation_id}`).emit('message_delivered', {
                    messageId,
                    delivered_at: now
                });
            }
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.utilisateur.id;

        const message = await Message.findByPk(messageId);
        if (!message) return res.status(404).json({ error: 'Message non trouvé' });

        if (message.sender_id !== userId) {
            return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres messages' });
        }

        await message.update({ deleted_at: new Date() });

        if (req.io) {
            req.io.to(`conversation_${message.conversation_id}`).emit('message_deleted', {
                messageId,
                conversation_id: message.conversation_id
            });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.searchMessages = async (req, res) => {
    try {
        const userId = req.utilisateur.id;
        const { query } = req.query;

        if (!query || query.trim().length < 2) {
            return res.json([]);
        }

        // 1. Find all conversations the user belongs to
        const userConversations = await ConversationParticipant.findAll({
            where: { utilisateur_id: userId },
            attributes: ['conversation_id']
        });
        const conversationIds = userConversations.map(uc => uc.conversation_id);

        if (conversationIds.length === 0) {
            return res.json([]);
        }

        // 2. Search messages in those conversations
        const messages = await Message.findAll({
            where: {
                conversation_id: { [Op.in]: conversationIds },
                content: { [Op.like]: `%${query}%` },
                deleted_at: null // Exclude deleted messages
            },
            include: [
                {
                    model: Utilisateur,
                    as: 'sender',
                    attributes: ['id', 'nom', 'prenom', 'photo_url']
                },
                {
                    model: Conversation,
                    as: 'conversation',
                    attributes: ['id', 'type'],
                    include: [
                        {
                            model: Utilisateur,
                            as: 'participants',
                            attributes: ['id', 'nom', 'prenom', 'photo_url'],
                            through: { attributes: [] }
                        }
                    ]
                }
            ],
            order: [['created_at', 'DESC']],
            limit: 50
        });

        // 3. Post-process to add display name for conversations
        const results = messages.map(m => {
            const msg = m.get({ plain: true });
            if (msg.conversation) {
                const otherParticipants = msg.conversation.participants.filter(p => p.id !== userId);
                let name = "Discussion";
                if (msg.conversation.type === 'DIRECT' && otherParticipants.length > 0) {
                    name = `${otherParticipants[0].prenom} ${otherParticipants[0].nom}`;
                } else if (msg.conversation.type === 'GROUP') {
                    // Fallback since name isn't in DB yet for groups either
                    name = "Groupe";
                }
                msg.conversation.name = name;
            }
            return msg;
        });

        res.json(results);
    } catch (error) {
        console.error('Error searching messages:', error);
        res.status(500).json({ error: 'Erreur lors de la recherche' });
    }
};
