# MedicAI - Complete Application Overview

## Project Summary

MedicAI is a complete medical consultation assistant system with:
- **Backend**: Python FastAPI with AI agent capabilities
- **Frontend**: Next.js with modern React UI

## Architecture

```
MedicAI/
├── frontend/          # Next.js frontend application
│   ├── app/          # Pages and routes
│   ├── components/   # React components
│   ├── lib/          # API client and hooks
│   └── types/        # TypeScript definitions
│
├── app/              # FastAPI backend
│   ├── api/          # API routes
│   ├── schemas/      # Pydantic models
│   └── services/     # Business logic
│
├── src/medicai/      # Core medical AI logic
│   ├── agent/        # AI agent implementation
│   ├── ingestion/    # Document processing
│   ├── rag/          # RAG implementation
│   └── storage/      # Database layer
│
└── data/             # Patient data
    ├── raw/          # Original documents
    └── processed/    # Extracted data
```

## Running the Full Stack

### 1. Start Backend (Terminal 1)

```bash
cd c:\Users\Hp\PycharmProjects\Medicai
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

Backend runs at: `http://localhost:8000`

### 2. Start Frontend (Terminal 2)

```bash
cd c:\Users\Hp\PycharmProjects\Medicai\frontend
npm run dev
```

Frontend runs at: `http://localhost:3000`

## Application Screens

### Screen 1: Welcome Dashboard (`/`)
**Purpose**: Triage + orientation

Shows 3 key metrics in large cards:
- Today's consultations: 8
- Patients with new documents: 3
- Waiting for review: 5

Each card is clickable and navigates to the relevant section.

**Design Philosophy**: "Who needs my attention today?"
- Not analytics, not vanity metrics
- If this screen doesn't trigger at least one click, it's useless
- This is a decision screen, not a dashboard

### Screen 2: Patients List (`/patients`)
**Purpose**: Longitudinal navigation

Features:
- Search bar for finding patients
- Filter tabs (All/Active/Archived)
- Patient table showing:
  - Name with avatar
  - Date of birth
  - Patient ID (clickable, blue)
  - Last consultation date
  - Document count
  - Status badge

**Design Philosophy**: "Which patient do I want to open?"
- Patient-centric, not event-centric
- Quick search and filter
- Clear navigation to patient workspace

### Screen 3: Consultations List (`/consultations`)
**Purpose**: Time-boxed work queue

Features:
- Filter tabs (All/Today)
- Consultation table showing:
  - Patient name
  - Patient ID
  - Last consultation
  - Document count
  - Status

**Design Philosophy**: "What do I need to review now?"
- Exists only if consultations are distinct events
- A patient can have multiple consultations over time
- Focus on time-based workflow

### Screen 4: Patient Workspace (`/patients/[id]`) ⭐ CORE
**Purpose**: Do the work

**80% of product value lives here**

Layout:
```
┌─────────────────────────────────────┬──────────────────┐
│ Patient Header                      │                  │
│ [Avatar] Marie Dupont               │                  │
│          DOB: March 15, 1985        │  Patient Snapshot│
├─────────────────────────────────────┤                  │
│                                     │  - Demographics  │
│                                     │  - Latest Labs   │
│        AI Chat Messages             │  - Trends        │
│                                     │  - Data Gaps     │
│                                     │                  │
│                                     │                  │
├─────────────────────────────────────┤                  │
│ [Input] Write a note or ask...      │                  │
└─────────────────────────────────────┴──────────────────┘
```

Left Panel - Chat Interface:
- Header with patient info
- Upload document button
- Prepare consultation button
- Chat messages area (scrollable)
- Input box with quick actions
- Suggested prompts

Right Panel - Patient Snapshot:
1. **Demographics**
   - Name, DOB, Age
   - Patient ID
   - Last visit
   - Contact info

2. **Latest Labs**
   - Test results with status badges
   - Visual indicators (↓↑ arrows)
   - Color coding (red=low, orange=high)

3. **Trends**
   - Key health trends
   - Worsening/improving indicators

4. **Data Gaps**
   - Action items
   - Follow-up needs
   - Missing information

