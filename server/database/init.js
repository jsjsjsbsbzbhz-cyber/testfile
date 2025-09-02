const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/lumber_pos.db');

// Create database connection
const getDB = () => {
  return new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('❌ Erro ao conectar com o banco de dados:', err);
    }
  });
};

// Initialize database with tables
const initializeDatabase = () => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    
    // Create tables
    const createTables = `
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'vendedor' CHECK(role IN ('admin', 'vendedor')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Categories table
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Products table
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        category_id INTEGER,
        unit TEXT NOT NULL, -- metros, unidades, m², m³
        price DECIMAL(10,2) NOT NULL,
        cost DECIMAL(10,2),
        barcode TEXT UNIQUE,
        image_url TEXT,
        dimensions TEXT, -- comprimento x largura x espessura
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories (id)
      );

      -- Inventory table
      CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        quantity DECIMAL(10,3) NOT NULL DEFAULT 0,
        min_stock DECIMAL(10,3) DEFAULT 0,
        max_stock DECIMAL(10,3),
        location TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
      );

      -- Customers table
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        cpf_cnpj TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        zip_code TEXT,
        customer_type TEXT DEFAULT 'pessoa_fisica' CHECK(customer_type IN ('pessoa_fisica', 'pessoa_juridica')),
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Sales table
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        user_id INTEGER NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        discount DECIMAL(10,2) DEFAULT 0,
        tax DECIMAL(10,2) DEFAULT 0,
        payment_method TEXT CHECK(payment_method IN ('dinheiro', 'cartao_debito', 'cartao_credito', 'pix', 'boleto')),
        status TEXT DEFAULT 'concluida' CHECK(status IN ('pendente', 'concluida', 'cancelada')),
        notes TEXT,
        sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      );

      -- Sale items table
      CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity DECIMAL(10,3) NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products (id)
      );

      -- Inventory movements table
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        movement_type TEXT CHECK(movement_type IN ('entrada', 'saida', 'ajuste')),
        quantity DECIMAL(10,3) NOT NULL,
        reason TEXT,
        user_id INTEGER,
        reference_id INTEGER, -- sale_id for sales, purchase_id for purchases
        reference_type TEXT, -- 'sale', 'purchase', 'adjustment'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      );
    `;

    db.exec(createTables, (err) => {
      if (err) {
        console.error('❌ Erro ao criar tabelas:', err);
        reject(err);
      } else {
        console.log('✅ Banco de dados inicializado com sucesso');
        
        // Insert default data
        insertDefaultData(db, () => {
          db.close();
          resolve();
        });
      }
    });
  });
};

// Insert default data
const insertDefaultData = (db, callback) => {
  const bcrypt = require('bcryptjs');
  
  // Check if admin user exists
  db.get('SELECT id FROM users WHERE role = "admin"', (err, row) => {
    if (!row) {
      // Create default admin user
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      
      const insertAdmin = `
        INSERT INTO users (username, email, password, role)
        VALUES ('admin', 'admin@madeireira.com', ?, 'admin')
      `;
      
      db.run(insertAdmin, [hashedPassword], (err) => {
        if (err) console.error('Erro ao criar usuário admin:', err);
        else console.log('✅ Usuário admin criado (admin/admin123)');
      });
    }
  });

  // Insert default categories
  const categories = [
    ['Madeira Serrada', 'Tábuas, vigas e sarrafos'],
    ['Compensados', 'Chapas de madeira compensada'],
    ['MDF/MDP', 'Painéis de fibra de madeira'],
    ['Madeira Tratada', 'Madeiras com tratamento preservativo'],
    ['Ferragens', 'Parafusos, pregos e acessórios'],
    ['Ferramentas', 'Ferramentas para carpintaria']
  ];

  db.get('SELECT COUNT(*) as count FROM categories', (err, row) => {
    if (row.count === 0) {
      const insertCategory = 'INSERT INTO categories (name, description) VALUES (?, ?)';
      
      categories.forEach(([name, description]) => {
        db.run(insertCategory, [name, description], (err) => {
          if (err) console.error('Erro ao inserir categoria:', err);
        });
      });
      
      console.log('✅ Categorias padrão inseridas');
    }
  });

  // Insert sample products
  const products = [
    ['Tábua de Pinus 2,5x20x300cm', 'Tábua de pinus para construção', 1, 'metros', 25.90, 18.50, '2,5 x 20 x 300'],
    ['Viga de Eucalipto 5x10x400cm', 'Viga estrutural de eucalipto', 1, 'unidades', 89.90, 65.00, '5 x 10 x 400'],
    ['Compensado Naval 18mm', 'Chapa de compensado naval 220x110cm', 2, 'm²', 145.00, 98.00, '220 x 110 x 1,8'],
    ['MDF Cru 15mm', 'Chapa MDF cru 275x185cm', 3, 'm²', 78.50, 52.00, '275 x 185 x 1,5'],
    ['Deck de Cumaru', 'Tábua para deck 2,5x9x300cm', 4, 'metros', 45.90, 32.00, '2,5 x 9 x 300']
  ];

  db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
    if (row.count === 0) {
      const insertProduct = `
        INSERT INTO products (name, description, category_id, unit, price, cost, dimensions)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      products.forEach(([name, description, category_id, unit, price, cost, dimensions]) => {
        db.run(insertProduct, [name, description, category_id, unit, price, cost, dimensions], function(err) {
          if (err) {
            console.error('Erro ao inserir produto:', err);
          } else {
            // Insert initial inventory
            const insertInventory = `
              INSERT INTO inventory (product_id, quantity, min_stock, max_stock, location)
              VALUES (?, ?, ?, ?, ?)
            `;
            
            db.run(insertInventory, [this.lastID, 100, 10, 1000, 'Estoque Principal'], (err) => {
              if (err) console.error('Erro ao inserir estoque:', err);
            });
          }
        });
      });
      
      console.log('✅ Produtos de exemplo inseridos');
    }
  });

  callback();
};

module.exports = {
  getDB,
  initializeDatabase
};