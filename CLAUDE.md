# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🔧 Common Development Commands

**Development Server:**
```bash
npm run dev          # Start development server at http://localhost:5173
```

**Building for Production:**
```bash
npm run build        # Creates optimized build in dist/ directory
npm run preview      # Preview production build locally
```

**Testing:**
```bash
npm run test         # Run all Vitest tests
npm run test:ui      # Run tests with Vitest UI interface
```

**Linting:**
```bash
npm run lint         # Run ESLint on all TypeScript/TSX files
```

**Environment Setup:**
1. Copy `.env.example` to `.env`
2. Fill in Firebase configuration values from Firebase Console
3. Enable Google Sign-in provider in Firebase Authentication
4. Create Firestore database (Test Mode for development)

## 🏗️ Project Architecture

### High-Level Structure
- **src/** - Main application source code
  - **components/** - Reusable React components
    - `MapBoard.tsx` - Main map interface with drawing/editing capabilities
    - `Toolbar.tsx` - Tool selection UI (Point, Circle, Line, Polygon, Ruler, Select)
    - `LayerSidebar.tsx` - Layer management and object listing
    - `AuthWidget.tsx` - Firebase authentication with Google provider
    - `Icons.tsx` - Custom Leaflet icons for markers and vertices
  - **utils/** - Utility functions and services
    - `firebase.ts` - Firebase initialization and Firestore helpers
    - `geoUtils.ts` - Geographic calculations (distance, area, centroids)
    - `fileImporter.ts` - KML/KMZ import functionality
  - **types.ts** - TypeScript interfaces for map objects, layers, and state
  - **App.tsx** - Main application component
  - **main.tsx** - Application entry point

### Data Flow
1. **State Management**: React state in App.tsx manages:
   - User authentication status
   - Layers configuration (name, visibility, styling)
   - Map objects (points, circles, polylines, polygons)
   - Active drawing mode and selected object
   - Ruler measurements

2. **Persistence**: Firebase Firestore stores:
   - User document (`users/{uid}`) containing layers array
   - Subcollection (`users/{uid}/mapObjects/{objectId}`) for map objects
   - Automatic migration from legacy flat structure to subcollection

3. **Component Interaction**:
   - Toolbar controls drawing mode state
   - MapBoard renders Leaflet map and handles object creation/editing
   - LayerSidebar manages layer visibility and object listing
   - AuthWidget handles user authentication state

### Key Technical Details
- **Map Engine**: Leaflet with React-Leaflet bindings
- **Drawing Modes**: Point, Circle, Polyline, Polygon, Ruler (measurement-only)
- **Object Editing**: Drag-to-move, vertex dragging for reshaping, radius adjustment for circles
- **Measurement**: Real-time distance/area calculations during drawing and editing
- **Styling**: Tailwind CSS with Lucide React icons
- **Import/Export**: 
  - Export: JSON serialization of layers and objects
  - Import: KML/KMZ parsing using @tmcw/togeojson and JSZip
- **Testing**: Vitest with React Testing Library, Leaflet mocked for DOM environment

## 📝 File Conventions

**Component Props**: Destructured in function signature with clear typing
**State Updates**: Optimistic UI updates followed by Firebase persistence
**Event Handlers**: Separated from JSX for readability (useCallback where appropriate)
**Firebase Operations**: Batched writes for large imports (450 operations/batch)
**Leaflet Workarounds**: Custom icons and refs for direct DOM manipulation when needed

## 🧪 Testing Approach

**Test Files**: Located in `test/` mirroring src structure
**Mocking**: 
- Leaflet mocked in setupTests.ts due to Canvas/JSDOM limitations
- ResizeObserver polyfilled for component compatibility
**Testing Library**: Uses @testing-library/react with user-event simulation
**Assertions**: Vitest expect with Jest DOM matchers

## 🚦 Development Workflow

1. **Feature Development**:
   - Create/update components in src/components/
   - Add/update types in src/types.ts as needed
   - Implement Firebase operations in src/utils/firebase.ts
   - Add corresponding tests in test/

2. **State Changes**:
   - Prefer lifting state up to App.tsx for shared state
   - Use context or state lifting prop drilling for component communication
   - Local component state for UI-specific concerns (editing mode, temp drawing state)

3. **Persistence**:
   - All map object changes flow through Firebase update functions
   - Optimistic updates UI before awaiting Firebase response
   - Error handling with console logging (no UI error display in current implementation)

4. **Styling**:
   - Tailwind utility classes for styling
   - Consistent spacing (p-*, m-*, space-*) and sizing (text-*)
   - Interactive states: hover:, focus:, active: variants
   - Dark/light awareness through Tailwind's default behavior

## ⚠️ Important Notes

**Firebase Configuration**: Never commit .env file with real credentials
**Leaflet Interactivity**: Drawing mode disables map interactivity during creation
**Performance**: Vertex limits (VERTEX_LIMIT=100) prevent crashes on complex imports
**Migration**: Automatic legacy data migration runs on first load after update
**Testing**: Leaflet requires mocking due to browser API dependencies in JSDOM