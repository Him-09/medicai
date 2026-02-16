# MedicAI Frontend

A modern medical consultation workspace built with Next.js, TypeScript, Tailwind CSS, shadcn/ui, and TanStack Query.

## Features

### 4 Core Screens

1. **Welcome/Home Dashboard** (`/`)
   - Quick triage view showing what needs attention
   - Today's consultations count
   - Patients with new documents
   - Items waiting for review
   - Click-through navigation to relevant sections

2. **Patients List** (`/patients`)
   - Patient-centric navigation
   - Search and filter functionality
   - View all patient records
   - Quick access to patient details

3. **Consultations List** (`/consultations`)
   - Time-boxed work queue
   - Filter by date (Today/All)
   - Shows active and archived consultations
   - Quick access to consultation workspace

4. **Patient Workspace** (`/patients/[id]`)
   - **80% of the app's value lives here**
   - Real-time AI chat assistant
   - Patient snapshot with:
     - Latest lab results
     - Trends and alerts
     - Data gaps
   - Document upload
   - Consultation preparation
   - Full patient context

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **State Management**: TanStack Query (React Query)
- **Icons**: Lucide React
- **Date Handling**: date-fns
- **HTTP Client**: Axios

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Python backend running on `http://localhost:8000`

### Installation

```bash
cd frontend
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
frontend/
├── app/                          # Next.js app router pages
│   ├── page.tsx                 # Home/Dashboard
│   ├── layout.tsx               # Root layout with sidebar
│   ├── patients/
│   │   ├── page.tsx            # Patients list
│   │   └── [id]/
│   │       └── page.tsx        # Patient workspace (CORE)
│   └── consultations/
│       ├── page.tsx            # Consultations list
│       └── [id]/
│           └── page.tsx        # Consultation detail
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── sidebar.tsx             # App navigation sidebar
│   └── providers.tsx           # React Query provider
├── lib/
│   ├── api/
│   │   ├── client.ts          # Axios client setup
│   │   └── index.ts           # API functions
│   ├── hooks/
│   │   └── index.ts           # TanStack Query hooks
│   └── utils.ts               # Utility functions
└── types/
    └── index.ts               # TypeScript type definitions
```

## API Integration

The app connects to the Python FastAPI backend with the following endpoints:

- `GET /api/patients/{id}/snapshot` - Patient data snapshot
- `POST /api/patients/{id}/prep` - Generate consultation prep
- `POST /api/consultations` - Create consultation
- `POST /api/consultations/{id}/chat` - Send chat message
- `GET /api/consultations/{id}/messages` - Get chat history
- `POST /api/consultations/{id}:reset` - Reset chat thread

## Design Principles

### 1. Decision-First Design
Every screen answers a specific question:
- Home: "Who needs my attention?"
- Patients: "Which patient do I want to open?"
- Consultations: "What do I need to review now?"
- Workspace: "What do I need to know to help this patient?"

### 2. Focus on the Core
The Patient Workspace is the heart of the application. It combines:
- Patient context (snapshot)
- AI assistance (chat)
- Document management
- Consultation preparation

### 3. Progressive Disclosure
Information is revealed as needed:
- Dashboard shows summaries
- Lists show key details
- Workspace shows full context

### 4. Fast Navigation
- Sidebar for quick screen switching
- Click-through cards on dashboard
- Direct links from lists to workspaces

