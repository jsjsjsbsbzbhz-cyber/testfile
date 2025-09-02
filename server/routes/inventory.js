const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDB } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get inventory status
router.get('/', authenticateToken, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  const lowStock = req.query.low_stock === 'true';

  const db = getDB();

  let whereClause = 'WHERE p.active = 1';
  let params = [];

  if (search) {
    whereClause += ' AND (p.name LIKE ? OR p.barcode LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (lowStock) {
    whereClause += ' AND i.quantity <= i.min_stock';
  }

  const countQuery = `
    SELECT COUNT(*) as total
    FROM products p
    LEFT JOIN inventory i ON p.id = i.product_id
    ${whereClause}
  `;

  const selectQuery = `
    SELECT 
      p.id, p.name, p.unit, p.price,
      i.quantity, i.min_stock, i.max_stock, i.location, i.updated_at,
      c.name as category_name,
      CASE 
        WHEN i.quantity <= i.min_stock THEN 'low'
        WHEN i.quantity >= i.max_stock THEN 'high'
        ELSE 'normal'
      END as stock_status
    FROM products p
    LEFT JOIN inventory i ON p.id = i.product_id
    LEFT JOIN categories c ON p.category_id = c.id
    ${whereClause}
    ORDER BY 
      CASE 
        WHEN i.quantity <= i.min_stock THEN 0
        ELSE 1
      END,
      p.name
    LIMIT ? OFFSET ?
  `;

  db.get(countQuery, params, (err, countResult) => {
    if (err) {
      console.error('Erro ao contar itens do estoque:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    db.all(selectQuery, [...params, limit, offset], (err, inventory) => {
      if (err) {
        console.error('Erro ao buscar estoque:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      res.json({
        inventory,
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

// Get single product inventory
router.get('/product/:id', authenticateToken, (req, res) => {
  const db = getDB();

  const query = `
    SELECT 
      p.id, p.name, p.unit, p.price,
      i.quantity, i.min_stock, i.max_stock, i.location, i.updated_at,
      c.name as category_name
    FROM products p
    LEFT JOIN inventory i ON p.id = i.product_id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `;

  db.get(query, [req.params.id], (err, product) => {
    if (err) {
      console.error('Erro ao buscar estoque do produto:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (!product) {
      return res.status(404).json({ message: 'Produto não encontrado' });
    }

    res.json(product);
  });
});

// Update inventory levels
router.put('/product/:id', authenticateToken, [
  body('quantity').optional().isFloat({ min: 0 }).withMessage('Quantidade deve ser um valor válido'),
  body('min_stock').optional().isFloat({ min: 0 }).withMessage('Estoque mínimo deve ser um valor válido'),
  body('max_stock').optional().isFloat({ min: 0 }).withMessage('Estoque máximo deve ser um valor válido')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const productId = req.params.id;
  const { quantity, min_stock, max_stock, location } = req.body;

  const db = getDB();

  // Check if product exists
  db.get('SELECT id FROM products WHERE id = ? AND active = 1', [productId], (err, product) => {
    if (err) {
      console.error('Erro ao verificar produto:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (!product) {
      return res.status(404).json({ message: 'Produto não encontrado' });
    }

    // Get current inventory
    db.get('SELECT * FROM inventory WHERE product_id = ?', [productId], (err, currentInventory) => {
      if (err) {
        console.error('Erro ao buscar estoque atual:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      if (!currentInventory) {
        // Create inventory entry if it doesn't exist
        const insertQuery = `
          INSERT INTO inventory (product_id, quantity, min_stock, max_stock, location)
          VALUES (?, ?, ?, ?, ?)
        `;

        db.run(insertQuery, [
          productId, 
          quantity || 0, 
          min_stock || 0, 
          max_stock || null, 
          location || 'Estoque Principal'
        ], function(err) {
          if (err) {
            console.error('Erro ao criar entrada de estoque:', err);
            return res.status(500).json({ message: 'Erro ao criar entrada de estoque' });
          }

          res.json({ message: 'Estoque criado com sucesso' });
        });
      } else {
        // Update existing inventory
        const updateQuery = `
          UPDATE inventory 
          SET quantity = ?, min_stock = ?, max_stock = ?, location = ?, updated_at = CURRENT_TIMESTAMP
          WHERE product_id = ?
        `;

        const newQuantity = quantity !== undefined ? quantity : currentInventory.quantity;
        const newMinStock = min_stock !== undefined ? min_stock : currentInventory.min_stock;
        const newMaxStock = max_stock !== undefined ? max_stock : currentInventory.max_stock;
        const newLocation = location !== undefined ? location : currentInventory.location;

        db.run(updateQuery, [newQuantity, newMinStock, newMaxStock, newLocation, productId], function(err) {
          if (err) {
            console.error('Erro ao atualizar estoque:', err);
            return res.status(500).json({ message: 'Erro ao atualizar estoque' });
          }

          // If quantity changed, record movement
          if (quantity !== undefined && quantity !== currentInventory.quantity) {
            const movementType = quantity > currentInventory.quantity ? 'entrada' : 'saida';
            const movementQuantity = Math.abs(quantity - currentInventory.quantity);

            const insertMovementQuery = `
              INSERT INTO inventory_movements (product_id, movement_type, quantity, reason, user_id, reference_type)
              VALUES (?, ?, ?, 'Ajuste manual', ?, 'adjustment')
            `;

            db.run(insertMovementQuery, [productId, movementType, movementQuantity, req.user.userId], (err) => {
              if (err) {
                console.error('Erro ao registrar movimentação:', err);
                // Don't fail the request for movement errors
              }
            });
          }

          res.json({ message: 'Estoque atualizado com sucesso' });
        });
      }
    });
  });
});

// Add stock (purchase/adjustment)
router.post('/product/:id/add', authenticateToken, [
  body('quantity').isFloat({ min: 0.001 }).withMessage('Quantidade deve ser maior que zero'),
  body('reason').notEmpty().withMessage('Motivo é obrigatório')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const productId = req.params.id;
  const { quantity, reason } = req.body;

  const db = getDB();

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // Update inventory
    const updateQuery = `
      UPDATE inventory 
      SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
      WHERE product_id = ?
    `;

    db.run(updateQuery, [quantity, productId], function(err) {
      if (err) {
        db.run('ROLLBACK');
        console.error('Erro ao adicionar estoque:', err);
        return res.status(500).json({ message: 'Erro ao adicionar estoque' });
      }

      if (this.changes === 0) {
        db.run('ROLLBACK');
        return res.status(404).json({ message: 'Produto não encontrado no estoque' });
      }

      // Record movement
      const insertMovementQuery = `
        INSERT INTO inventory_movements (product_id, movement_type, quantity, reason, user_id, reference_type)
        VALUES (?, 'entrada', ?, ?, ?, 'adjustment')
      `;

      db.run(insertMovementQuery, [productId, quantity, reason, req.user.userId], (err) => {
        if (err) {
          db.run('ROLLBACK');
          console.error('Erro ao registrar movimentação:', err);
          return res.status(500).json({ message: 'Erro ao registrar movimentação' });
        }

        db.run('COMMIT', (err) => {
          if (err) {
            console.error('Erro ao confirmar transação:', err);
            return res.status(500).json({ message: 'Erro ao confirmar operação' });
          }

          res.json({ message: 'Estoque adicionado com sucesso' });
        });
      });
    });
  });
});

// Remove stock (waste/adjustment)
router.post('/product/:id/remove', authenticateToken, [
  body('quantity').isFloat({ min: 0.001 }).withMessage('Quantidade deve ser maior que zero'),
  body('reason').notEmpty().withMessage('Motivo é obrigatório')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const productId = req.params.id;
  const { quantity, reason } = req.body;

  const db = getDB();

  // Check current stock
  db.get('SELECT quantity FROM inventory WHERE product_id = ?', [productId], (err, inventory) => {
    if (err) {
      console.error('Erro ao verificar estoque:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (!inventory) {
      return res.status(404).json({ message: 'Produto não encontrado no estoque' });
    }

    if (inventory.quantity < quantity) {
      return res.status(400).json({ 
        message: `Estoque insuficiente. Disponível: ${inventory.quantity}` 
      });
    }

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // Update inventory
      const updateQuery = `
        UPDATE inventory 
        SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ?
      `;

      db.run(updateQuery, [quantity, productId], function(err) {
        if (err) {
          db.run('ROLLBACK');
          console.error('Erro ao remover estoque:', err);
          return res.status(500).json({ message: 'Erro ao remover estoque' });
        }

        // Record movement
        const insertMovementQuery = `
          INSERT INTO inventory_movements (product_id, movement_type, quantity, reason, user_id, reference_type)
          VALUES (?, 'saida', ?, ?, ?, 'adjustment')
        `;

        db.run(insertMovementQuery, [productId, quantity, reason, req.user.userId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            console.error('Erro ao registrar movimentação:', err);
            return res.status(500).json({ message: 'Erro ao registrar movimentação' });
          }

          db.run('COMMIT', (err) => {
            if (err) {
              console.error('Erro ao confirmar transação:', err);
              return res.status(500).json({ message: 'Erro ao confirmar operação' });
            }

            res.json({ message: 'Estoque removido com sucesso' });
          });
        });
      });
    });
  });
});

// Get inventory movements history
router.get('/movements', authenticateToken, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const productId = req.query.product_id;
  const movementType = req.query.movement_type;

  const db = getDB();

  let whereClause = 'WHERE 1=1';
  let params = [];

  if (productId) {
    whereClause += ' AND im.product_id = ?';
    params.push(productId);
  }

  if (movementType) {
    whereClause += ' AND im.movement_type = ?';
    params.push(movementType);
  }

  const countQuery = `SELECT COUNT(*) as total FROM inventory_movements im ${whereClause}`;
  
  const selectQuery = `
    SELECT 
      im.id, im.movement_type, im.quantity, im.reason, im.reference_type, im.created_at,
      p.name as product_name, p.unit as product_unit,
      u.username as user_name
    FROM inventory_movements im
    LEFT JOIN products p ON im.product_id = p.id
    LEFT JOIN users u ON im.user_id = u.id
    ${whereClause}
    ORDER BY im.created_at DESC
    LIMIT ? OFFSET ?
  `;

  db.get(countQuery, params, (err, countResult) => {
    if (err) {
      console.error('Erro ao contar movimentações:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    db.all(selectQuery, [...params, limit, offset], (err, movements) => {
      if (err) {
        console.error('Erro ao buscar movimentações:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      res.json({
        movements,
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

// Get inventory summary
router.get('/summary', authenticateToken, (req, res) => {
  const db = getDB();

  const queries = {
    totalProducts: 'SELECT COUNT(*) as count FROM products WHERE active = 1',
    lowStockItems: `
      SELECT COUNT(*) as count 
      FROM inventory i 
      JOIN products p ON i.product_id = p.id 
      WHERE p.active = 1 AND i.quantity <= i.min_stock
    `,
    outOfStockItems: `
      SELECT COUNT(*) as count 
      FROM inventory i 
      JOIN products p ON i.product_id = p.id 
      WHERE p.active = 1 AND i.quantity = 0
    `,
    totalValue: `
      SELECT COALESCE(SUM(i.quantity * p.price), 0) as total
      FROM inventory i 
      JOIN products p ON i.product_id = p.id 
      WHERE p.active = 1
    `
  };

  Promise.all([
    new Promise((resolve, reject) => {
      db.get(queries.totalProducts, [], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    }),
    new Promise((resolve, reject) => {
      db.get(queries.lowStockItems, [], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    }),
    new Promise((resolve, reject) => {
      db.get(queries.outOfStockItems, [], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    }),
    new Promise((resolve, reject) => {
      db.get(queries.totalValue, [], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    })
  ])
  .then(([totalProducts, lowStockItems, outOfStockItems, totalValue]) => {
    res.json({
      total_products: totalProducts.count,
      low_stock_items: lowStockItems.count,
      out_of_stock_items: outOfStockItems.count,
      total_inventory_value: parseFloat(totalValue.total) || 0
    });
  })
  .catch(err => {
    console.error('Erro ao buscar resumo do estoque:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  });
});

module.exports = router;