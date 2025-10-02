import React, { useState } from 'react';
import axios from 'axios';

const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

export default function App() {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState([]);
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResponse('');
    try {
      const form = new FormData();
      form.append('query', query);
      for (const file of files) form.append('files', file);
      const res = await axios.post(`${apiBase}/api/analyze`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResponse(res.data?.result || '');
    } catch (err) {
      setResponse(err?.response?.data?.error || err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>MedChatBot</h1>
        <p style={styles.subtitle}>Upload reports, scans, and prescriptions. Get evidence-linked differential support.</p>
        <form onSubmit={onSubmit} style={styles.form}>
          <textarea
            placeholder="Enter symptoms, history, or specific question"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={styles.textarea}
            rows={4}
          />
          <input
            type="file"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            style={styles.file}
            accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp,.gif,.webp,.txt"
          />
          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
        </form>
        <div style={styles.resultBox}>
          {response ? <pre style={styles.pre}>{response}</pre> : <em>No result yet.</em>}
        </div>
        <div style={styles.disclaimer}>
          <strong>Disclaimer:</strong> This tool provides decision support only. It does not offer medical advice. Always consult a licensed clinician.
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f6fbff 0%, #e8f4ff 100%)',
    color: '#0a2a43',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px'
  },
  container: {
    width: '100%',
    maxWidth: '960px',
    background: '#ffffff',
    border: '1px solid #d5e9ff',
    borderRadius: '12px',
    boxShadow: '0 6px 20px rgba(10,42,67,0.08)',
    padding: '24px'
  },
  title: {
    margin: 0,
    fontSize: '28px',
    color: '#0f4c81'
  },
  subtitle: {
    marginTop: '6px',
    marginBottom: '16px',
    color: '#3a6ea5'
  },
  form: {
    display: 'grid',
    gap: '12px'
  },
  textarea: {
    width: '100%',
    border: '1px solid #bcd9ff',
    borderRadius: '10px',
    padding: '12px',
    fontSize: '14px',
    outlineColor: '#75b4ff',
    background: '#f9fcff'
  },
  file: {
    border: '1px dashed #bcd9ff',
    borderRadius: '10px',
    padding: '10px',
    background: '#f6fbff'
  },
  button: {
    background: '#4da3ff',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    padding: '12px 16px',
    fontSize: '15px',
    cursor: 'pointer'
  },
  resultBox: {
    marginTop: '16px',
    background: '#f6fbff',
    border: '1px solid #d5e9ff',
    borderRadius: '12px',
    padding: '16px',
    minHeight: '160px',
    whiteSpace: 'pre-wrap'
  },
  pre: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.5
  },
  disclaimer: {
    marginTop: '12px',
    color: '#4a708b',
    fontSize: '12px'
  }
};

