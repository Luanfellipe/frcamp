# Campaign Manager Application

This is a Node.js application that uses PostgreSQL for data storage and Redis for caching.

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- Redis (v6 or higher)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd CampanhaFarol
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory with the following variables:
   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=production
   TIMEZONE=America/Sao_Paulo

   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=your_database_name
   DB_USER=your_database_user
   DB_PASSWORD=your_database_password

   # Redis Configuration
   REDIS_URL=redis://localhost:6379
   ```

## Server Setup (Ubuntu)

1. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Install PostgreSQL**
   ```bash
   sudo apt-get update
   sudo apt-get install -y postgresql postgresql-contrib
   ```

3. **Install Redis**
   ```bash
   sudo apt-get install -y redis-server
   ```

4. **Configure PostgreSQL**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE your_database_name;
   CREATE USER your_database_user WITH ENCRYPTED PASSWORD 'your_database_password';
   GRANT ALL PRIVILEGES ON DATABASE your_database_name TO your_database_user;
   \q
   ```

5. **Configure Redis**
   ```bash
   sudo systemctl enable redis-server
   sudo systemctl start redis-server
   ```

## Running the Application

1. **Development Mode**
   ```bash
   npm run dev
   ```

2. **Production Mode**
   ```bash
   npm start
   ```

3. **Using PM2 (Recommended for production)**
   ```bash
   # Install PM2
   sudo npm install -g pm2

   # Start the application
   pm2 start src/index.js --name campaign-manager

   # Enable startup script
   pm2 startup
   pm2 save
   ```

## Monitoring

- Check application logs:
  ```bash
  # Using PM2
  pm2 logs campaign-manager

  # Direct log files
  tail -f error.log
  tail -f combined.log
  ```

- Monitor application status:
  ```bash
  pm2 status
  ```

- Check health endpoint:
  ```bash
  curl http://localhost:3000/health
  ```

## Security Recommendations

1. Use strong passwords for database and Redis
2. Configure firewall rules to restrict access to necessary ports only
3. Keep Node.js and npm packages updated
4. Use SSL/TLS for production deployments
5. Regularly backup your database

## Troubleshooting

1. If the application fails to connect to PostgreSQL:
   - Check if PostgreSQL service is running: `sudo systemctl status postgresql`
   - Verify database credentials in .env file
   - Ensure PostgreSQL is accepting connections: check pg_hba.conf

2. If Redis connection fails:
   - Check if Redis service is running: `sudo systemctl status redis-server`
   - Verify Redis connection URL in .env file

3. If the application crashes:
   - Check error.log for detailed error messages
   - Verify all environment variables are properly set
   - Ensure all required dependencies are installed

For more information or support, please refer to the project documentation or create an issue in the repository.