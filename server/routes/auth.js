const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { getDB } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', [
  body('username').notEmpty().withMessage('Usuário é obrigatório'),
  body('password').notEmpty().withMessage('Senha é obrigatória')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password } = req.body;
  const db = getDB();

  db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username], (err, user) => {
    if (err) {
      console.error('Erro no login:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (!user) {
      return res.status(401).json({ message: 'Usuário ou senha inválidos' });
    }

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        console.error('Erro ao verificar senha:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      if (!isMatch) {
        return res.status(401).json({ message: 'Usuário ou senha inválidos' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          username: user.username, 
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        message: 'Login realizado com sucesso',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    });
  });
});

// Register new user (admin only)
router.post('/register', authenticateToken, [
  body('username').isLength({ min: 3 }).withMessage('Usuário deve ter pelo menos 3 caracteres'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
  body('role').isIn(['admin', 'vendedor']).withMessage('Perfil inválido')
], (req, res) => {
  // Only admins can create new users
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Apenas administradores podem criar usuários' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, email, password, role } = req.body;
  const db = getDB();

  // Check if user already exists
  db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email], (err, existingUser) => {
    if (err) {
      console.error('Erro ao verificar usuário existente:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (existingUser) {
      return res.status(400).json({ message: 'Usuário ou email já existe' });
    }

    // Hash password
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error('Erro ao criptografar senha:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      // Insert new user
      const insertUser = `
        INSERT INTO users (username, email, password, role)
        VALUES (?, ?, ?, ?)
      `;

      db.run(insertUser, [username, email, hashedPassword, role], function(err) {
        if (err) {
          console.error('Erro ao criar usuário:', err);
          return res.status(500).json({ message: 'Erro ao criar usuário' });
        }

        res.status(201).json({
          message: 'Usuário criado com sucesso',
          user: {
            id: this.lastID,
            username,
            email,
            role
          }
        });
      });
    });
  });
});

// Get current user info
router.get('/me', authenticateToken, (req, res) => {
  const db = getDB();

  db.get('SELECT id, username, email, role, created_at FROM users WHERE id = ?', [req.user.userId], (err, user) => {
    if (err) {
      console.error('Erro ao buscar usuário:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json(user);
  });
});

// Change password
router.put('/change-password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Senha atual é obrigatória'),
  body('newPassword').isLength({ min: 6 }).withMessage('Nova senha deve ter pelo menos 6 caracteres')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;
  const db = getDB();

  // Get current user
  db.get('SELECT password FROM users WHERE id = ?', [req.user.userId], (err, user) => {
    if (err) {
      console.error('Erro ao buscar usuário:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    // Verify current password
    bcrypt.compare(currentPassword, user.password, (err, isMatch) => {
      if (err) {
        console.error('Erro ao verificar senha:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      if (!isMatch) {
        return res.status(400).json({ message: 'Senha atual incorreta' });
      }

      // Hash new password
      bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
        if (err) {
          console.error('Erro ao criptografar senha:', err);
          return res.status(500).json({ message: 'Erro interno do servidor' });
        }

        // Update password
        db.run('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
          [hashedPassword, req.user.userId], (err) => {
            if (err) {
              console.error('Erro ao atualizar senha:', err);
              return res.status(500).json({ message: 'Erro ao atualizar senha' });
            }

            res.json({ message: 'Senha alterada com sucesso' });
          });
      });
    });
  });
});

module.exports = router;