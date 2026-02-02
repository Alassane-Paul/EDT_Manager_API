const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const ConversationParticipant = sequelize.define('ConversationParticipant', {
    id: {
        type: DataTypes.STRING(36),
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    conversation_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        references: {
            model: 'conversations',
            key: 'id'
        }
    },
    utilisateur_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        references: {
            model: 'utilisateurs',
            key: 'id'
        }
    },
    unread_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    last_read_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'conversation_participants',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = ConversationParticipant;
