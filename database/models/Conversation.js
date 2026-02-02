const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Conversation = sequelize.define('Conversation', {
    id: {
        type: DataTypes.STRING(36),
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    type: {
        type: DataTypes.ENUM('DIRECT', 'GROUP'),
        defaultValue: 'DIRECT',
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    last_message_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'conversations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['last_message_at']
        }
    ]
});

module.exports = Conversation;
