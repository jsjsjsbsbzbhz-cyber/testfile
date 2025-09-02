import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { formatCurrency, formatDateTime } from '../utils/helpers';

const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [salesResponse, inventoryResponse] = await Promise.all([
        api.get('/sales/summary/dashboard'),
        api.get('/inventory/summary')
      ]);

      setSummary({
        sales: salesResponse.data,
        inventory: inventoryResponse.data
      });
    } catch (error) {
      console.error('Erro ao carregar dados do dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Carregando dashboard...</div>;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Dashboard</h1>
        <div className="d-flex gap-2">
          <Link to="/sales" className="btn btn-primary">
            🛒 Nova Venda
          </Link>
          <Link to="/products" className="btn btn-outline-primary">
            📦 Gerenciar Produtos
          </Link>
        </div>
      </div>

      {/* Sales Summary Cards */}
      <div className="row mb-4">
        <div className="col-6 col-md-3">
          <div className="card">
            <div className="card-body text-center">
              <h3 className="text-primary">{summary?.sales?.today?.count || 0}</h3>
              <p className="text-muted mb-1">Vendas Hoje</p>
              <small className="text-success">
                {formatCurrency(summary?.sales?.today?.total || 0)}
              </small>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="card">
            <div className="card-body text-center">
              <h3 className="text-primary">{summary?.sales?.month?.count || 0}</h3>
              <p className="text-muted mb-1">Vendas Este Mês</p>
              <small className="text-success">
                {formatCurrency(summary?.sales?.month?.total || 0)}
              </small>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="card">
            <div className="card-body text-center">
              <h3 className="text-warning">{summary?.inventory?.low_stock_items || 0}</h3>
              <p className="text-muted mb-1">Estoque Baixo</p>
              <small className="text-muted">
                Total: {summary?.inventory?.total_products || 0} produtos
              </small>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="card">
            <div className="card-body text-center">
              <h3 className="text-info">
                {formatCurrency(summary?.inventory?.total_inventory_value || 0)}
              </h3>
              <p className="text-muted mb-1">Valor do Estoque</p>
              <small className="text-muted">
                {summary?.inventory?.out_of_stock_items || 0} sem estoque
              </small>
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        {/* Recent Sales */}
        <div className="col-md-8">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Vendas Recentes</h5>
              <Link to="/sales" className="btn btn-sm btn-outline-primary">
                Ver Todas
              </Link>
            </div>
            <div className="card-body">
              {summary?.sales?.recent_sales?.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Cliente</th>
                        <th>Vendedor</th>
                        <th>Total</th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.sales.recent_sales.map((sale) => (
                        <tr key={sale.id}>
                          <td>#{sale.id}</td>
                          <td>{sale.customer_name || 'Cliente Avulso'}</td>
                          <td>{sale.seller_name}</td>
                          <td className="text-success font-weight-bold">
                            {formatCurrency(sale.total_amount)}
                          </td>
                          <td className="text-muted">
                            {formatDateTime(sale.sale_date)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-muted py-4">
                  Nenhuma venda recente encontrada
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="col-md-4">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Ações Rápidas</h5>
            </div>
            <div className="card-body">
              <div className="d-grid gap-2">
                <Link to="/sales" className="btn btn-primary">
                  🛒 Nova Venda
                </Link>
                <Link to="/products" className="btn btn-outline-primary">
                  📦 Adicionar Produto
                </Link>
                <Link to="/customers" className="btn btn-outline-primary">
                  👤 Novo Cliente
                </Link>
                <Link to="/inventory" className="btn btn-outline-primary">
                  📋 Ajustar Estoque
                </Link>
                <Link to="/reports" className="btn btn-outline-primary">
                  📈 Ver Relatórios
                </Link>
              </div>
            </div>
          </div>

          {/* Inventory Alerts */}
          {summary?.inventory?.low_stock_items > 0 && (
            <div className="card mt-3">
              <div className="card-header bg-warning">
                <h6 className="mb-0 text-dark">⚠️ Alertas de Estoque</h6>
              </div>
              <div className="card-body">
                <p className="mb-2">
                  <strong>{summary.inventory.low_stock_items}</strong> produtos 
                  com estoque baixo
                </p>
                {summary?.inventory?.out_of_stock_items > 0 && (
                  <p className="mb-2 text-danger">
                    <strong>{summary.inventory.out_of_stock_items}</strong> produtos 
                    sem estoque
                  </p>
                )}
                <Link to="/inventory?low_stock=true" className="btn btn-sm btn-warning">
                  Ver Produtos
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;