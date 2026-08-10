# AqualityBill Admin System

A full-stack water billing administration system built with Node.js backend and Next.js frontend.

## Project Structure

```
AqualityBill-Admin/
├── backend/              # Node.js + Express API
│   ├── controllers/      # Request handlers
│   ├── models/          # Database models
│   ├── routes/          # API routes
│   ├── middleware/      # Custom middleware
│   ├── server.js        # Entry point
│   └── package.json     # Dependencies
│
└── frontend/            # Next.js application
    ├── src/
    │   ├── app/         # App router pages
    │   ├── components/  # React components
    │   ├── lib/         # Utilities
    │   └── store/       # State management
    └── package.json     # Dependencies
```

## Features

### Backend (Node.js)
- RESTful API with Express
- MongoDB database with Mongoose
- JWT authentication
- Role-based authorization
- User and bill management
- Secure password hashing with bcrypt

### Frontend (Next.js)
- Server-side rendering
- TypeScript support
- Tailwind CSS styling
- Zustand state management
- React Query for data fetching
- Protected routes
- Responsive design

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- MongoDB (local or cloud)
- npm or yarn

### Backend Setup

1. Navigate to backend folder:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Update `.env` with your settings:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/aqualitybill
JWT_SECRET=your_secret_key
JWT_EXPIRE=7d
NODE_ENV=development
```

5. Start the server:
```bash
npm run dev
```

Backend will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to frontend folder:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` file:
```bash
cp .env.example .env.local
```

4. Update `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

5. Start the development server:
```bash
npm run dev
```

Frontend will run on `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user

### Users (Protected)
- `GET /api/users` - Get all users (admin)
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create user (admin)
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (admin)

### Bills (Protected)
- `GET /api/bills` - Get all bills
- `GET /api/bills/:id` - Get bill by ID
- `POST /api/bills` - Create bill (admin)
- `PUT /api/bills/:id` - Update bill (admin)
- `DELETE /api/bills/:id` - Delete bill (admin)
- `PATCH /api/bills/:id/pay` - Mark bill as paid

## Technologies Used

### Backend
- Node.js
- Express
- MongoDB + Mongoose
- JWT (jsonwebtoken)
- bcryptjs
- CORS
- dotenv

### Frontend
- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Zustand
- React Query
- Axios

## Development

### Running Both Servers

You can run both backend and frontend simultaneously in separate terminals:

Terminal 1 (Backend):
```bash
cd backend
npm run dev
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

## Production Build

### Backend
```bash
cd backend
npm start
```

### Frontend
```bash
cd frontend
npm run build
npm start
```

## License

ISC

## Support

For support, email your-email@example.com or create an issue in the repository.
