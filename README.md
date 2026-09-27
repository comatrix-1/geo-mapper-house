# GeoLayer Mapper

A feature-rich, layered map application built with React, TypeScript, and Leaflet. This tool allows users to draw, organize, and manage geographic shapes (Points, Circles, Polylines, Polygons) with measurement tools and cloud synchronization.

![App Screenshot](https://via.placeholder.com/800x450?text=GeoLayer+Mapper+Preview)

## Features

*   **Multi-Layer Management**: Organize your data into toggleable layers. Customize layer colors, borders, and opacity.
*   **Drawing Tools**:
    *   📍 **Point**: Drop markers with coordinates.
    *   ⭕ **Circle**: Draw circles with real-time radius measurement.
    *   📏 **Line**: Draw paths and measure distances.
    *   ⬡ **Polygon**: Draw areas and calculate square meters/kilometers.
*   **Measurement**: Dedicated Ruler tool for measuring path distances without creating objects.
*   **Editing**: Select objects to move them, drag vertices to reshape polygons/lines, and adjust circle radius.
*   **Import/Export**:
    *   Import **KML/KMZ** files (e.g., from Google Earth).
    *   Save and Load full project state via **JSON**.
*   **Cloud Sync**: Sign in with Google to sync your maps across devices using **Firebase Auth** and **Firestore**.

## Tech Stack

*   **Frontend**: React 18, TypeScript, Vite
*   **Map Engine**: Leaflet, React-Leaflet
*   **Styling**: Tailwind CSS, Lucide React (Icons)
*   **Backend / Persistence**: Firebase Authentication, Firebase Firestore
*   **Utilities**: JSZip (KMZ support), @tmcw/togeojson (KML parsing)
*   **Testing**: Vitest, React Testing Library

## Prerequisites

*   Node.js (v18 or higher)
*   npm
*   A Google Firebase account

## Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/geo-mapper.git
    cd geo-mapper
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

## Configuration (Firebase)

To use Authentication and Cloud Storage, you must set up a Firebase Project.

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Create a new project.
3.  **Authentication**: Enable **Google** sign-in provider.
    *   Go to *Authentication > Settings > Authorized Domains*.
    *   Add `localhost` and your production domain.
4.  **Firestore**: Create a database (start in **Test Mode** for development, or set up security rules).
5.  **Get Config**:
    *   Go to Project Settings.
    *   Register a "Web App".
    *   Copy the `firebaseConfig` object.
6.  **Update Code**:
    *   Copy `.env.example` to `.env`, inserting the values from the Firebase config.

> **Note**: If you see a "Domain Not Authorized" error during login, ensure your current browser URL (e.g., `127.0.0.1` or `localhost`) is added to the Authorized Domains list in the Firebase Console.

## Usage

### Running Locally
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building for Production
```bash
npm run build
```
The output will be in the `dist/` folder.

### Running Tests
```bash
npm run test
```

## How to Use

1.  **Toolbar** (Top Center): Select a tool (Point, Circle, Line, Polygon) to start drawing.
2.  **Layers Sidebar** (Left):
    *   Click "Add Layer" to organize new objects.
    *   Click the **Gear Icon** next to a layer to change its color/style.
    *   Expand a layer to see the list of objects inside.
    *   Click an object in the list to fly to it on the map.
3.  **Editing**:
    *   Select the "Select" tool (Cursor icon).
    *   Click any object on the map to open its popup.
    *   Click **Edit** in the popup to change the Title, Description, or specific properties (like Radius).
    *   Drag the object (or its white vertex handles) to move or reshape it.
4.  **Importing**:
    *   Click "Import KML" in the sidebar to load `.kml` or `.kmz` files.
    *   Preview and adjust the layer style before confirming.

## License

MIT
