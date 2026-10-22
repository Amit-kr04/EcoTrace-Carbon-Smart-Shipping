import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/index.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), company: String(user.company), role: user.role }, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ message: 'Not signed in' });
  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ message: 'Account no longer exists' });
    req.user = user;
    req.companyId = user.company;
    next();
  } catch {
    res.status(401).json({ message: 'Session expired, please sign in again' });
  }
}

// Role-based access: requireRole('owner', 'admin')
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `This action needs one of these roles: ${roles.join(', ')}` });
    }
    next();
  };
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
