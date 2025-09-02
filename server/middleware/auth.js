const jwt = require('jsonwebtoken');
const { getDB } = require('../database/init');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Token de acesso requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token inválido' });
    }
    
    req.user = user;
    next();
  });
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso negado. Apenas administradores.' });
  }
  next();
};

// Middleware to validate user exists in database
const validateUser = (req, res, next) => {
  const db = getDB();
  
  db.get('SELECT id, username, role FROM users WHERE id = ? AND username = ?', 
    [req.user.userId, req.user.username], 
    (err, user) => {
      if (err) {
        console.error('Erro ao validar usuário:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }
      
      if (!user) {
        return res.status(401).json({ message: 'Usuário não encontrado' });
      }
      
      req.user.dbUser = user;
      next();
    });
};

module.exports = {
  authenticateToken,
  requireAdmin,
  validateUser
};