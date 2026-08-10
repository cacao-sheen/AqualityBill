# AqualityBill Admin - Frontend

Next.js frontend application for AqualityBill Admin system.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file from `.env.example`:
```bash
cp .env.example .env.local
```

3. Update `.env.local` with your API URL

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Features

- User authentication and authorization
- Dashboard with statistics
- Bill management
- User management
- Responsive design with Tailwind CSS
- TypeScript support
- State management with Zustand
- API integration with React Query

## Pages

- `/` - Home page
- `/login` - Login page
- `/dashboard` - Main dashboard (protected)
- `/bills` - Bill management (protected)
- `/users` - User management (protected)

## Technologies

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Zustand (state management)
- React Query (data fetching)
- Axios (HTTP client)
