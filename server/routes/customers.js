const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDB } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all customers with pagination and search
router.get('/', authenticateToken, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  const active = req.query.active !== 'false';

  const db = getDB();

  let whereClause = 'WHERE active = ?';
  let params = [active ? 1 : 0];

  if (search) {
    whereClause += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR cpf_cnpj LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const countQuery = `SELECT COUNT(*) as total FROM customers ${whereClause}`;
  const selectQuery = `
    SELECT * FROM customers 
    ${whereClause}
    ORDER BY name
    LIMIT ? OFFSET ?
  `;

  db.get(countQuery, params, (err, countResult) => {
    if (err) {
      console.error('Erro ao contar clientes:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    db.all(selectQuery, [...params, limit, offset], (err, customers) => {
      if (err) {
        console.error('Erro ao buscar clientes:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      res.json({
        customers,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(countResult.total / limit),
          total_items: countResult.total,
          items_per_page: limit
        }
      });
    });
  });
});

// Get single customer
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDB();

  db.get('SELECT * FROM customers WHERE id = ?', [req.params.id], (err, customer) => {
    if (err) {
      console.error('Erro ao buscar cliente:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (!customer) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    res.json(customer);
  });
});

// Create new customer
router.post('/', authenticateToken, [
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('email').optional().isEmail().withMessage('Email inválido'),
  body('customer_type').isIn(['pessoa_fisica', 'pessoa_juridica']).withMessage('Tipo de cliente inválido')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { 
    name, email, phone, cpf_cnpj, address, city, state, zip_code, customer_type 
  } = req.body;

  const db = getDB();

  // Check if customer already exists (by email or CPF/CNPJ)
  const checkQuery = 'SELECT id FROM customers WHERE email = ? OR cpf_cnpj = ?';
  db.get(checkQuery, [email, cpf_cnpj], (err, existingCustomer) => {
    if (err) {
      console.error('Erro ao verificar cliente existente:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (existingCustomer) {
      return res.status(400).json({ message: 'Cliente já existe com este email ou CPF/CNPJ' });
    }

    const insertQuery = `
      INSERT INTO customers (name, email, phone, cpf_cnpj, address, city, state, zip_code, customer_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(insertQuery, [name, email, phone, cpf_cnpj, address, city, state, zip_code, customer_type], function(err) {
      if (err) {
        console.error('Erro ao criar cliente:', err);
        return res.status(500).json({ message: 'Erro ao criar cliente' });
      }

      // Return the created customer
      db.get('SELECT * FROM customers WHERE id = ?', [this.lastID], (err, customer) => {
        if (err) {
          console.error('Erro ao buscar cliente criado:', err);
          return res.status(500).json({ message: 'Erro interno do servidor' });
        }

        res.status(201).json({
          message: 'Cliente criado com sucesso',
          customer
        });
      });
    });
  });
});

// Update customer
router.put('/:id', authenticateToken, [
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('email').optional().isEmail().withMessage('Email inválido'),
  body('customer_type').isIn(['pessoa_fisica', 'pessoa_juridica']).withMessage('Tipo de cliente inválido')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const customerId = req.params.id;
  const { 
    name, email, phone, cpf_cnpj, address, city, state, zip_code, customer_type, active 
  } = req.body;

  const db = getDB();

  // Check if customer exists
  db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, customer) => {
    if (err) {
      console.error('Erro ao buscar cliente:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (!customer) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    // Check if email or CPF/CNPJ already exists (for other customers)
    const checkQuery = 'SELECT id FROM customers WHERE (email = ? OR cpf_cnpj = ?) AND id != ?';
    db.get(checkQuery, [email, cpf_cnpj, customerId], (err, existingCustomer) => {
      if (err) {
        console.error('Erro ao verificar cliente existente:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      if (existingCustomer) {
        return res.status(400).json({ message: 'Já existe outro cliente com este email ou CPF/CNPJ' });
      }

      const updateQuery = `
        UPDATE customers 
        SET name = ?, email = ?, phone = ?, cpf_cnpj = ?, address = ?, 
            city = ?, state = ?, zip_code = ?, customer_type = ?, active = ?, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      db.run(updateQuery, [
        name, email, phone, cpf_cnpj, address, city, state, zip_code, 
        customer_type, active !== false ? 1 : 0, customerId
      ], function(err) {
        if (err) {
          console.error('Erro ao atualizar cliente:', err);
          return res.status(500).json({ message: 'Erro ao atualizar cliente' });
        }

        // Return updated customer
        db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, updatedCustomer) => {
          if (err) {
            console.error('Erro ao buscar cliente atualizado:', err);
            return res.status(500).json({ message: 'Erro interno do servidor' });
          }

          res.json({
            message: 'Cliente atualizado com sucesso',
            customer: updatedCustomer
          });
        });
      });
    });
  });
});

// Delete customer (soft delete)
router.delete('/:id', authenticateToken, (req, res) => {
  const db = getDB();

  db.run('UPDATE customers SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      console.error('Erro ao desativar cliente:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    res.json({ message: 'Cliente desativado com sucesso' });
  });
});

// Get customer purchase history
router.get('/:id/purchases', authenticateToken, (req, res) => {
  const customerId = req.params.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  const db = getDB();

  const countQuery = 'SELECT COUNT(*) as total FROM sales WHERE customer_id = ?';
  const selectQuery = `
    SELECT 
      s.id, s.total_amount, s.discount, s.tax, s.payment_method, s.status, s.sale_date,
      u.username as seller_name,
      (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count
    FROM sales s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.customer_id = ?
    ORDER BY s.sale_date DESC
    LIMIT ? OFFSET ?
  `;

  db.get(countQuery, [customerId], (err, countResult) => {
    if (err) {
      console.error('Erro ao contar compras do cliente:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    db.all(selectQuery, [customerId, limit, offset], (err, purchases) => {
      if (err) {
        console.error('Erro ao buscar compras do cliente:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      res.json({
        purchases,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(countResult.total / limit),
          total_items: countResult.total,
          items_per_page: limit
        }
      });
    });
  });
});

module.exports = router;