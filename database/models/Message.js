const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Message = sequelize.define('Message', {
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
    sender_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        references: {
            model: 'utilisateurs',
            key: 'id'
        }
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM('TEXT', 'IMAGE', 'FILE'),
        defaultValue: 'TEXT'
    },
    file_url: {
        type: DataTypes.STRING,
        allowNull: true
    },
    is_read: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    delivered_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    read_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    deleted_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'messages',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['conversation_id']
        },
        {
            fields: ['created_at']
        }
    ]
});

module.exports = Message;
