**Component Props**: Destructured in function signature with clear typing
**State Updates**: Optimistic UI updates followed by Firebase persistence
**Event Handlers**: Separated from JSX for readability (useCallback where appropriate)
**Firebase Operations**: Batched writes for large imports (450 operations/batch)
**Leaflet Workarounds**: Custom icons and refs for direct DOM manipulation when needed