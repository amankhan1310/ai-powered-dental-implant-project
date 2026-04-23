import "@/App.css";
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { UploadCloud, Scan, History, Download, Code, CheckCircle, XCircle, Activity, ExternalLink, Loader2, Copy } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function PdfExportButton({ predictionId }) {
  const [showFallback, setShowFallback] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pdfUrl = `${API}/prediction/${predictionId}/pdf`;

  const handleExport = async () => {
    setExporting(true);
    setShowFallback(false);

    try {
      // Strategy 1: Fetch blob and trigger download via anchor
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error('PDF fetch failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dental-report-${predictionId}.pdf`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      // Check if download actually started (heuristic: small delay)
      await new Promise(r => setTimeout(r, 1500));
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // If we're in a sandboxed iframe, the click was likely blocked silently.
      // Show fallback link after a brief pause so the user has an escape hatch.
      setShowFallback(true);
    } catch (err) {
      console.error('[PDF] Export failed:', err);
      setShowFallback(true);
    } finally {
      setExporting(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(pdfUrl).catch(() => {});
  };

  return (
    <div className="relative no-print">
      <Button
        onClick={handleExport}
        disabled={exporting}
        variant="secondary"
        className="bg-zinc-900 text-zinc-50 hover:bg-zinc-800 border border-zinc-800"
        data-testid="export-pdf-button"
      >
        {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
        {exporting ? 'Preparing...' : 'Export PDF'}
      </Button>

      {showFallback && (
        <div className="absolute right-0 top-12 z-50 w-80 bg-zinc-900 border border-zinc-700 rounded-md p-4 shadow-xl" data-testid="pdf-fallback-box">
          <p className="text-xs text-zinc-400 mb-3" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
            If the PDF didn't download automatically, use the direct link below:
          </p>
          <div className="flex gap-2">
            <a
              href={pdfUrl}
              className="flex-1 bg-zinc-50 text-zinc-950 hover:bg-zinc-200 h-9 px-3 rounded-md font-medium text-xs inline-flex items-center justify-center transition-colors"
              data-testid="pdf-direct-link"
            >
              <ExternalLink className="w-3 h-3 mr-1.5" />
              Open PDF
            </a>
            <Button
              onClick={copyLink}
              variant="secondary"
              size="sm"
              className="bg-zinc-800 text-zinc-50 hover:bg-zinc-700 border border-zinc-700 h-9 px-3"
              data-testid="pdf-copy-link"
            >
              <Copy className="w-3 h-3 mr-1.5" />
              Copy Link
            </Button>
          </div>
          <button
            onClick={() => setShowFallback(false)}
            className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-300 text-xs"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function Navigation() {
  return (
    <nav className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-zinc-50" />
            <h1 className="text-xl font-bold text-zinc-50 tracking-tight" style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}>
              DENTAL IMPLANT DETECTOR
            </h1>
          </Link>
          <div className="flex gap-2">
            <Link to="/">
              <Button variant="ghost" className="text-zinc-400 hover:text-zinc-50 hover:bg-zinc-900">
                <UploadCloud className="w-4 h-4 mr-2" />
                Upload
              </Button>
            </Link>
            <Link to="/history">
              <Button variant="ghost" className="text-zinc-400 hover:text-zinc-50 hover:bg-zinc-900">
                <History className="w-4 h-4 mr-2" />
                History
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

function UploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showDevView, setShowDevView] = useState(false);
  const navigate = useNavigate();

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
      setError(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setAnalyzing(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post(`${API}/upload-and-detect`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-6 py-12">
        {!result ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-950 border border-zinc-800 rounded-md p-6">
              <div className="mb-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">UPLOAD IMAGE</p>
                <h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}>
                  Select X-Ray
                </h2>
              </div>
              
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                data-testid="upload-input"
              />
              
              <label
                htmlFor="file-upload"
                className="border-2 border-dashed border-zinc-800 rounded-md p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:border-zinc-600 transition-colors hover:bg-zinc-900/50 mt-6"
                data-testid="upload-zone"
              >
                <UploadCloud className="w-12 h-12 text-zinc-600 mb-4" />
                <p className="text-zinc-400">Click to upload dental X-ray</p>
                <p className="text-xs text-zinc-600 mt-2">JPG, PNG, WEBP up to 20MB</p>
              </label>

              {error && (
                <div className="mt-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-md" data-testid="error-message">
                  <p className="text-rose-400 text-sm">{error}</p>
                </div>
              )}
            </div>

            {preview && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-md p-6">
                <div className="mb-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">PREVIEW</p>
                  <h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}>
                    Image Preview
                  </h2>
                </div>
                
                <div className="relative w-full rounded-md overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center mt-6" data-testid="image-preview">
                  <img src={preview} alt="Preview" className="w-full h-auto" />
                  {analyzing && (
                    <div className="absolute inset-0 bg-zinc-950/80 flex items-center justify-center">
                      <div className="text-center">
                        <Scan className="w-12 h-12 text-emerald-400 animate-pulse mx-auto mb-4" />
                        <p className="text-zinc-400">Analyzing...</p>
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="w-full mt-6 bg-zinc-50 text-zinc-950 hover:bg-zinc-200 h-12 rounded-md font-medium tracking-tight"
                  data-testid="analyze-button"
                >
                  <Scan className="w-4 h-4 mr-2" />
                  {analyzing ? 'Analyzing...' : 'Analyze Image'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6" id="result-container">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">ANALYSIS COMPLETE</p>
                <h2 className="text-4xl font-bold tracking-tighter" style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}>
                  Detection Results
                </h2>
              </div>
              <div className="flex gap-2">
                <PdfExportButton predictionId={result.id} />
                <Button
                  onClick={() => {
                    setSelectedFile(null);
                    setPreview(null);
                    setResult(null);
                  }}
                  variant="secondary"
                  className="bg-zinc-900 text-zinc-50 hover:bg-zinc-800 border border-zinc-800 no-print"
                  data-testid="new-scan-button"
                >
                  New Scan
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8">
                <div className="bg-zinc-950 border border-zinc-800 rounded-md p-6">
                  <img
                    src={`${BACKEND_URL}${result.image_url}`}
                    alt="Analyzed"
                    className="w-full h-auto rounded-md"
                    data-testid="result-image"
                  />
                </div>
              </div>

              <div className="lg:col-span-4 space-y-6">
                <div
                  className={`p-6 rounded-md border ${
                    result.implant_detected
                      ? 'bg-emerald-500/10 border-emerald-500/20'
                      : 'bg-rose-500/10 border-rose-500/20'
                  }`}
                  data-testid="detection-status"
                >
                  <div className="flex items-center gap-3 mb-4">
                    {result.implant_detected ? (
                      <CheckCircle className="w-8 h-8 text-emerald-400" />
                    ) : (
                      <XCircle className="w-8 h-8 text-rose-400" />
                    )}
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">STATUS</p>
                      <p
                        className={`text-xl font-bold tracking-tight ${
                          result.implant_detected ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                        style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}
                      >
                        {result.implant_detected ? 'IMPLANT DETECTED' : 'NO IMPLANT DETECTED'}
                      </p>
                    </div>
                  </div>

                  {result.confidence && (
                    <div>
                      <div className="flex justify-between mb-2">
                        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">CONFIDENCE</p>
                        <p className="text-sm font-bold text-zinc-50" data-testid="confidence-value">
                          {(result.confidence * 100).toFixed(1)}%
                        </p>
                      </div>
                      <Progress value={result.confidence * 100} className="h-2" data-testid="confidence-bar" />
                    </div>
                  )}
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-md p-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">METADATA</p>
                  <div className="space-y-2 text-sm" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Filename:</span>
                      <span className="text-zinc-50">{result.original_filename}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Date:</span>
                      <span className="text-zinc-50">{new Date(result.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Detections:</span>
                      <span className="text-zinc-50">{result.detections.length}</span>
                    </div>
                  </div>
                </div>

                <Collapsible open={showDevView} onOpenChange={setShowDevView}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="secondary"
                      className="w-full bg-zinc-900 text-zinc-50 hover:bg-zinc-800 border border-zinc-800"
                      data-testid="toggle-dev-view"
                    >
                      <Code className="w-4 h-4 mr-2" />
                      {showDevView ? 'Hide' : 'Show'} Raw JSON
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div
                      className="mt-4 bg-zinc-950 border border-zinc-800 rounded-md p-4 overflow-auto max-h-96"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      data-testid="raw-json"
                    >
                      <pre className="text-xs text-emerald-400/90">
                        {JSON.stringify(result.raw_response, null, 2)}
                      </pre>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const response = await axios.get(`${API}/history`);
      setHistory(response.data);
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">ANALYSIS RECORDS</p>
          <h2 className="text-4xl font-bold tracking-tighter" style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}>
            Detection History
          </h2>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-zinc-500">Loading history...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="bg-zinc-950 border border-zinc-800 rounded-md p-12 text-center" data-testid="empty-history">
            <History className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-500">No analysis history yet</p>
          </div>
        ) : (
          <div className="bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden" data-testid="history-table">
            <table className="w-full" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
              <thead className="bg-zinc-900 border-b border-zinc-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.2em] text-zinc-500">Date</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.2em] text-zinc-500">Filename</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.2em] text-zinc-500">Result</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.2em] text-zinc-500">Confidence</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.2em] text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item, idx) => (
                  <tr key={item.id} className="border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors" data-testid={`history-row-${idx}`}>
                    <td className="px-6 py-4 text-sm text-zinc-400">
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-50">{item.original_filename}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                          item.implant_detected
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {item.implant_detected ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {item.implant_detected ? 'Detected' : 'Not Detected'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-50">
                      {item.confidence ? `${(item.confidence * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <Link to={`/result/${item.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"
                          data-testid={`view-result-${idx}`}
                        >
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultDetailPage() {
  const { id } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDevView, setShowDevView] = useState(false);

  useEffect(() => {
    loadResult();
  }, [id]);

  const loadResult = async () => {
    try {
      const response = await axios.get(`${API}/prediction/${id}`);
      setResult(response.data);
    } catch (err) {
      console.error('Failed to load result', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-6 py-12 text-center">
          <p className="text-zinc-500">Loading result...</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-6 py-12 text-center">
          <p className="text-rose-400">Result not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">SAVED ANALYSIS</p>
              <h2 className="text-4xl font-bold tracking-tighter" style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}>
                Detection Results
              </h2>
            </div>
            <PdfExportButton predictionId={result.id} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <div className="bg-zinc-950 border border-zinc-800 rounded-md p-6">
                <img
                  src={`${BACKEND_URL}${result.image_url}`}
                  alt="Analyzed"
                  className="w-full h-auto rounded-md"
                />
              </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <div
                className={`p-6 rounded-md border ${
                  result.implant_detected
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-rose-500/10 border-rose-500/20'
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  {result.implant_detected ? (
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  ) : (
                    <XCircle className="w-8 h-8 text-rose-400" />
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">STATUS</p>
                    <p
                      className={`text-xl font-bold tracking-tight ${
                        result.implant_detected ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                      style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}
                    >
                      {result.implant_detected ? 'IMPLANT DETECTED' : 'NO IMPLANT DETECTED'}
                    </p>
                  </div>
                </div>

                {result.confidence && (
                  <div>
                    <div className="flex justify-between mb-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">CONFIDENCE</p>
                      <p className="text-sm font-bold text-zinc-50">
                        {(result.confidence * 100).toFixed(1)}%
                      </p>
                    </div>
                    <Progress value={result.confidence * 100} className="h-2" />
                  </div>
                )}
              </div>

              <div className="bg-zinc-950 border border-zinc-800 rounded-md p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">METADATA</p>
                <div className="space-y-2 text-sm" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Filename:</span>
                    <span className="text-zinc-50">{result.original_filename}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Date:</span>
                    <span className="text-zinc-50">{new Date(result.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Detections:</span>
                    <span className="text-zinc-50">{result.detections.length}</span>
                  </div>
                </div>
              </div>

              <Collapsible open={showDevView} onOpenChange={setShowDevView}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="secondary"
                    className="w-full bg-zinc-900 text-zinc-50 hover:bg-zinc-800 border border-zinc-800"
                  >
                    <Code className="w-4 h-4 mr-2" />
                    {showDevView ? 'Hide' : 'Show'} Raw JSON
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div
                    className="mt-4 bg-zinc-950 border border-zinc-800 rounded-md p-4 overflow-auto max-h-96"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    <pre className="text-xs text-emerald-400/90">
                      {JSON.stringify(result.raw_response, null, 2)}
                    </pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/result/:id" element={<ResultDetailPage />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;