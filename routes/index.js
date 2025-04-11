const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const User = require('../models/User');
const FIR = require('../models/FIR');
const Appointment = require('../models/Appointment');
const Complaint = require('../models/Complaint');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|pdf/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only .png, .jpg, .jpeg and .pdf files are allowed'));
    }
});

// Home route
router.get('/', (req, res) => {
    res.render('index');
});

// Login routes
router.get('/login', (req, res) => {
    res.render('login', { 
        error: null,
        otpSent: false,
        timer: null
    });
});

// Generate OTP route
router.post('/generate-otp', async (req, res) => {
    const { aadhaar, phone } = req.body;
    
    // Validate Aadhaar number (12 digits)
    if (!/^\d{12}$/.test(aadhaar)) {
        return res.json({ success: false, error: 'Invalid Aadhaar number' });
    }
    
    // Validate phone number (10 digits)
    if (!/^\d{10}$/.test(phone)) {
        return res.json({ success: false, error: 'Invalid phone number' });
    }
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    
    // Store OTP and timestamp in session
    req.session.otp = {
        code: otp,
        timestamp: Date.now(),
        aadhaar: aadhaar,
        phone: phone
    };
    
    // Set OTP expiration (5 minutes)
    req.session.otpExpiry = Date.now() + 5 * 60 * 1000;
    
    // In production, send OTP via SMS/email
    console.log(`OTP for ${aadhaar}: ${otp}`); // For testing only
    
    res.json({ 
        success: true, 
        message: 'OTP sent successfully',
        timer: 300 // 5 minutes in seconds
    });
});

// Verify OTP route
router.post('/verify-otp', async (req, res) => {
    const { otp } = req.body;
    
    if (!req.session.otp || !req.session.otpExpiry) {
        return res.json({ success: false, error: 'OTP not generated or expired' });
    }
    
    // Check if OTP has expired
    if (Date.now() > req.session.otpExpiry) {
        delete req.session.otp;
        delete req.session.otpExpiry;
        return res.json({ success: false, error: 'OTP expired' });
    }
    
    // Verify OTP
    if (otp !== req.session.otp.code.toString()) {
        return res.json({ success: false, error: 'Invalid OTP' });
    }
    
    try {
        // Find or create user
        let user = await User.findOne({ aadhaar: req.session.otp.aadhaar });
        if (!user) {
            // For demo purposes, we'll use a placeholder name
            // In production, you would get this from Aadhaar API
            user = new User({ 
                name: 'Citizen User', // Placeholder name
                aadhaar: req.session.otp.aadhaar,
                phone: req.session.otp.phone,
                isAnonymous: false 
            });
            await user.save();
        }
        
        // Set user session
        req.session.userId = user._id;
        
        // Clear OTP data
        delete req.session.otp;
        delete req.session.otpExpiry;
        
        res.json({ success: true, redirect: '/dashboard' });
    } catch (error) {
        console.error('Error in verify-otp:', error);
        res.json({ success: false, error: 'Error processing your request. Please try again.' });
    }
});

