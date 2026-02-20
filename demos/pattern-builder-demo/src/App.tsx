import { useState, useEffect } from 'react';
import { PatternBuilder } from '@parallax/pattern-builder';

function App() {
  const [savedYaml, setSavedYaml] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (savedYaml) {
      setShowToast(true);
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [savedYaml]);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <PatternBuilder
        showYamlPreview
        onSave={(yaml: string) => {
          setSavedYaml(yaml);
          console.log('Pattern saved:', yaml);
        }}
        onChange={() => {
          // Pattern changed
        }}
      />

      {showToast && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          padding: '12px 16px',
          backgroundColor: '#22c55e',
          color: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
        }}>
          Pattern saved successfully!
        </div>
      )}
    </div>
  );
}

export default App;
