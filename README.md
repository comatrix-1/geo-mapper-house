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
    *   🖼️ **Map Image**: Upload an image (≤10 MB, any image type) and place it on the map. Drag the move handle to translate it or drag a corner handle to resize it.
*   **Measurement**: Dedicated Ruler tool for measuring path distances without creating objects.
*   **Editing**: Select objects to move them, drag vertices to reshape polygons/lines, and adjust circle radius.
*   **Import/Export**:
    *   Import **KML/KMZ** files (e.g., from Google Earth).
    *   Save and Load full project state via **JSON**.
    *   Imported project objects keep their original download URL and ownership metadata. A user who imports another user's project can display the shared image URL but cannot delete the original owner's Storage file.
*   **Cloud Sync**: Sign in with Google to sync your maps across devices using **Firebase Auth** and **Firestore**.

## Tech Stack

*   **Frontend**: React 18, TypeScript, Vite
*   **Map Engine**: Leaflet, React-Leaflet
*   **Styling**: Tailwind CSS, Lucide React (Icons)
*   **Backend / Persistence**: Firebase Authentication, Firebase Firestore
*   **Storage**: Supabase Storage (map images)
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

### Cloud Storage

Map images are stored in **Supabase Storage** (bucket `map-images`), while user data and authentication stay on Firebase. Supabase Storage receives the Firebase ID token so its policies can restrict writes to the signed-in user's folder. The bucket must be public because map objects store stable public image URLs; uploads and deletes remain protected by Storage RLS.

1.  In Supabase **Authentication → Third-Party Auth**, add your Firebase project using the Firebase Project ID from `.env` (`VITE_FIREBASE_PROJECT_ID`).
2.  In Supabase **Storage**, create a **public** bucket named `map-images`; set its file size limit to 10 MB and allowed MIME types to `image/*`. Public URLs are used in saved map objects, so a private bucket would require signed URLs and URL refresh handling.
3.  In the Supabase SQL Editor, apply the following policies. They allow upload/upsert/delete only under `users/<Firebase UID>/...`; reads use the public bucket URL.

    ```sql
    create policy "map images: read own object metadata" on storage.objects
      for select to anon, authenticated
      using (
        bucket_id = 'map-images'
        and (storage.foldername(name))[1] = 'users'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      );

    create policy "map images: upload to own folder" on storage.objects
      for insert to anon, authenticated
      with check (
        bucket_id = 'map-images'
        and (storage.foldername(name))[1] = 'users'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      );

    create policy "map images: update own object" on storage.objects
      for update to anon, authenticated
      using (
        bucket_id = 'map-images'
        and (storage.foldername(name))[1] = 'users'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      with check (
        bucket_id = 'map-images'
        and (storage.foldername(name))[1] = 'users'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      );

    create policy "map images: delete own object" on storage.objects
      for delete to anon, authenticated
      using (
        bucket_id = 'map-images'
        and (storage.foldername(name))[1] = 'users'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      );
    ```

    `anon` is included because Firebase ID tokens do not necessarily contain Supabase's `role` claim. The policies still require a valid Firebase JWT and match its UID to the object path. The client also validates image type and size before upload; the bucket limits enforce them at the Storage service.

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
    *   Click an object in the list to focus it on the map (the zoom level is kept).
3.  **Editing**:
    *   Select the "Select" tool (Cursor icon).
    *   Click any object on the map to select it (the map view stays where it is).
    *   Click **Edit** in the popup to change the Title, Description, or specific properties (like Radius).
    *   Drag the object (or its white vertex handles) to move or reshape it.
4.  **Importing**:
    *   Click "Import KML" in the sidebar to load `.kml` or `.kmz` files.
    *   Preview and adjust the layer style before confirming.

## License

MIT
