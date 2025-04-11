require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const { isAuthenticated } = require('./config/middleware');

// Import routes
const authRoutes = require('./routes/authRoutes');
const firRoutes = require('./routes/firRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');

const app = express();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/virtual-police-station')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup with express-ejs-layouts
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', path.join(__dirname, 'views', 'layouts', 'base'));
app.set("layout extractScripts", true);

// Provide default values for template variables
app.use((req, res, next) => {
  res.locals.scripts = '';
  next();
});

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/virtual-police-station',
    ttl: 24 * 60 * 60 // Session TTL (1 day)
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// Global middleware to pass user to all views
app.use(async (req, res, next) => {
  if (req.session.userId) {
    try {
      const User = require('./models/User');
      const user = await User.findById(req.session.userId);
      res.locals.user = user;
      req.user = user;
    } catch (error) {
      console.error('Error fetching user:', error);
      res.locals.user = null;
      req.user = null;
    }
  } else {
    res.locals.user = null;
    req.user = null;
  }
  
  if (req.session.adminId) {
    try {
      const Admin = require('./models/Admin');
      const admin = await Admin.findById(req.session.adminId);
      res.locals.admin = admin;
      req.admin = admin;
    } catch (error) {
      console.error('Error fetching admin:', error);
      res.locals.admin = null;
      req.admin = null;
    }
  } else {
    res.locals.admin = null;
    req.admin = null;
  }
  
  next();
});

// Middleware to check authentication
const checkAuth = async (req, res, next) => {
  if (!req.session.isAuthenticated || !req.session.userId) {
    // Store the requested URL to redirect back after login
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }

  // Ensure user exists in database
  try {
    const User = require('./models/User');
    const user = await User.findById(req.session.userId);
    if (!user) {
      req.session.destroy();
      return res.redirect('/auth/login');
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.redirect('/auth/login');
  }
};

// Apply authentication check to protected routes
app.use('/fir', checkAuth);
app.use('/appointments', checkAuth);

// Routes
app.use('/auth', authRoutes);
app.use('/fir', firRoutes);
app.use('/appointments', appointmentRoutes);

// Home page route
app.get('/', (req, res) => {
  res.render('index', { title: 'Home' });
});

// Dashboard route (requires authentication)
app.get('/dashboard', checkAuth, async (req, res) => {
  try {
    const Appointment = require('./models/Appointment');
    const FIR = require('./models/FIR');
    
    // Get user's appointments
    const appointments = await Appointment.find({ userId: req.user._id });
    
    // Get user's FIRs
    const firs = await FIR.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5); // Get only the 5 most recent FIRs
    
    // Calculate FIR statistics
    const firStats = {
      total: firs.length,
      pending: firs.filter(f => f.status === 'Pending').length,
      underReview: firs.filter(f => f.status === 'Under Review').length,
      investigation: firs.filter(f => f.status === 'Investigation').length,
      closed: firs.filter(f => f.status === 'Closed').length,
      recentFirs: firs // Include the 5 most recent FIRs
    };
    
    // Calculate appointment statistics
    const appointmentStats = {
      total: appointments.length,
      pending: appointments.filter(a => a.status === 'Pending').length,
      scheduled: appointments.filter(a => a.status === 'Scheduled').length,
      completed: appointments.filter(a => a.status === 'Completed').length,
      cancelled: appointments.filter(a => a.status === 'Cancelled').length,
      rescheduled: appointments.filter(a => a.status === 'Rescheduled').length,
      upcoming: appointments.filter(a => 
        (a.status === 'Scheduled' || a.status === 'Pending') && 
        new Date(a.appointmentDate) > new Date()
      ).length
    };

    res.render('dashboard', { 
      title: 'Dashboard',
      user: res.locals.user,
      appointmentStats,
      firStats
    });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.render('dashboard', { 
      title: 'Dashboard',
      user: res.locals.user,
      error: 'Error loading dashboard statistics'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'Error',
    message: err.message || 'An unexpected error occurred',
    error: err
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 Not Found',
    message: 'The page you are looking for does not exist.',
    error: {
      status: 404,
      message: 'Page not found'
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 