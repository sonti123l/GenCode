export const sampleGraphData = {
  nodes: [
    { id: 0, type: 'file', path: 'src/App.tsx', language: 'tsx' },
    { id: 1, type: 'import', source: 'react', file: 'src/App.tsx' },
    { id: 46, type: 'function', name: 'App', file: 'src/App.tsx' },
    { id: 92, type: 'function', name: 'greet', file: 'src/App.tsx' },
    { id: 374, type: 'file', path: 'src/main.tsx', language: 'tsx' },
  ],
  edges: [
    { from: 0, to: 1, type: 'CONTAINS' },
    { from: 0, to: 46, type: 'CONTAINS' },
    { from: 0, to: 92, type: 'CONTAINS' },
    { from: 46, to: 'useState', type: 'CALLS', unresolved: true },
  ]
};