// Dashboard route
router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const firs = await FIR.find({ userId: req.session.userId }).sort({ createdAt: -1 }).limit(5);
        const appointments = await Appointment.find({ userId: req.session.userId }).sort({ date: 1 }).limit(5);
        
        res.render('dashboard', {
            user,
            firs,
            appointments,
            title: 'Dashboard - Virtual Police Station'
        });
    } catch (error) {
        console.error('Error in dashboard:', error);
        res.render('error', { 
            message: 'Error accessing dashboard',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// FIR routes
router.get('/fir/new', (req, res) => {
    res.render('fir/new');
});

router.post('/fir/new', upload.array('evidence'), async (req, res) => {
    try {
        // Validate required fields
        if (!req.body.name || !req.body.contact || !req.body.crimeType || !req.body.location || !req.body.dateTime || !req.body.description) {
            return res.render('fir/new', { 
                error: 'Please fill in all required fields',
                formData: req.body
            });
        }

        // Create FIR data object
        const firData = {
            userId: req.session.userId || null,
            firDetails: {
                name: req.body.name,
                contact: req.body.contact,
                aadhaar: req.body.aadhaar || null,
                crimeType: req.body.crimeType,
                location: req.body.location,
                dateTime: new Date(req.body.dateTime),
                description: req.body.description
            },
            evidence: req.files ? req.files.map(file => ({
                filename: file.filename,
                originalname: file.originalname,
                path: file.path,
                size: file.size,
                mimetype: file.mimetype
            })) : [],
            status: 'pending',
            isAnonymous: !req.session.userId
        };

        // Save to session for preview
        req.session.firData = firData;
        res.redirect('/fir/preview');
    } catch (error) {
        console.error('Error creating FIR:', error);
        res.render('fir/new', { 
            error: 'Error creating FIR. Please try again.',
            formData: req.body
        });
    }
});

// Preview FIR route
router.get('/fir/preview', (req, res) => {
    if (!req.session.firData) {
        req.flash('error', 'No FIR data found. Please fill out the form again.');
        return res.redirect('/fir/new');
    }
    res.render('fir/preview', { 
        firData: req.session.firData,
        messages: req.flash()
    });
});

// Submit FIR route
router.post('/fir/submit', async (req, res) => {
    try {
        if (!req.session.firData) {
            req.flash('error', 'No FIR data found. Please fill out the form again.');
            return res.redirect('/fir/new');
        }

        // Check if user is authenticated
        if (!req.session.userId) {
            req.flash('error', 'Please login to submit an FIR.');
            return res.redirect('/login');
        }

        // Ensure evidence is an array and properly formatted
        let evidence = [];
        if (Array.isArray(req.session.firData.evidence)) {
            evidence = req.session.firData.evidence.map(file => ({
                filename: file.filename,
                originalname: file.originalname,
                path: file.path,
                size: file.size,
                mimetype: file.mimetype
            }));
        }

        // Create FIR object with proper structure
        const fir = new FIR({
            userId: req.session.userId,
            firDetails: {
                name: req.session.firData.firDetails.name,
                contact: req.session.firData.firDetails.contact,
                aadhaar: req.session.firData.firDetails.aadhaar || null,
                crimeType: req.session.firData.firDetails.crimeType,
                location: req.session.firData.firDetails.location,
                dateTime: new Date(req.session.firData.firDetails.dateTime),
                description: req.session.firData.firDetails.description
            },
            evidence: evidence,
            status: 'pending'
        });

        await fir.save();
        
        // Clear the session data after successful submission
        delete req.session.firData;
        
        req.flash('success', 'FIR submitted successfully!');
        res.redirect('/track');
    } catch (error) {
        console.error('Error submitting FIR:', error);
        req.flash('error', 'Failed to submit FIR. Please try again.');
        res.redirect('/fir/new');
    }
});

// Track FIR route
router.get('/track', async (req, res) => {
    try {
        if (!req.session.userId) {
            req.flash('error', 'Please login to view your FIRs.');
            return res.redirect('/login');
        }

        // Fetch all FIRs for the current user, sorted by creation date
        const firs = await FIR.find({ userId: req.session.userId })
            .sort({ createdAt: -1 }) // Sort by most recent first
            .lean(); // Convert to plain JavaScript objects

        res.render('track', { 
            firs,
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error fetching FIRs:', error);
        req.flash('error', 'Failed to fetch FIRs. Please try again.');
        res.redirect('/');
    }
});

// View FIR details route
router.get('/fir/:id', async (req, res) => {
    try {
        if (!req.session.userId) {
            req.flash('error', 'Please login to view FIR details.');
            return res.redirect('/login');
        }

        const fir = await FIR.findOne({
            _id: req.params.id,
            userId: req.session.userId
        }).lean();

        if (!fir) {
            req.flash('error', 'FIR not found or you do not have permission to view it.');
            return res.redirect('/track');
        }

        res.render('fir/details', { 
            fir,
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error fetching FIR details:', error);
        req.flash('error', 'Failed to fetch FIR details. Please try again.');
        res.redirect('/track');
    }
});

// Admin routes
router.get('/admin', isAdmin, async (req, res) => {
    try {
        const firs = await FIR.find().populate('userId');
        res.render('admin/dashboard', { firs });
    } catch (error) {
        res.render('error', { message: 'Error accessing admin dashboard', error });
    }
});

router.post('/admin/fir/:id/status', isAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        await FIR.findByIdAndUpdate(req.params.id, { status });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error updating FIR status' });
    }
});

// Logout route
router.get('/logout', (req, res) => {
    // Destroy the session
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.redirect('/dashboard');
        }
        // Clear the session cookie
        res.clearCookie('connect.sid');
        // Redirect to home page
        res.redirect('/');
    });
});

// Complaints routes
router.get('/complaints', async (req, res) => {
    try {
        if (!req.session.userId) {
            req.flash('error', 'Please login to view complaints.');
            return res.redirect('/login');
        }

        // Fetch all complaints for the current user, sorted by creation date
        const complaints = await Complaint.find({ userId: req.session.userId })
            .sort({ createdAt: -1 }) // Sort by most recent first
            .lean(); // Convert to plain JavaScript objects

        res.render('complaints/index', { 
            complaints,
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error fetching complaints:', error);
        req.flash('error', 'Failed to fetch complaints. Please try again.');
        res.redirect('/');
    }
});

router.get('/complaints/new', (req, res) => {
    if (!req.session.userId) {
        req.flash('error', 'Please login to register a complaint.');
        return res.redirect('/login');
    }
    res.render('complaints/new', { messages: req.flash() });
});

router.post('/complaints', upload.array('evidence'), async (req, res) => {
    try {
        if (!req.session.userId) {
            req.flash('error', 'Please login to register a complaint.');
            return res.redirect('/login');
        }

        // Handle file uploads
        const evidence = req.files ? req.files.map(file => ({
            filename: file.filename,
            originalname: file.originalname,
            path: file.path,
            size: file.size,
            mimetype: file.mimetype
        })) : [];

        // Create complaint object
        const complaint = new Complaint({
            userId: req.session.userId,
            title: req.body.title,
            description: req.body.description,
            category: req.body.category,
            priority: req.body.priority,
            evidence: evidence,
            status: 'pending'
        });

        await complaint.save();
        
        req.flash('success', 'Complaint registered successfully!');
        res.redirect('/complaints');
    } catch (error) {
        console.error('Error registering complaint:', error);
        req.flash('error', 'Failed to register complaint. Please try again.');
        res.redirect('/complaints/new');
    }
});

router.get('/complaints/:id', async (req, res) => {
    try {
        if (!req.session.userId) {
            req.flash('error', 'Please login to view complaint details.');
            return res.redirect('/login');
        }

        const complaint = await Complaint.findOne({
            _id: req.params.id,
            userId: req.session.userId
        }).lean();

        if (!complaint) {
            req.flash('error', 'Complaint not found or you do not have permission to view it.');
            return res.redirect('/complaints');
        }

        res.render(path.join(__dirname, '../views/complaints/details'), { 
            complaint,
            messages: req.flash()
        });
    } catch (error) {
        console.error('Error fetching complaint details:', error);
        req.flash('error', 'Failed to fetch complaint details. Please try again.');
        res.redirect('/complaints');
    }
});

// Helper function to generate digital signature
function generateDigitalSignature(data) {
    const sign = crypto.createSign('SHA256');
    sign.update(JSON.stringify(data));
    return sign.sign(process.env.PRIVATE_KEY, 'hex');
}

module.exports = router; 