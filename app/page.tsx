'use client';

import { useState, useEffect, useRef } from 'react';
import { Creator, VideoFile } from '@/types';
import ThotLogo from '@/components/ThotLogo';
import CircularProgress from '@/components/CircularProgress';

export default function Home() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<{[key: string]: {loaded: number, total: number, percentage: number}}>({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [mounted, setMounted] = useState(false);
  const [newItems, setNewItems] = useState<{ creators: Set<string>, files: Set<string> }>({
    creators: new Set(),
    files: new Set(),
  });
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [addingUrl, setAddingUrl] = useState(false);
  const [urlForm, setUrlForm] = useState({
    url: ''
  });
  const scrollRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    fetchCreators();
  }, []);

  useEffect(() => {
    // Polling automatique toutes les 10 secondes
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchCreators(true); // true = silent update
      }, 10000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh]);

  const fetchCreators = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      const response = await fetch('/api/creators');
      if (!response.ok) {
        throw new Error('Failed to fetch creators');
      }
      const data = await response.json();
      const newCreators = data.creators || [];
      
      // Détecter les nouveaux créateurs et fichiers
      if (creators.length > 0) {
        const newCreatorsSet = new Set<string>();
        const newFilesSet = new Set<string>();
        
        // Comparer les créateurs
        newCreators.forEach((newCreator: Creator) => {
          const oldCreator = creators.find(c => c.folderName === newCreator.folderName);
          if (!oldCreator) {
            // Nouveau créateur
            newCreatorsSet.add(newCreator.folderName);
          } else {
            // Comparer les fichiers
            const oldFilePaths = new Set(oldCreator.files.map(f => f.path));
            newCreator.files.forEach((newFile: VideoFile) => {
              if (!oldFilePaths.has(newFile.path)) {
                // Nouveau fichier
                newFilesSet.add(newFile.path);
              }
            });
          }
        });
        
        if (newCreatorsSet.size > 0 || newFilesSet.size > 0) {
          setNewItems({
            creators: newCreatorsSet,
            files: newFilesSet,
          });
          
          // Effacer les indicateurs après 5 secondes
          setTimeout(() => {
            setNewItems({ creators: new Set(), files: new Set() });
          }, 5000);
        }
      }
      
      setCreators(newCreators);
      setLastUpdate(new Date());
    } catch (err: any) {
      if (!silent) {
        setError(err.message || 'An error occurred');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const scroll = (direction: 'left' | 'right', folderName: string) => {
    const container = scrollRefs.current[folderName];
    if (container) {
      const scrollAmount = 400;
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const downloadFile = async (file: VideoFile) => {
    const startTime = Date.now();

    try {
      setDownloading(prev => new Set(prev).add(file.path));

      // Dynamic timeout based on file size (5 minutes per GB, max 30 minutes)
      const fileSizeGB = file.size ? file.size / 1024 / 1024 / 1024 : 0;
      const timeoutMs = Math.min(1800000, Math.max(300000, fileSizeGB * 300000)); // 5min to 30min

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      console.log(`Starting download: ${file.name} (${fileSizeGB.toFixed(2)}GB, timeout: ${timeoutMs/1000}s)`);

      const response = await fetch(`/api/download?path=${encodeURIComponent(file.path)}`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Download failed with status ${response.status}`);
      }

      // If server returned JSON (error), throw
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Download failed');
      }

      // Prepare streaming download to report real progress
      const reader = response.body?.getReader();
      if (!reader) {
        // Fallback to blob if streaming not supported
        const blobFallback = await response.blob();
        if (blobFallback.size === 0) throw new Error('Downloaded file is empty');
        const url = window.URL.createObjectURL(blobFallback);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name.replace(/\.ts$/, '.mp4');
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { window.URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
        setDownloadProgress(prev => ({
          ...prev,
          [file.path]: { loaded: blobFallback.size, total: blobFallback.size, percentage: 100 }
        }));
        return;
      }

      // Determine total size from headers or fallback to known file size
      const contentLengthHeader = response.headers.get('content-length');
      const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : (file.size || 0);

      setDownloadProgress(prev => ({
        ...prev,
        [file.path]: { loaded: 0, total: totalBytes, percentage: 0 }
      }));

      const chunks: BlobPart[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;

          const percent = totalBytes > 0 ? Math.round((received / totalBytes) * 100) : Math.min(99, Math.round((received / (file.size || (received + 1))) * 100));

          setDownloadProgress(prev => ({
            ...prev,
            [file.path]: { loaded: received, total: totalBytes, percentage: percent }
          }));
        }
      }

      const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
      if (blob.size === 0) throw new Error('Downloaded file is empty');

      // Final progress update
      setDownloadProgress(prev => ({
        ...prev,
        [file.path]: { loaded: blob.size, total: blob.size || totalBytes, percentage: 100 }
      }));

      // Trigger browser download via anchor click (appears in Downloads)
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace(/\.ts$/, '.mp4');
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { window.URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);

      const downloadSize = (blob.size / 1024 / 1024).toFixed(2);
      const downloadTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Successfully downloaded: ${file.name} (${downloadSize}MB in ${downloadTime}s)`);
    } catch (err: any) {
      let errorMessage = 'Error downloading file';
      if (err.name === 'AbortError') {
        errorMessage = 'Download timeout - please try again';
      } else if (err.message) {
        errorMessage = err.message;
      }
      alert(errorMessage);
      console.error('Download error:', err);
    } finally {
      setDownloading(prev => {
        const newSet = new Set(prev);
        newSet.delete(file.path);
        return newSet;
      });

      // Clean up progress after a short delay so user sees 100%
      setTimeout(() => {
        setDownloadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[file.path];
          return newProgress;
        });
      }, 2000);
    }
  };

  const addNewUrl = async () => {
    try {
      setAddingUrl(true);
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(urlForm),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add URL');
      }

      const result = await response.json();
      alert('URL ajoutée avec succès!');
      setUrlForm({ url: '' });
      setShowAddUrl(false);
      
      // Refresh creators list to show new ones
      fetchCreators();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    } finally {
      setAddingUrl(false);
    }
  };

  const extractUsernameFromUrl = (url: string) => {
    const match = url.match(/tiktok\.com\/@([^\/]+)/);
    return match ? match[1] : '';
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const getInitials = (name: string) => {
    return name
      .split(/[\s_-]/)
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen text-white relative overflow-hidden">
      {/* Arrière-plan du temple de Thot */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-[#1a1a1a] to-[#0a0a0a]"></div>
        {/* Colonnes du temple */}
        <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="templeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#d4af37" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#8b6914" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#d4af37" stopOpacity="0.1" />
            </linearGradient>
            <pattern id="templePattern" x="0" y="0" width="200" height="400" patternUnits="userSpaceOnUse">
              {/* Colonne gauche */}
              <rect x="0" y="0" width="30" height="400" fill="url(#templeGradient)" opacity="0.3" />
              <rect x="5" y="0" width="20" height="400" fill="none" stroke="#d4af37" strokeWidth="1" opacity="0.2" />
              {/* Hiéroglyphes stylisés */}
              <circle cx="15" cy="50" r="3" fill="#d4af37" opacity="0.2" />
              <circle cx="15" cy="100" r="3" fill="#d4af37" opacity="0.2" />
              <circle cx="15" cy="150" r="3" fill="#d4af37" opacity="0.2" />
              {/* Colonne droite */}
              <rect x="170" y="0" width="30" height="400" fill="url(#templeGradient)" opacity="0.3" />
              <rect x="175" y="0" width="20" height="400" fill="none" stroke="#d4af37" strokeWidth="1" opacity="0.2" />
              <circle cx="185" cy="50" r="3" fill="#d4af37" opacity="0.2" />
              <circle cx="185" cy="100" r="3" fill="#d4af37" opacity="0.2" />
              <circle cx="185" cy="150" r="3" fill="#d4af37" opacity="0.2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#templePattern)" />
          {/* Lignes horizontales (plafond/sol) */}
          <line x1="0" y1="100" x2="1200" y2="100" stroke="#d4af37" strokeWidth="2" opacity="0.15" />
          <line x1="0" y1="700" x2="1200" y2="700" stroke="#d4af37" strokeWidth="2" opacity="0.15" />
        </svg>
        {/* Overlay sombre pour le contraste */}
        <div className="absolute inset-0 bg-black/40"></div>
      </div>

      {/* Header avec logo Thot */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/90 via-black/70 to-transparent backdrop-blur-md border-b border-[#d4af37]/20">
        <div className="container mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <ThotLogo className="w-12 h-12" />
              <div className="absolute inset-0 bg-[#d4af37]/20 blur-xl -z-10"></div>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#d4af37] to-[#f4d03f] bg-clip-text text-transparent">
              Thot
            </h1>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowAddUrl(!showAddUrl)}
                className="px-4 py-2 bg-[#d4af37]/20 hover:bg-[#d4af37]/30 text-[#d4af37] rounded transition-colors text-sm font-medium"
              >
                Ajouter une URL
              </button>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-2 rounded transition-colors text-sm flex items-center space-x-2 ${
                  autoRefresh 
                    ? 'bg-[#d4af37]/20 hover:bg-[#d4af37]/30 text-[#d4af37]' 
                    : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-[#d4af37] animate-pulse' : 'bg-gray-400'}`}></div>
                <span>{autoRefresh ? 'Temps réel' : 'Manuel'}</span>
              </button>
              <button
                onClick={() => fetchCreators(false)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded transition-colors text-sm"
              >
                Actualiser
              </button>
            </div>
            {autoRefresh && mounted && (
              <div className="text-xs text-white/60">
                Dernière mise à jour: {lastUpdate.toLocaleTimeString('fr-FR')}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* URL Addition Form */}
      {showAddUrl && (
        <div className="fixed top-20 right-8 z-40 w-96 bg-black/90 backdrop-blur-md border border-[#d4af37]/30 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 text-[#d4af37]">Ajouter une nouvelle URL TikTok</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-white/80">URL TikTok Live</label>
              <input
                type="url"
                value={urlForm.url}
                onChange={(e) => setUrlForm({...urlForm, url: e.target.value})}
                placeholder="https://www.tiktok.com/@username/live"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-[#d4af37]"
              />
            </div>
          </div>
          
          <div className="flex space-x-3 mt-6">
            <button
              onClick={addNewUrl}
              disabled={addingUrl || !urlForm.url}
              className="flex-1 py-2 bg-[#d4af37] hover:bg-[#d4af37]/80 text-black font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addingUrl ? 'Ajout en cours...' : 'Ajouter'}
            </button>
            <button
              onClick={() => {
                setShowAddUrl(false);
                setUrlForm({ url: '' });
              }}
              className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded transition-colors"
            >
              Annuler
            </button>
          </div>
          
          <div className="mt-4 text-xs text-white/60">
            Format: URL,Animateur: Nom_Affiché-identifiant (généré automatiquement)
          </div>
        </div>
      )}

      <main className="pt-24 pb-16 relative z-10">
        {loading && (
          <div className="flex justify-center items-center min-h-[60vh]">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-[#d4af37] border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 bg-[#d4af37]/20 blur-xl"></div>
            </div>
          </div>
        )}

        {error && (
          <div className="container mx-auto px-8 mb-8">
            <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-6 backdrop-blur-sm">
              <p className="text-red-300 mb-4">{error}</p>
              <button
                onClick={() => fetchCreators()}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors font-medium"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        {!loading && !error && creators.length === 0 && (
          <div className="container mx-auto px-8">
            <div className="bg-white/5 rounded-lg p-12 text-center">
              <p className="text-gray-400 text-lg">Aucun créateur trouvé</p>
            </div>
          </div>
        )}

        {/* Netflix-style rows */}
        <div className="space-y-12">
          {creators.map((creator, creatorIndex) => (
            <div key={creator.folderName} className="relative group">
              <div className="container mx-auto px-8">
                <h2 className="text-xl font-semibold mb-4 text-white/90 flex items-center space-x-2">
                  <span>{creator.name}</span>
                  {newItems.creators.has(creator.folderName) && (
                    <span className="px-2 py-0.5 bg-[#d4af37] text-black text-xs font-bold rounded animate-pulse">
                      NOUVEAU
                    </span>
                  )}
                  <span className="ml-3 text-sm text-white/60 font-normal">
                    ({creator.files.length} {creator.files.length > 1 ? 'fichiers' : 'fichier'})
                  </span>
                </h2>
              </div>

              {creator.files.length > 0 && (
                <div className="relative">
                  {/* Left scroll button */}
                  <button
                    onClick={() => scroll('left', creator.folderName)}
                    className="absolute left-0 top-0 bottom-0 z-10 w-16 bg-gradient-to-r from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-black/60"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  {/* Scrollable container */}
                  <div
                    ref={(el) => {
                      scrollRefs.current[creator.folderName] = el;
                    }}
                    className="flex space-x-4 overflow-x-auto scrollbar-hide px-8 scroll-smooth"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {creator.files.map((file, index) => (
                      <div
                        key={index}
                        className="flex-shrink-0 w-64 group/item relative"
                      >
                        <div className={`relative rounded-lg overflow-hidden hover:scale-105 transition-transform duration-300 cursor-pointer ${
                          newItems.files.has(file.path) 
                            ? 'bg-[#d4af37]/20 ring-2 ring-[#d4af37] animate-pulse' 
                            : 'bg-white/5'
                        }`}>
                          {newItems.files.has(file.path) && (
                            <div className="absolute top-2 right-2 z-20 px-2 py-1 bg-[#d4af37] text-black text-xs font-bold rounded">
                              NOUVEAU
                            </div>
                          )}
                          {/* Thumbnail placeholder */}
                          <div className="relative h-36 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                            <div className="relative z-10">
                              {/* Circular progress indicator around profile */}
                              {(() => {
                                const creatorFilesDownloading = creator.files.filter(file => downloading.has(file.path));
                                if (creatorFilesDownloading.length > 0) {
                                  const progress = downloadProgress[creatorFilesDownloading[0].path] || { percentage: 0 };
                                  return (
                                    <div className="absolute -inset-2 flex items-center justify-center">
                                      <CircularProgress 
                                        percentage={progress.percentage} 
                                        size={96} 
                                        strokeWidth={4}
                                      />
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                              
                              <div className="relative z-10 w-20 h-20 rounded-full bg-gradient-to-br from-[#d4af37] to-[#8b6914] flex items-center justify-center text-2xl font-bold text-black/80">
                                {getInitials(creator.name)}
                              </div>
                            </div>
                            {/* Play icon overlay on hover */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                                <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          </div>

                          {/* File info */}
                          <div className="p-4">
                            <h3 className="font-semibold text-sm mb-2 line-clamp-2 text-white/90">
                              {file.name.replace(/\.ts$/, '').replace(/_/g, ' ')}
                            </h3>
                            <div className="flex items-center justify-between text-xs text-white/60 mb-3">
                              <span>{formatFileSize(file.size)}</span>
                              {file.date && <span>{formatDate(file.date)}</span>}
                            </div>
                            <button
                              onClick={() => downloadFile(file)}
                              disabled={downloading.has(file.path)}
                              className="w-full py-2 bg-white/10 hover:bg-white/20 rounded font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                            >
                              {downloading.has(file.path) ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                  <span>Téléchargement...</span>
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                  <span>Télécharger</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Right scroll button */}
                  <button
                    onClick={() => scroll('right', creator.folderName)}
                    className="absolute right-0 top-0 bottom-0 z-10 w-16 bg-gradient-to-l from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-black/60"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

