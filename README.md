# Golf Club Event Management - Mobile App

A React Native mobile application for managing golf club events, converted from an existing PHP/MySQL web application.

## Project Structure

```
phoneAI/
├── app/                    # Expo Router screens
│   ├── _layout.tsx         # Root layout with navigation provider
│   ├── index.tsx           # Search screen (replaces search_event.html)
│   └── menu.tsx            # Event action menu (replaces menu.html)
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── Header.tsx      # Golf-themed header bar
│   │   └── EventCard.tsx   # Event listing card component
│   ├── services/           # Data service layer (mock data)
│   │   └── eventService.ts # Event search and retrieval functions
│   └── types/              # TypeScript interfaces
│       └── event.ts        # GolfEvent type definition
├── assets/                 # Images, fonts, etc.
└── package.json
```

## Features Implemented

- **Search Screen** (`app/index.tsx`): Search events by name or course with a text input and search button
- **Create Event Screen** (`app/create.tsx`): Form to create new events with name, course, date, and description
- **Event Menu Screen** (`app/menu.tsx`): Action menu for selected event with options to register, view participants, edit, or delete

## Database Connection Info

The original PHP website connects to:
```php
$mysqli = new mysqli("localhost", "myclubadmin", "Ohiostate1!", "myclubgolf");
```

This connection info should be used when implementing the backend API integration.

## Running the App

```bash
# Install dependencies (if not already done)
npm install

# Start development server
npx expo start

# Run on Android emulator/device
npm run android

# Run on web browser
npm run web
```

## Next Steps

1. Implement actual MySQL API integration to replace mock data
2. Add more action screens from the original menu.html (Register, View Participants, Edit, Delete)
3. Set up authentication if needed
