const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDB } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all sales with pagination and filters
router.get('/', authenticateToken, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;
  const status = req.query.status;
  const customerId = req.query.customer_id;

  const db = getDB();

  let whereClause = 'WHERE 1=1';
  let params = [];

  if (startDate) {
    whereClause += ' AND DATE(s.sale_date) >= ?';
    params.push(startDate);
  }

  if (endDate) {
    whereClause += ' AND DATE(s.sale_date) <= ?';
    params.push(endDate);
  }

  if (status) {
    whereClause += ' AND s.status = ?';
    params.push(status);
  }

  if (customerId) {
    whereClause += ' AND s.customer_id = ?';
    params.push(customerId);
  }

  const countQuery = `SELECT COUNT(*) as total FROM sales s ${whereClause}`;
  
  const selectQuery = `
    SELECT 
      s.id, s.total_amount, s.discount, s.tax, s.payment_method, s.status, s.sale_date, s.notes,
      c.name as customer_name, c.cpf_cnpj as customer_document,
      u.username as seller_name,
      (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN users u ON s.user_id = u.id
    ${whereClause}
    ORDER BY s.sale_date DESC
    LIMIT ? OFFSET ?
  `;

  db.get(countQuery, params, (err, countResult) => {
    if (err) {
      console.error('Erro ao contar vendas:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    db.all(selectQuery, [...params, limit, offset], (err, sales) => {
      if (err) {
        console.error('Erro ao buscar vendas:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      res.json({
        sales,
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

// Get single sale with details
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDB();

  const saleQuery = `
    SELECT 
      s.id, s.total_amount, s.discount, s.tax, s.payment_method, s.status, 
      s.sale_date, s.notes,
      c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
      c.cpf_cnpj as customer_document, c.address as customer_address,
      u.username as seller_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `;

  const itemsQuery = `
    SELECT 
      si.id, si.quantity, si.unit_price, si.total_price,
      p.name as product_name, p.unit as product_unit, p.dimensions
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    WHERE si.sale_id = ?
    ORDER BY si.id
  `;

  db.get(saleQuery, [req.params.id], (err, sale) => {
    if (err) {
      console.error('Erro ao buscar venda:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (!sale) {
      return res.status(404).json({ message: 'Venda não encontrada' });
    }

    db.all(itemsQuery, [req.params.id], (err, items) => {
      if (err) {
        console.error('Erro ao buscar itens da venda:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      res.json({
        ...sale,
        items
      });
    });
  });
});

// Create new sale
router.post('/', authenticateToken, [
  body('items').isArray({ min: 1 }).withMessage('Pelo menos um item é obrigatório'),
  body('items.*.product_id').isInt({ min: 1 }).withMessage('ID do produto inválido'),
  body('items.*.quantity').isFloat({ min: 0.001 }).withMessage('Quantidade deve ser maior que zero'),
  body('payment_method').isIn(['dinheiro', 'cartao_debito', 'cartao_credito', 'pix', 'boleto']).withMessage('Método de pagamento inválido')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { customer_id, items, discount = 0, tax = 0, payment_method, notes } = req.body;
  const userId = req.user.userId;

  const db = getDB();

  // Start transaction
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    try {
      // Validate products and calculate total
      let totalAmount = 0;
      let processedItems = 0;
      const saleItems = [];

      items.forEach((item, index) => {
        const productQuery = `
          SELECT p.id, p.name, p.price, p.active, i.quantity as stock_quantity
          FROM products p
          LEFT JOIN inventory i ON p.id = i.product_id
          WHERE p.id = ? AND p.active = 1
        `;

        db.get(productQuery, [item.product_id], (err, product) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ message: 'Erro ao validar produto' });
          }

          if (!product) {
            db.run('ROLLBACK');
            return res.status(400).json({ message: `Produto ${item.product_id} não encontrado ou inativo` });
          }

          // Check stock availability
          if (product.stock_quantity < item.quantity) {
            db.run('ROLLBACK');
            return res.status(400).json({ 
              message: `Estoque insuficiente para ${product.name}. Disponível: ${product.stock_quantity}` 
            });
          }

          const itemTotal = item.quantity * product.price;
          totalAmount += itemTotal;

          saleItems.push({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: product.price,
            total_price: itemTotal
          });

          processedItems++;

          // If all items processed, create the sale
          if (processedItems === items.length) {
            createSale();
          }
        });
      });

      function createSale() {
        const finalTotal = totalAmount - discount + tax;

        const insertSaleQuery = `
          INSERT INTO sales (customer_id, user_id, total_amount, discount, tax, payment_method, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(insertSaleQuery, [customer_id, userId, finalTotal, discount, tax, payment_method, notes], function(err) {
          if (err) {
            db.run('ROLLBACK');
            console.error('Erro ao criar venda:', err);
            return res.status(500).json({ message: 'Erro ao criar venda' });
          }

          const saleId = this.lastID;

          // Insert sale items and update inventory
          let insertedItems = 0;

          saleItems.forEach(saleItem => {
            const insertItemQuery = `
              INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price)
              VALUES (?, ?, ?, ?, ?)
            `;

            db.run(insertItemQuery, [saleId, saleItem.product_id, saleItem.quantity, saleItem.unit_price, saleItem.total_price], (err) => {
              if (err) {
                db.run('ROLLBACK');
                console.error('Erro ao inserir item da venda:', err);
                return res.status(500).json({ message: 'Erro ao inserir item da venda' });
              }

              // Update inventory
              const updateInventoryQuery = `
                UPDATE inventory 
                SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                WHERE product_id = ?
              `;

              db.run(updateInventoryQuery, [saleItem.quantity, saleItem.product_id], (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  console.error('Erro ao atualizar estoque:', err);
                  return res.status(500).json({ message: 'Erro ao atualizar estoque' });
                }

                // Record inventory movement
                const insertMovementQuery = `
                  INSERT INTO inventory_movements (product_id, movement_type, quantity, reason, user_id, reference_id, reference_type)
                  VALUES (?, 'saida', ?, 'Venda', ?, ?, 'sale')
                `;

                db.run(insertMovementQuery, [saleItem.product_id, saleItem.quantity, userId, saleId], (err) => {
                  if (err) {
                    console.error('Erro ao registrar movimentação de estoque:', err);
                    // Don't rollback for movement errors, just log
                  }

                  insertedItems++;

                  // If all items inserted, commit transaction
                  if (insertedItems === saleItems.length) {
                    db.run('COMMIT', (err) => {
                      if (err) {
                        console.error('Erro ao confirmar transação:', err);
                        return res.status(500).json({ message: 'Erro ao confirmar venda' });
                      }

                      // Return the created sale
                      res.status(201).json({
                        message: 'Venda criada com sucesso',
                        sale: {
                          id: saleId,
                          total_amount: finalTotal,
                          items_count: saleItems.length
                        }
                      });
                    });
                  }
                });
              });
            });
          });
        });
      }
    } catch (error) {
      db.run('ROLLBACK');
      console.error('Erro na transação de venda:', error);
      res.status(500).json({ message: 'Erro interno do servidor' });
    }
  });
});

// Update sale status
router.put('/:id/status', authenticateToken, [
  body('status').isIn(['pendente', 'concluida', 'cancelada']).withMessage('Status inválido')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { status } = req.body;
  const saleId = req.params.id;

  const db = getDB();

  // Get current sale
  db.get('SELECT * FROM sales WHERE id = ?', [saleId], (err, sale) => {
    if (err) {
      console.error('Erro ao buscar venda:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (!sale) {
      return res.status(404).json({ message: 'Venda não encontrada' });
    }

    // If canceling a completed sale, restore inventory
    if (sale.status === 'concluida' && status === 'cancelada') {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Get sale items
        db.all('SELECT * FROM sale_items WHERE sale_id = ?', [saleId], (err, items) => {
          if (err) {
            db.run('ROLLBACK');
            console.error('Erro ao buscar itens da venda:', err);
            return res.status(500).json({ message: 'Erro interno do servidor' });
          }

          let updatedItems = 0;

          items.forEach(item => {
            // Restore inventory
            const updateInventoryQuery = `
              UPDATE inventory 
              SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
              WHERE product_id = ?
            `;

            db.run(updateInventoryQuery, [item.quantity, item.product_id], (err) => {
              if (err) {
                db.run('ROLLBACK');
                console.error('Erro ao restaurar estoque:', err);
                return res.status(500).json({ message: 'Erro ao restaurar estoque' });
              }

              // Record inventory movement
              const insertMovementQuery = `
                INSERT INTO inventory_movements (product_id, movement_type, quantity, reason, user_id, reference_id, reference_type)
                VALUES (?, 'entrada', ?, 'Cancelamento de venda', ?, ?, 'sale_cancellation')
              `;

              db.run(insertMovementQuery, [item.product_id, item.quantity, req.user.userId, saleId], (err) => {
                if (err) {
                  console.error('Erro ao registrar movimentação de estoque:', err);
                  // Don't rollback for movement errors
                }

                updatedItems++;

                if (updatedItems === items.length) {
                  // Update sale status
                  updateSaleStatus();
                }
              });
            });
          });
        });

        function updateSaleStatus() {
          db.run('UPDATE sales SET status = ? WHERE id = ?', [status, saleId], function(err) {
            if (err) {
              db.run('ROLLBACK');
              console.error('Erro ao atualizar status da venda:', err);
              return res.status(500).json({ message: 'Erro ao atualizar venda' });
            }

            db.run('COMMIT', (err) => {
              if (err) {
                console.error('Erro ao confirmar transação:', err);
                return res.status(500).json({ message: 'Erro ao confirmar alteração' });
              }

              res.json({ message: 'Status da venda atualizado com sucesso' });
            });
          });
        }
      });
    } else {
      // Simple status update
      db.run('UPDATE sales SET status = ? WHERE id = ?', [status, saleId], function(err) {
        if (err) {
          console.error('Erro ao atualizar status da venda:', err);
          return res.status(500).json({ message: 'Erro ao atualizar venda' });
        }

        res.json({ message: 'Status da venda atualizado com sucesso' });
      });
    }
  });
});

// Get sales summary for dashboard
router.get('/summary/dashboard', authenticateToken, (req, res) => {
  const db = getDB();

  const today = new Date().toISOString().split('T')[0];
  const thisMonth = new Date().toISOString().substr(0, 7);

  const queries = {
    todaySales: `
      SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
      FROM sales 
      WHERE DATE(sale_date) = ? AND status = 'concluida'
    `,
    monthSales: `
      SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
      FROM sales 
      WHERE strftime('%Y-%m', sale_date) = ? AND status = 'concluida'
    `,
    recentSales: `
      SELECT 
        s.id, s.total_amount, s.sale_date,
        c.name as customer_name,
        u.username as seller_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.status = 'concluida'
      ORDER BY s.sale_date DESC
      LIMIT 5
    `
  };

  Promise.all([
    new Promise((resolve, reject) => {
      db.get(queries.todaySales, [today], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    }),
    new Promise((resolve, reject) => {
      db.get(queries.monthSales, [thisMonth], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    }),
    new Promise((resolve, reject) => {
      db.all(queries.recentSales, [], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    })
  ])
  .then(([todaySales, monthSales, recentSales]) => {
    res.json({
      today: {
        count: todaySales.count,
        total: parseFloat(todaySales.total) || 0
      },
      month: {
        count: monthSales.count,
        total: parseFloat(monthSales.total) || 0
      },
      recent_sales: recentSales
    });
  })
  .catch(err => {
    console.error('Erro ao buscar resumo de vendas:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  });
});

module.exports = router;