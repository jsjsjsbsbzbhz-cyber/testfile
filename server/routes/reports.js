const express = require('express');
const { getDB } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Sales reports
router.get('/sales', authenticateToken, (req, res) => {
  const startDate = req.query.start_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const endDate = req.query.end_date || new Date().toISOString().split('T')[0];
  const groupBy = req.query.group_by || 'day'; // day, week, month

  const db = getDB();

  let dateFormat;
  switch (groupBy) {
    case 'week':
      dateFormat = "strftime('%Y-W%W', sale_date)";
      break;
    case 'month':
      dateFormat = "strftime('%Y-%m', sale_date)";
      break;
    default:
      dateFormat = "DATE(sale_date)";
  }

  const salesQuery = `
    SELECT 
      ${dateFormat} as period,
      COUNT(*) as sales_count,
      SUM(total_amount) as total_revenue,
      AVG(total_amount) as avg_sale_value,
      SUM(discount) as total_discounts
    FROM sales 
    WHERE DATE(sale_date) BETWEEN ? AND ? AND status = 'concluida'
    GROUP BY ${dateFormat}
    ORDER BY period
  `;

  const summaryQuery = `
    SELECT 
      COUNT(*) as total_sales,
      SUM(total_amount) as total_revenue,
      AVG(total_amount) as avg_sale_value,
      SUM(discount) as total_discounts,
      COUNT(DISTINCT customer_id) as unique_customers
    FROM sales 
    WHERE DATE(sale_date) BETWEEN ? AND ? AND status = 'concluida'
  `;

  Promise.all([
    new Promise((resolve, reject) => {
      db.all(salesQuery, [startDate, endDate], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    }),
    new Promise((resolve, reject) => {
      db.get(summaryQuery, [startDate, endDate], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    })
  ])
  .then(([salesData, summary]) => {
    res.json({
      period: { start_date: startDate, end_date: endDate, group_by: groupBy },
      summary: {
        total_sales: summary.total_sales || 0,
        total_revenue: parseFloat(summary.total_revenue) || 0,
        avg_sale_value: parseFloat(summary.avg_sale_value) || 0,
        total_discounts: parseFloat(summary.total_discounts) || 0,
        unique_customers: summary.unique_customers || 0
      },
      data: salesData.map(row => ({
        period: row.period,
        sales_count: row.sales_count,
        total_revenue: parseFloat(row.total_revenue) || 0,
        avg_sale_value: parseFloat(row.avg_sale_value) || 0,
        total_discounts: parseFloat(row.total_discounts) || 0
      }))
    });
  })
  .catch(err => {
    console.error('Erro ao gerar relatório de vendas:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  });
});

// Top selling products report
router.get('/products/top-selling', authenticateToken, (req, res) => {
  const startDate = req.query.start_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const endDate = req.query.end_date || new Date().toISOString().split('T')[0];
  const limit = parseInt(req.query.limit) || 10;

  const db = getDB();

  const query = `
    SELECT 
      p.id, p.name, p.unit, p.price,
      c.name as category_name,
      SUM(si.quantity) as total_quantity_sold,
      COUNT(DISTINCT si.sale_id) as times_sold,
      SUM(si.total_price) as total_revenue,
      AVG(si.unit_price) as avg_selling_price
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    JOIN sales s ON si.sale_id = s.id
    WHERE DATE(s.sale_date) BETWEEN ? AND ? AND s.status = 'concluida'
    GROUP BY p.id, p.name, p.unit, p.price, c.name
    ORDER BY total_revenue DESC
    LIMIT ?
  `;

  db.all(query, [startDate, endDate, limit], (err, products) => {
    if (err) {
      console.error('Erro ao buscar produtos mais vendidos:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    res.json({
      period: { start_date: startDate, end_date: endDate },
      products: products.map(product => ({
        ...product,
        total_quantity_sold: parseFloat(product.total_quantity_sold) || 0,
        total_revenue: parseFloat(product.total_revenue) || 0,
        avg_selling_price: parseFloat(product.avg_selling_price) || 0
      }))
    });
  });
});

// Customer analysis report
router.get('/customers', authenticateToken, (req, res) => {
  const startDate = req.query.start_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const endDate = req.query.end_date || new Date().toISOString().split('T')[0];
  const limit = parseInt(req.query.limit) || 10;

  const db = getDB();

  const topCustomersQuery = `
    SELECT 
      c.id, c.name, c.customer_type,
      COUNT(s.id) as total_purchases,
      SUM(s.total_amount) as total_spent,
      AVG(s.total_amount) as avg_purchase_value,
      MAX(s.sale_date) as last_purchase_date
    FROM customers c
    JOIN sales s ON c.id = s.customer_id
    WHERE DATE(s.sale_date) BETWEEN ? AND ? AND s.status = 'concluida'
    GROUP BY c.id, c.name, c.customer_type
    ORDER BY total_spent DESC
    LIMIT ?
  `;

  const customerStatsQuery = `
    SELECT 
      COUNT(DISTINCT c.id) as total_customers,
      COUNT(DISTINCT CASE WHEN c.customer_type = 'pessoa_fisica' THEN c.id END) as individuals,
      COUNT(DISTINCT CASE WHEN c.customer_type = 'pessoa_juridica' THEN c.id END) as companies,
      AVG(customer_totals.total_spent) as avg_customer_value
    FROM customers c
    JOIN (
      SELECT customer_id, SUM(total_amount) as total_spent
      FROM sales 
      WHERE DATE(sale_date) BETWEEN ? AND ? AND status = 'concluida'
      GROUP BY customer_id
    ) customer_totals ON c.id = customer_totals.customer_id
  `;

  Promise.all([
    new Promise((resolve, reject) => {
      db.all(topCustomersQuery, [startDate, endDate, limit], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    }),
    new Promise((resolve, reject) => {
      db.get(customerStatsQuery, [startDate, endDate], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    })
  ])
  .then(([topCustomers, stats]) => {
    res.json({
      period: { start_date: startDate, end_date: endDate },
      summary: {
        total_customers: stats.total_customers || 0,
        individuals: stats.individuals || 0,
        companies: stats.companies || 0,
        avg_customer_value: parseFloat(stats.avg_customer_value) || 0
      },
      top_customers: topCustomers.map(customer => ({
        ...customer,
        total_spent: parseFloat(customer.total_spent) || 0,
        avg_purchase_value: parseFloat(customer.avg_purchase_value) || 0
      }))
    });
  })
  .catch(err => {
    console.error('Erro ao gerar relatório de clientes:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  });
});

// Inventory report
router.get('/inventory', authenticateToken, (req, res) => {
  const db = getDB();

  const inventoryQuery = `
    SELECT 
      p.id, p.name, p.unit, p.price, p.cost,
      c.name as category_name,
      i.quantity, i.min_stock, i.max_stock,
      (i.quantity * p.price) as inventory_value,
      (i.quantity * COALESCE(p.cost, 0)) as inventory_cost,
      CASE 
        WHEN i.quantity = 0 THEN 'out_of_stock'
        WHEN i.quantity <= i.min_stock THEN 'low_stock'
        WHEN i.quantity >= i.max_stock THEN 'overstock'
        ELSE 'normal'
      END as stock_status
    FROM products p
    LEFT JOIN inventory i ON p.id = i.product_id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.active = 1
    ORDER BY 
      CASE 
        WHEN i.quantity = 0 THEN 0
        WHEN i.quantity <= i.min_stock THEN 1
        ELSE 2
      END,
      inventory_value DESC
  `;

  const summaryQuery = `
    SELECT 
      COUNT(p.id) as total_products,
      SUM(i.quantity * p.price) as total_inventory_value,
      SUM(i.quantity * COALESCE(p.cost, 0)) as total_inventory_cost,
      COUNT(CASE WHEN i.quantity = 0 THEN 1 END) as out_of_stock_count,
      COUNT(CASE WHEN i.quantity <= i.min_stock AND i.quantity > 0 THEN 1 END) as low_stock_count,
      COUNT(CASE WHEN i.quantity >= i.max_stock THEN 1 END) as overstock_count
    FROM products p
    LEFT JOIN inventory i ON p.id = i.product_id
    WHERE p.active = 1
  `;

  Promise.all([
    new Promise((resolve, reject) => {
      db.all(inventoryQuery, [], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    }),
    new Promise((resolve, reject) => {
      db.get(summaryQuery, [], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    })
  ])
  .then(([inventory, summary]) => {
    res.json({
      summary: {
        total_products: summary.total_products || 0,
        total_inventory_value: parseFloat(summary.total_inventory_value) || 0,
        total_inventory_cost: parseFloat(summary.total_inventory_cost) || 0,
        out_of_stock_count: summary.out_of_stock_count || 0,
        low_stock_count: summary.low_stock_count || 0,
        overstock_count: summary.overstock_count || 0
      },
      products: inventory.map(item => ({
        ...item,
        quantity: parseFloat(item.quantity) || 0,
        min_stock: parseFloat(item.min_stock) || 0,
        max_stock: parseFloat(item.max_stock) || 0,
        inventory_value: parseFloat(item.inventory_value) || 0,
        inventory_cost: parseFloat(item.inventory_cost) || 0
      }))
    });
  })
  .catch(err => {
    console.error('Erro ao gerar relatório de estoque:', err);
    res.status(500).json({ message: 'Erro interno do servidor' });
  });
});

// Sales by payment method
router.get('/sales/payment-methods', authenticateToken, (req, res) => {
  const startDate = req.query.start_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const endDate = req.query.end_date || new Date().toISOString().split('T')[0];

  const db = getDB();

  const query = `
    SELECT 
      payment_method,
      COUNT(*) as transaction_count,
      SUM(total_amount) as total_amount,
      AVG(total_amount) as avg_amount
    FROM sales 
    WHERE DATE(sale_date) BETWEEN ? AND ? AND status = 'concluida'
    GROUP BY payment_method
    ORDER BY total_amount DESC
  `;

  db.all(query, [startDate, endDate], (err, results) => {
    if (err) {
      console.error('Erro ao buscar vendas por método de pagamento:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    const total = results.reduce((sum, row) => sum + parseFloat(row.total_amount), 0);

    res.json({
      period: { start_date: startDate, end_date: endDate },
      payment_methods: results.map(row => ({
        payment_method: row.payment_method,
        transaction_count: row.transaction_count,
        total_amount: parseFloat(row.total_amount) || 0,
        avg_amount: parseFloat(row.avg_amount) || 0,
        percentage: total > 0 ? ((parseFloat(row.total_amount) / total) * 100).toFixed(2) : 0
      })),
      summary: {
        total_transactions: results.reduce((sum, row) => sum + row.transaction_count, 0),
        total_amount: total
      }
    });
  });
});

// Sales by category
router.get('/sales/categories', authenticateToken, (req, res) => {
  const startDate = req.query.start_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const endDate = req.query.end_date || new Date().toISOString().split('T')[0];

  const db = getDB();

  const query = `
    SELECT 
      COALESCE(c.name, 'Sem Categoria') as category_name,
      SUM(si.quantity) as total_quantity_sold,
      SUM(si.total_price) as total_revenue,
      COUNT(DISTINCT si.product_id) as products_sold,
      COUNT(DISTINCT si.sale_id) as sales_count
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    JOIN sales s ON si.sale_id = s.id
    WHERE DATE(s.sale_date) BETWEEN ? AND ? AND s.status = 'concluida'
    GROUP BY c.id, c.name
    ORDER BY total_revenue DESC
  `;

  db.all(query, [startDate, endDate], (err, results) => {
    if (err) {
      console.error('Erro ao buscar vendas por categoria:', err);
      return res.status(500).json({ message: 'Erro interno do servidor' });
    }

    const totalRevenue = results.reduce((sum, row) => sum + parseFloat(row.total_revenue), 0);

    res.json({
      period: { start_date: startDate, end_date: endDate },
      categories: results.map(row => ({
        category_name: row.category_name,
        total_quantity_sold: parseFloat(row.total_quantity_sold) || 0,
        total_revenue: parseFloat(row.total_revenue) || 0,
        products_sold: row.products_sold,
        sales_count: row.sales_count,
        percentage: totalRevenue > 0 ? ((parseFloat(row.total_revenue) / totalRevenue) * 100).toFixed(2) : 0
      })),
      summary: {
        total_revenue: totalRevenue,
        total_categories: results.length
      }
    });
  });
});

module.exports = router;