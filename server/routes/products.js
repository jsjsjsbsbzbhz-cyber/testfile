const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { getDB } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas'));
    }
  }
});

// Get all products with pagination and filters
router.get('/', authenticateToken, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  const category = req.query.category || '';
  const active = req.query.active !== 'false';

  const db = getDB();

  let whereClause = 'WHERE p.active = ?';
  let params = [active ? 1 : 0];

  if (search) {
    whereClause += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.barcode LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (category) {
    whereClause += ' AND p.category_id = ?';
    params.push(category);
  }

  const countQuery = `
    SELECT COUNT(*) as total
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ${whereClause}
  `;

  const selectQuery = `
    SELECT 
      p.id, p.name, p.description, p.unit, p.price, p.cost, 
      p.barcode, p.image_url, p.dimensions, p.active,
      p.created_at, p.updated_at,
      c.name as category_name,
      i.quantity, i.min_stock, i.max_stock, i.location
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN inventory i ON p.id = i.product_id
    ${whereClause}
    ORDER BY p.name
    LIMIT ? OFFSET ?
  `;

  db.get(countQuery, params, (err, countResult) => {
    if (err) {
      console.error('Erro ao contar produtos:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    db.all(selectQuery, [...params, limit, offset], (err, products) => {
      if (err) {
        console.error('Erro ao buscar produtos:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      res.json({
        products,
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

// Get single product
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDB();

  const query = `
    SELECT 
      p.id, p.name, p.description, p.category_id, p.unit, p.price, p.cost,
      p.barcode, p.image_url, p.dimensions, p.active,
      p.created_at, p.updated_at,
      c.name as category_name,
      i.quantity, i.min_stock, i.max_stock, i.location
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN inventory i ON p.id = i.product_id
    WHERE p.id = ?
  `;

  db.get(query, [req.params.id], (err, product) => {
    if (err) {
      console.error('Erro ao buscar produto:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (!product) {
      return res.status(404).json({ message: 'Produto não encontrado' });
    }

    res.json(product);
  });
});

// Create new product
router.post('/', authenticateToken, requireAdmin, upload.single('image'), [
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('unit').notEmpty().withMessage('Unidade é obrigatória'),
  body('price').isFloat({ min: 0 }).withMessage('Preço deve ser um valor válido'),
  body('cost').optional().isFloat({ min: 0 }).withMessage('Custo deve ser um valor válido')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, description, category_id, unit, price, cost, barcode, dimensions } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;

  const db = getDB();

  // Check if barcode already exists
  if (barcode) {
    db.get('SELECT id FROM products WHERE barcode = ?', [barcode], (err, existingProduct) => {
      if (err) {
        console.error('Erro ao verificar código de barras:', err);
        return res.status(500).json({ message: 'Erro interno do servidor' });
      }

      if (existingProduct) {
        return res.status(400).json({ message: 'Código de barras já existe' });
      }

      insertProduct();
    });
  } else {
    insertProduct();
  }

  function insertProduct() {
    const insertQuery = `
      INSERT INTO products (name, description, category_id, unit, price, cost, barcode, image_url, dimensions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(insertQuery, [name, description, category_id, unit, price, cost || null, barcode || null, image_url, dimensions], function(err) {
      if (err) {
        console.error('Erro ao criar produto:', err);
        return res.status(500).json({ message: 'Erro ao criar produto' });
      }

      const productId = this.lastID;

      // Create initial inventory entry
      const inventoryQuery = `
        INSERT INTO inventory (product_id, quantity, min_stock, max_stock, location)
        VALUES (?, 0, 0, NULL, 'Estoque Principal')
      `;

      db.run(inventoryQuery, [productId], (err) => {
        if (err) {
          console.error('Erro ao criar entrada de estoque:', err);
        }

        // Return the created product
        db.get(`
          SELECT 
            p.*, c.name as category_name,
            i.quantity, i.min_stock, i.max_stock, i.location
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          LEFT JOIN inventory i ON p.id = i.product_id
          WHERE p.id = ?
        `, [productId], (err, product) => {
          if (err) {
            console.error('Erro ao buscar produto criado:', err);
            return res.status(500).json({ message: 'Erro interno do servidor' });
          }

          res.status(201).json({
            message: 'Produto criado com sucesso',
            product
          });
        });
      });
    });
  }
});

// Update product
router.put('/:id', authenticateToken, requireAdmin, upload.single('image'), [
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('unit').notEmpty().withMessage('Unidade é obrigatória'),
  body('price').isFloat({ min: 0 }).withMessage('Preço deve ser um valor válido'),
  body('cost').optional().isFloat({ min: 0 }).withMessage('Custo deve ser um valor válido')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, description, category_id, unit, price, cost, barcode, dimensions, active } = req.body;
  const productId = req.params.id;
  const db = getDB();

  // Check if product exists
  db.get('SELECT * FROM products WHERE id = ?', [productId], (err, product) => {
    if (err) {
      console.error('Erro ao buscar produto:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (!product) {
      return res.status(404).json({ message: 'Produto não encontrado' });
    }

    const image_url = req.file ? `/uploads/${req.file.filename}` : product.image_url;

    // Check if barcode already exists (for other products)
    if (barcode && barcode !== product.barcode) {
      db.get('SELECT id FROM products WHERE barcode = ? AND id != ?', [barcode, productId], (err, existingProduct) => {
        if (err) {
          console.error('Erro ao verificar código de barras:', err);
          return res.status(500).json({ message: 'Erro interno do servidor' });
        }

        if (existingProduct) {
          return res.status(400).json({ message: 'Código de barras já existe' });
        }

        updateProduct();
      });
    } else {
      updateProduct();
    }

    function updateProduct() {
      const updateQuery = `
        UPDATE products 
        SET name = ?, description = ?, category_id = ?, unit = ?, price = ?, cost = ?, 
            barcode = ?, image_url = ?, dimensions = ?, active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      db.run(updateQuery, [
        name, description, category_id, unit, price, cost || null, 
        barcode || null, image_url, dimensions, active !== false ? 1 : 0, productId
      ], function(err) {
        if (err) {
          console.error('Erro ao atualizar produto:', err);
          return res.status(500).json({ message: 'Erro ao atualizar produto' });
        }

        // Return updated product
        db.get(`
          SELECT 
            p.*, c.name as category_name,
            i.quantity, i.min_stock, i.max_stock, i.location
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          LEFT JOIN inventory i ON p.id = i.product_id
          WHERE p.id = ?
        `, [productId], (err, updatedProduct) => {
          if (err) {
            console.error('Erro ao buscar produto atualizado:', err);
            return res.status(500).json({ message: 'Erro interno do servidor' });
          }

          res.json({
            message: 'Produto atualizado com sucesso',
            product: updatedProduct
          });
        });
      });
    }
  });
});

// Delete product (soft delete)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const db = getDB();

  db.run('UPDATE products SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      console.error('Erro ao desativar produto:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: 'Produto não encontrado' });
    }

    res.json({ message: 'Produto desativado com sucesso' });
  });
});

// Get categories
router.get('/categories/list', authenticateToken, (req, res) => {
  const db = getDB();

  db.all('SELECT * FROM categories ORDER BY name', (err, categories) => {
    if (err) {
      console.error('Erro ao buscar categorias:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    res.json(categories);
  });
});

module.exports = router;