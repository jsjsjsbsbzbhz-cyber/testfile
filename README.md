# Lumber Yard POS System

Sistema completo de Ponto de Venda (PDV) para madeireira com frontend e backend totalmente funcional.

## Funcionalidades

### Backend
- API RESTful com Express.js
- Banco de dados SQLite
- Autenticação JWT
- Gerenciamento de produtos
- Controle de estoque
- Processamento de vendas
- Gerenciamento de clientes
- Sistema de relatórios

### Frontend
- Interface React.js responsiva
- Catálogo de produtos
- Carrinho de compras
- Dashboard administrativo
- Gerenciamento de inventário
- Relatórios de vendas
- Autenticação de usuários

## Instalação

```bash
# Instalar dependências
npm run install-deps

# Executar em modo desenvolvimento
npm run dev

# Executar apenas o servidor
npm run server

# Executar apenas o cliente
npm run client

# Build de produção
npm run build
```

## Estrutura do Projeto

```
├── server/             # Backend Node.js
│   ├── controllers/    # Controladores da API
│   ├── models/         # Modelos do banco de dados
│   ├── routes/         # Rotas da API
│   ├── middleware/     # Middlewares
│   └── database/       # Configuração do banco
├── client/             # Frontend React
│   ├── src/
│   ├── public/
│   └── package.json
└── package.json        # Dependências do projeto
```

## Uso

1. Acesse o sistema através do navegador
2. Faça login como administrador ou vendedor
3. Gerencie produtos, estoque e vendas
4. Processe vendas e emita relatórios

## Tecnologias Utilizadas

- **Backend**: Node.js, Express.js, SQLite, JWT
- **Frontend**: React.js, CSS3, HTML5
- **Autenticação**: JSON Web Tokens
- **Banco de Dados**: SQLite3