**Design Philosophy**: If this screen is great, doctors forgive everything else.

## API Endpoints Used

### Patients
- `GET /api/patients/{id}/snapshot` - Get patient data
- `POST /api/patients/{id}/prep` - Generate consultation prep

### Consultations
- `POST /api/consultations` - Create new consultation
- `POST /api/consultations/{id}/chat` - Send message to AI
- `GET /api/consultations/{id}/messages` - Get chat history
- `POST /api/consultations/{id}:reset` - Reset conversation

### Documents
- `POST /api/consultations/{id}/documents` - Upload document

## Tech Stack Details

### Frontend
- **Framework**: Next.js 16.1.1 with App Router
- **TypeScript**: Full type safety
- **Styling**: Tailwind CSS v4
- **Components**: shadcn/ui
  - Button, Card, Input, Avatar, Badge
  - Dialog, Dropdown, Select, Tabs
  - Separator, ScrollArea
- **State**: TanStack Query v5
  - Automatic caching
  - Background refetching
  - Optimistic updates
- **Icons**: Lucide React
- **HTTP**: Axios

### Backend
- **Framework**: FastAPI
- **AI**: LangChain + OpenAI
- **Database**: PostgreSQL
- **Document Processing**: Custom extractors
- **RAG**: Vector store for document retrieval

## Key Features Implemented

### ✅ Navigation
- Sidebar with icons for main sections
- Breadcrumb-style navigation
- Direct links throughout

### ✅ Real-time Chat
- AI assistant integration
- Contextual responses based on patient data
- Message history persistence

### ✅ Patient Data
- Snapshot view with latest results
- Lab result visualization
- Trend indicators
- Alert system

### ✅ Search & Filter
- Patient search by name or ID
- Filter by status (Active/Archived)
- Consultation filters (All/Today)

### ✅ Responsive Design
- Mobile-first approach
- Adaptive layouts
- Touch-friendly

### ✅ Type Safety
- Full TypeScript coverage
- API type definitions
- Component prop types

## Color Scheme

- **Primary**: Default theme color for active states
- **Blue**: Patient IDs, links
- **Red/Destructive**: Low lab values, critical alerts
- **Orange**: High lab values, warnings
- **Gray/Muted**: Secondary text, borders
- **Green**: Success states, normal values

## UX Principles Applied

1. **Decision-First Design**
   - Every screen answers a specific question
   - No vanity metrics
   - Action-oriented

2. **Progressive Disclosure**
   - Show summary first
   - Details on demand
   - Context when needed

3. **Fast Navigation**
   - Maximum 2 clicks to any patient
   - Sidebar always accessible
   - Quick links in cards

4. **Focus on Core**
   - Patient workspace is the priority
   - Other screens support navigation
   - 80% of value in workspace

## Next Steps

### Immediate
1. Connect to real backend API
2. Add document upload functionality
3. Implement consultation summary generation
4. Add user authentication

### Short-term
1. Real-time updates (WebSockets)
2. Document preview
3. Advanced filters
4. Export functionality

### Long-term
1. Multi-language support
2. EHR integration
3. Mobile app
4. Offline mode

## Development Workflow

1. **Backend Development**
   ```bash
   cd c:\Users\Hp\PycharmProjects\Medicai
   .\.venv\Scripts\Activate.ps1
   uvicorn app.main:app --reload
   ```

2. **Frontend Development**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Testing**
   - Backend: `pytest`
   - Frontend: `npm test` (when configured)

4. **Building**
   ```bash
   cd frontend
   npm run build
   ```

## Environment Variables

### Frontend (`.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend
Configure in Python config or environment:
- Database connection
- OpenAI API key
- CORS origins

## Deployment

### Frontend (Vercel)
```bash
cd frontend
npm run build
# Deploy to Vercel
```

### Backend (Docker/Cloud)
```bash
# Use docker-compose.yml
docker-compose up
```

## Notes

- The app is designed for desktop-first use (medical professionals)
- All patient data is currently mock data
- Real backend integration requires proper API implementation
- Security considerations: authentication, authorization, HIPAA compliance
