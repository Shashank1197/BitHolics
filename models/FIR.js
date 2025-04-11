const mongoose = require('mongoose');

const firSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    firDetails: {
        name: {
            type: String,
            required: true
        },
        contact: {
            type: String,
            required: true
        },
        aadhaar: {
            type: String,
            required: false
        },
        crimeType: {
            type: String,
            required: true
        },
        location: {
            type: String,
            required: true
        },
        dateTime: {
            type: Date,
            required: true
        },
        description: {
            type: String,
            required: true
        }
    },
    evidence: {
        type: [{
            filename: String,
            originalname: String,
            path: String,
            size: Number,
            mimetype: String
        }],
        default: [],
        validate: {
            validator: function(v) {
                return Array.isArray(v);
            },
            message: props => `${props.value} is not a valid array!`
        }
    },
    status: {
        type: String,
        enum: ['pending', 'under_investigation', 'resolved', 'rejected'],
        default: 'pending'
    },
    digitalSignature: {
        type: String,
        required: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Add validation for evidence array
firSchema.pre('save', function(next) {
    if (!Array.isArray(this.evidence)) {
        this.evidence = [];
    }
    next();
});

module.exports = mongoose.model('FIR', firSchema); 