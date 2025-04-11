const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['SHO', 'Officer', 'Admin'],
    required: true
  },
  personalInfo: {
    name: {
      type: String,
      required: true
    },
    badgeNumber: {
      type: String,
      required: true,
      unique: true
    },
    rank: String,
    phone: String,
    email: {
      type: String,
      required: true,
      unique: true
    }
  },
  station: {
    name: String,
    code: String,
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String
    }
  },
  assignedCases: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FIR'
  }],
  permissions: [{
    type: String,
    enum: [
      'view_fir',
      'create_fir',
      'update_fir',
      'delete_fir',
      'assign_cases',
      'manage_users',
      'manage_admins',
      'view_reports',
      'export_data'
    ]
  }],
  lastLogin: Date,
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Suspended'],
    default: 'Active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to hash password
adminSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  this.updatedAt = new Date();
  next();
});

// Method to verify password
adminSchema.methods.verifyPassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Method to check if admin has specific permission
adminSchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission);
};

// Static method to get default permissions based on role
adminSchema.statics.getDefaultPermissions = function(role) {
  const permissions = {
    SHO: [
      'view_fir',
      'create_fir',
      'update_fir',
      'delete_fir',
      'assign_cases',
      'manage_users',
      'view_reports',
      'export_data'
    ],
    Officer: [
      'view_fir',
      'create_fir',
      'update_fir',
      'view_reports'
    ],
    Admin: [
      'view_fir',
      'create_fir',
      'update_fir',
      'delete_fir',
      'assign_cases',
      'manage_users',
      'manage_admins',
      'view_reports',
      'export_data'
    ]
  };
  return permissions[role] || [];
};

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin; 