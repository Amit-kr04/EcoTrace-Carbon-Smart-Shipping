import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Company, Location, User, ROLES } from '../models/index.js';
import { asyncHandler, requireAuth, requireRole, signToken } from '../middleware/auth.js';
import { geocodeCity } from '../services/routing.js';

const router = Router();

// Register: creates the company profile, its owner account and the factory location.
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, companyName, industry, city } = req.body;
  if (!name || !email || !password || !companyName) return res.status(400).json({ message: 'Name, email, password and company name are required' });
  if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'An account with this email already exists' });

  const company = await Company.create({ name: companyName, industry, city, alertEmail: email });
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10), role: 'owner', company: company._id });
  if (city) {
    const place = await geocodeCity(city);
    if (place) {
      await Location.create({ company: company._id, name: `${companyName} Factory`, type: 'factory', city: place.name, coastal: place.coastal, geo: { type: 'Point', coordinates: [place.lng, place.lat] } });
    }
  }
  res.status(201).json({ token: signToken(user), user, company });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) return res.status(401).json({ message: 'Wrong email or password' });
  const company = await Company.findById(user.company);
  res.json({ token: signToken(user), user, company });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const company = await Company.findById(req.companyId);
  res.json({ user: req.user, company });
}));

// Team management (owner/admin)
router.get('/users', requireAuth, asyncHandler(async (req, res) => {
  res.json(await User.find({ company: req.companyId }).sort({ createdAt: 1 }));
}));

router.post('/users', requireAuth, requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  if (!ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role' });
  if (role === 'owner' && req.user.role !== 'owner') return res.status(403).json({ message: 'Only an owner can add another owner' });
  if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already in use' });
  const user = await User.create({ name, email, role, passwordHash: await bcrypt.hash(password, 10), company: req.companyId });
  res.status(201).json(user);
}));

router.delete('/users/:id', requireAuth, requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) return res.status(400).json({ message: 'You cannot remove yourself' });
  const target = await User.findOne({ _id: req.params.id, company: req.companyId });
  if (!target) return res.status(404).json({ message: 'User not found' });
  if (target.role === 'owner' && req.user.role !== 'owner') return res.status(403).json({ message: 'Only an owner can remove an owner' });
  await target.deleteOne();
  res.json({ ok: true });
}));

export default router;
