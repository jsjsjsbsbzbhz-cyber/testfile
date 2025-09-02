import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: '📊' },
    { name: 'Produtos', href: '/products', icon: '📦' },
    { name: 'Vendas', href: '/sales', icon: '💰' },
    { name: 'Clientes', href: '/customers', icon: '👥' },
    { name: 'Estoque', href: '/inventory', icon: '📋' },
    { name: 'Relatórios', href: '/reports', icon: '📈' }
  ];

  const getPageTitle = () => {
    const current = navigation.find(nav => nav.href === location.pathname);
    return current ? current.name : 'Sistema PDV';
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>🏪 PDV Madeireira</h1>
        </div>
        <nav>
          <ul className="sidebar-nav">
            {navigation.map((item) => (
              <li key={item.name}>
                <Link
                  to={item.href}
                  className={location.pathname === item.href ? 'active' : ''}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="main-content">
        <header className="header">
          <div className="header-content">
            <h2>{getPageTitle()}</h2>
            <div className="user-menu">
              <div className="user-info">
                <span>👤 {user?.username}</span>
                <span className="text-muted">({user?.role})</span>
              </div>
              <button
                onClick={logout}
                className="logout-btn"
                title="Sair"
              >
                🚪 Sair
              </button>
            </div>
          </div>
        </header>

        <div className="content">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;