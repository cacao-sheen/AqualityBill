# AqualityBill Admin - Backend API

Node.js + Express backend for AqualityBill Admin system.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration

4. Start the development server:
```bash
npm run dev
```

## API Endpoints

### Authentication
- POST `/api/auth/register` - Register new user
- POST `/api/auth/login` - Login user
- POST `/api/auth/logout` - Logout user

### Users
- GET `/api/users` - Get all users (admin only)
- GET `/api/users/:id` - Get single user
- POST `/api/users` - Create user (admin only)
- PUT `/api/users/:id` - Update user
- DELETE `/api/users/:id` - Delete user (admin only)

### Bills
- GET `/api/bills` - Get all bills
- GET `/api/bills/:id` - Get single bill
- POST `/api/bills` - Create bill (admin only)
- PUT `/api/bills/:id` - Update bill (admin only)
- DELETE `/api/bills/:id` - Delete bill (admin only)
- PATCH `/api/bills/:id/pay` - Mark bill as paid

## Technologies

- Node.js
- Express
- MongoDB + Mongoose
- JWT Authentication
- bcryptjs for password hashing
