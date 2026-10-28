"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import Footer from '@/components/sections/Footer';
import Background from "@/components/background";
import DownloadProgressComponent from "@/components/DownloadProgress";
import { FolderOpen, FileSpreadsheet, FileText, Minus, Square, X, Info as InfoIcon, Palette, ArrowDownToLine, ListMusic, PictureInPicture2 } from "lucide-react";
import Personalize from '@/components/sections/Personalize';
import DownloadButton from '@/components/DownloadButton';
import StatusMessage from '@/components/StatusMessage';
import PlayerSection from '@/components/player/PlayerSection';
import MiniView from '@/components/player/MiniView';
import Info from '@/components/sections/Info';
import type { DownloadProgress, DownloadResult, DownloadStatus } from '@/types/electron';

const defaultProgress = (overrides?: Partial<DownloadProgress>): DownloadProgress => ({
    percentage: 0,
    downloaded: 0,
    total: 0,
    speed: 0,
    speed_str: '0 B/s',
    eta: 0,
    status: 'ready',
    message: '',
    _percent_str: '0%',
    _speed_str: '0 B/s',
    _eta_str: '--:--',
    downloaded_bytes: 0,
    total_bytes: 0,
    currentItem: 0,
    totalItems: 0,
    currentFile: '',
    isPlaylist: false,
    filename: '',
    speed_raw: 0,
    timestamp: Date.now(),
    ...overrides
});

function hasPlaylistParams(str: string): boolean {
    try {
        const urlObj = new URL(str);
        return urlObj.searchParams.has('list') || urlObj.pathname.includes('/playlist');
    } catch {
        return false;
    }
}

export default function Home() {
    const [url, setUrl] = useState("");
    const [outputFolder, setOutputFolder] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [quality, setQuality] = useState("320");
    const [format, setFormat] = useState('mp3');
    const [fps, setFps] = useState<number | null>(null);
    const skipExisting = true;
    const timeout = 300;
    const [showPersonalize, setShowPersonalize] = useState(false);
    const [showInfo, setShowInfo] = useState(false);

    // Server and client must render the same first paint: reading
    // localStorage in a useState initializer caused a hydration mismatch
    // ("This won't be patched up"), which froze tab/color updates. Defaults
    // are rendered, the saved values are applied after mount instead.
    const DEFAULT_COLORS = { lineColor: '#50C878', backgroundColor: '#000000' };
    const [colors, setColors] = useState(DEFAULT_COLORS);
    const colorsLoaded = useRef(false);

    // Apply saved colors once, right after hydration.
    useEffect(() => {
        try {
            const savedColors = localStorage.getItem('waveColors_v2');
            if (savedColors) {
                const parsed = JSON.parse(savedColors) as { lineColor?: unknown; backgroundColor?: unknown };
                if (parsed && typeof parsed.lineColor === 'string') {
                    setColors({
                        lineColor: parsed.lineColor,
                        backgroundColor: typeof parsed.backgroundColor === 'string' ? parsed.backgroundColor : '#000000'
                    });
                }
            }
        } catch {
            // keep defaults
        } finally {
            colorsLoaded.current = true;
        }
    }, []);

    // Save colors to localStorage whenever they change (after the load above).
    useEffect(() => {
        if (!colorsLoaded.current) return;
        try {
            localStorage.setItem('waveColors_v2', JSON.stringify(colors));
        } catch {
            // session-only
        }
    }, [colors]);

    const [progress, setProgress] = useState<DownloadProgress>(defaultProgress());

    const [processPlaylist, setProcessPlaylist] = useState(false);
    const [isPlaylist, setIsPlaylist] = useState(false);
    const [tab, setTab] = useState<'download' | 'library'>('download');
    // Restore the last tab after hydration (deterministic first paint).
    useEffect(() => {
        try {
            if (localStorage.getItem('audit-tab') === 'library') setTab('library');
        } catch {
            // keep download
        }
    }, []);
    // Seamless download -> library: set on success, consumed by PlayerSection
    // (auto-scan + queue of fresh files, optional autoplay).
    const [harvest, setHarvest] = useState<{ since: number; autoplay: boolean } | null>(null);
    const clearHarvest = useCallback(() => setHarvest(null), []);
    const downloadRef = useRef<HTMLDivElement | null>(null);
    const libraryRef = useRef<HTMLDivElement | null>(null);
    const switchTab = (t: 'download' | 'library') => {
        if (t === tab) return;
        setTab(t);
        try {
            localStorage.setItem('audit-tab', t);
        } catch {
            // session-only
        }
        // Animate the incoming section (same curve as the player views).
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const el = t === 'download' ? downloadRef.current : libraryRef.current;
                el?.animate(
                    [
                        { opacity: 0, transform: 'translateY(-10px) scale(0.99)' },
                        { opacity: 1, transform: 'none' },
                    ],
                    { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
                );
            });
        });
    };
    const [isMini, setIsMini] = useState(false);
    const [miniOpen, setMiniOpen] = useState(false);

    // Track whether the floating mini player is on screen (toggle button state).
    useEffect(() => {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        api?.onMiniState?.((open) => setMiniOpen(open));
        api?.queryMini?.();
    }, []);

    // Floating mini-player window shows ONLY the player. The packaged renderer
    // is served from app:// without a hash, so the preload-provided
    // `isMiniWindow` flag is the source of truth; hash and IPC stay as fallbacks.
    useEffect(() => {
        if (typeof window !== 'undefined') {
            if (window.electronAPI?.isMiniWindow) {
                setIsMini(true);
                return;
            }
            if (window.location.hash === '#mini') {
                setIsMini(true);
                return;
            }
            if (window.electronAPI?.onMiniMode) {
                window.electronAPI.onMiniMode(() => setIsMini(true));
            }
        }
    }, []);

    // Esc closes the style popover (Info handles its own Esc).
    useEffect(() => {
        if (!showPersonalize) return;
        const close = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowPersonalize(false);
        };
        document.addEventListener('keydown', close);
        return () => document.removeEventListener('keydown', close);
    }, [showPersonalize]);

    // File input refs
    const csvInputRef = useRef<HTMLInputElement>(null);
    const txtInputRef = useRef<HTMLInputElement>(null);

    // Cancellation ref
    const isCancelled = useRef(false);

    // Reset to ready state after 3 seconds of completion (single files and playlists)
    useEffect(() => {
        if (progress.status === 'finished' || progress.status === 'error') {
            const timer = setTimeout(() => {
                setProgress(defaultProgress());

                // Reset form state
                setUrl('');
                setResult(null);
                setError(null);
                setLoading(false);
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [progress.status, progress.isPlaylist]);

    // Register progress listener from Python script
    useEffect(() => {
        if (typeof window !== 'undefined' && window.electronAPI?.onDownloadProgress) {
            const handleProgress = (_event: unknown, data: Partial<DownloadProgress> & Record<string, unknown>) => {
                try {
                    console.log('[Frontend] Progress received:', data);

                    // Extract and calculate values
                    const percentage = typeof data.percentage === 'number' ? data.percentage :
                        (data._percent_str ? parseFloat(String(data._percent_str).replace(/[^\d.]/g, '')) || 0 : 0);

                    const downloaded = Number(data.downloaded_bytes || data.downloaded || 0);
                    const total = Number(data.total_bytes || data.total || 0);

                    // Calculate speed
                    let speed = 0;
                    const speed_str = String(data.speed_str || data._speed_str || '0 B/s');
                    if (typeof data.speed === 'number') {
                        speed = data.speed;
                    } else if (data._speed_str) {
                        const speedMatch = String(data._speed_str).match(/([\d.]+)\s*([KMG]?B)\/s/);
                        if (speedMatch) {
                            const value = parseFloat(speedMatch[1]);
                            const unit = speedMatch[2];
                            const multiplier =
                                unit === 'KB' ? 1024 :
                                    unit === 'MB' ? 1024 * 1024 :
                                        unit === 'GB' ? 1024 * 1024 * 1024 : 1;
                            speed = value * multiplier;
                        }
                    }

                    // Parse ETA
                    let eta = 0;
                    if (typeof data.eta === 'number') {
                        eta = data.eta;
                    } else if (data._eta_str && data._eta_str !== '--:--') {
                        const parts = String(data._eta_str).split(':').map(Number);
                        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                            eta = (parts[0] * 60) + parts[1];
                        }
                    }

                    // Map Python playlist fields to frontend fields
                    const currentItem = typeof data.currentItem === 'number' ? data.currentItem :
                        typeof data.playlist_index === 'number' ? data.playlist_index : 0;

                    const totalItems = typeof data.totalItems === 'number' ? data.totalItems :
                        typeof data.playlist_count === 'number' ? data.playlist_count : 0;

                    const playlistName = typeof data.playlist_name === 'string' ? data.playlist_name :
                        typeof data.playlistName === 'string' ? data.playlistName : undefined;

                    // Build the normalized progress object
                    const newProgress: DownloadProgress = {
                        percentage: Math.min(100, Math.max(0, percentage)),
                        downloaded,
                        total,
                        speed,
                        speed_str: typeof data.speed_str === 'string' ? data.speed_str :
                            typeof data._speed_str === 'string' ? data._speed_str : '0 B/s',
                        eta,
                        status: (typeof data.status === 'string' ? data.status : 'downloading') as DownloadStatus,
                        message: typeof data.message === 'string' ? data.message : '',
                        _percent_str: typeof data._percent_str === 'string' ? data._percent_str : `${percentage}%`,
                        _speed_str: typeof data._speed_str === 'string' ? data._speed_str : speed_str,
                        _eta_str: typeof data._eta_str === 'string' ? data._eta_str : '--:--',
                        downloaded_bytes: downloaded,
                        total_bytes: total,
                        currentItem,
                        totalItems,
                        currentFile: typeof data.currentFile === 'string' ? data.currentFile :
                            typeof data.filename === 'string' ? data.filename : '',
                        isPlaylist: Boolean(data.isPlaylist || totalItems > 1),
                        playlistName: playlistName,
                        filename: typeof data.filename === 'string' ? data.filename :
                            typeof data.currentFile === 'string' ? data.currentFile : '',
                        speed_raw: speed,
                        timestamp: Date.now(),
                        total_playlist_eta: Number(data.total_playlist_eta || 0),

                        // New explicit percentage fields
                        file_percent: typeof data.file_percent === 'number' ? data.file_percent : 0,
                        playlist_percent: typeof data.playlist_percent === 'number' ? data.playlist_percent : 0
                    };

                    console.log('[Frontend] Setting progress:', newProgress);
                    setProgress(newProgress);

                } catch (error) {
                    console.error('[Frontend] Error processing progress update:', error, 'Data:', data);
                }
            };

            console.log('[Frontend] Registering progress listener');
            window.electronAPI.onDownloadProgress(handleProgress);

            // Cleanup listener
            return () => {
                if (window.electronAPI?.removeProgressListener) {
                    window.electronAPI.removeProgressListener(handleProgress);
                }
            };
        }
    }, []);

    // Load the last used output folder on component mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const lastFolder = localStorage.getItem('lastOutputFolder');
            if (lastFolder) {
                setOutputFolder(lastFolder);
                console.log('Loaded last used folder:', lastFolder);
            }
        }
    }, []);

    // Detect playlist URLs when URL changes
    useEffect(() => {
        if (url.trim()) {
            const playlistDetected = hasPlaylistParams(url);
            setIsPlaylist(playlistDetected);
            // Auto-enable playlist processing if a playlist is detected
            if (playlistDetected) {
                setProcessPlaylist(true);
            }
        } else {
            setIsPlaylist(false);
            setProcessPlaylist(false);
        }
    }, [url]);

    const handleSelectFolder = async () => {
        try {
            // Check if we're running in Electron
            if (typeof window !== 'undefined' && window.electronAPI?.selectFolder) {
                const folder = await window.electronAPI.selectFolder();
                if (folder) {
                    setOutputFolder(folder);
                    console.log('Selected folder:', folder);
                    // Save the selected folder to local storage
                    localStorage.setItem('lastOutputFolder', folder);
                }
            } else {
                console.warn('Electron API not available - running in browser mode');
                // Fallback for browser testing
                if (process.env.NODE_ENV === 'development') {
                    const mockFolder = 'C:/Users/Public/Downloads';
                    console.log('Using mock folder for development:', mockFolder);
                    setOutputFolder(mockFolder);
                } else {
                    alert("Folder selection is only available in the desktop app.");
                }
            }
        } catch (err) {
            console.error('Error selecting folder:', err);
            alert('Error selecting folder: Unknown error');
        }
    };

    // Handle file import (CSV/TXT)
    const handleImportFile = async (file: File) => {
        setLoading(true);
        setResult(null);
        setError(null);
        setProgress(defaultProgress({ status: 'downloading', message: 'Starting batch download...' }));
        const batchStartedAt = Date.now();

        try {
            const text = await file.text();
            const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            
            if (lines.length === 0) {
                throw new Error("File is empty or contains no valid lines.");
            }

            let successCount = 0;
            let failCount = 0;
            
            isCancelled.current = false;

            for (let i = 0; i < lines.length; i++) {
                if (isCancelled.current) {
                    setResult(`Batch cancelled. Success: ${successCount}, Failed: ${failCount}`);
                    break;
                }

                const query = lines[i];
                
                // Update progress message for the overall batch
                setProgress(prev => ({
                    ...prev,
                    status: 'downloading',
                    message: `Batch: Processing item ${i + 1} of ${lines.length}...`,
                }));

                const options: {
                    outputDir?: string;
                    quality: string;
                    fps?: number;
                    timeout: number;
                    skipExisting: boolean;
                    processPlaylist: boolean;
                    format: 'mp3' | 'm4a' | 'flac' | 'wav' | 'opus' | 'best';
                } = {
                    outputDir: outputFolder || undefined,
                    quality,
                    fps: fps || undefined,
                    timeout,
                    skipExisting,
                    processPlaylist: false,
                    format: format as 'mp3' | 'm4a' | 'flac' | 'wav' | 'opus' | 'best'
                };

                try {
                    const result = await window.electronAPI.convertYoutube(query, options);

                    if (result.success) {
                        successCount++;
                    } else {
                        failCount++;
                        console.error(`Failed to download ${query}:`, result.error);
                    }
                } catch (e) {
                    failCount++;
                    console.error(`Error downloading ${query}:`, e);
                }
            }

            if (!isCancelled.current) {
                setResult(`Batch completed. Success: ${successCount}, Failed: ${failCount}`);
                if (successCount > 0) setHarvest({ since: batchStartedAt, autoplay: false });
                setProgress(prev => ({
                    ...prev,
                    status: 'finished',
                    percentage: 100,
                    message: 'Batch completed'
                }));
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Error processing file';
            setError(errorMessage);
            setProgress(prev => ({
                ...prev,
                status: 'error',
                message: errorMessage
            }));
        } finally {
            setLoading(false);
        }
    };

    // Handle download
    const handleDownload = async () => {
        if (!url.trim()) {
            setError('Please enter a YouTube URL or search query');
            return;
        }

        if (!outputFolder) {
            setError('Please select an output folder');
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        setProgress(defaultProgress({ status: 'downloading', message: 'Initializing download...' }));
        const downloadStartedAt = Date.now();

        try {
            // Prepare the query string
            let query = url.trim();
            const isYoutubeUrl = query.match(/(youtube\.com|youtu\.be)/i);
            if (!isYoutubeUrl) {
                query = `ytsearch1:${query}`;
            }

            // Prepare options object with proper typing
            const options: {
                outputDir?: string;
                quality: string;
                fps?: number;
                timeout: number;
                skipExisting: boolean;
                processPlaylist: boolean;
                format: 'mp3' | 'm4a' | 'flac' | 'wav' | 'opus' | 'best';
            } = {
                outputDir: outputFolder || undefined,
                quality,
                fps: fps || undefined,
                timeout,
                skipExisting,
                processPlaylist,
                format: format as 'mp3' | 'm4a' | 'flac' | 'wav' | 'opus' | 'best'
            };

            console.log('[Frontend] Starting download with options:', options);

            // Reset cancellation status
            isCancelled.current = false;

            // Call Electron API with proper type assertion
            if (typeof window !== 'undefined' && window.electronAPI?.convertYoutube) {
                const result: DownloadResult = await window.electronAPI.convertYoutube(query, options);

                // Check if cancelled
                if (isCancelled.current) {
                    console.log('Download processing cancelled by user');
                    return;
                }

                if (result.success) {
                    const savedPath = result.outputPath || result.message || outputFolder;
                    setResult(`Downloaded successfully to: ${savedPath}`);
                    setHarvest({ since: downloadStartedAt, autoplay: false });
                    setProgress(prev => ({ ...prev, status: 'finished', percentage: 100 }));
                } else {
                    setError(result.error || 'Failed to download');
                    setProgress(prev => ({ ...prev, status: 'error', message: result.error || 'Failed to download' }));
                }
            } else {
                setError('Electron API not available');
                setProgress(prev => ({ ...prev, status: 'error', message: 'Electron API not available' }));
            }
        } catch (err) {
            console.error('Error during download:', err);
            const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred during download';
            setError(errorMsg);
            setProgress(prev => ({ ...prev, status: 'error', message: errorMsg }));
        } finally {
            setLoading(false);
        }
    };

    return (
        <main
            className="relative h-screen overflow-hidden"
            style={{ '--audit-accent': colors.lineColor } as React.CSSProperties}
        >
            {isMini ? (
                <MiniView />
            ) : (
            <>
            <Background
                lineColor={colors.lineColor}
                backgroundColor={colors.backgroundColor}
                className="rounded-xl"
            />

            {/* Draggable Header with Native Window Controls */}
            <div
                className="absolute top-2 left-2 right-2 h-10 flex items-center justify-between px-3 glass-base z-50 rounded-xl"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >

                {/* App Controls - Left Side (global: style + info popovers) */}
                <div style={{ WebkitAppRegion: 'no-drag' }} className="flex items-center space-x-2 group">
                    <button
                        onClick={() => {
                            setShowPersonalize(!showPersonalize);
                            if (showInfo) setShowInfo(false);
                        }}
                        className={`p-1.5 rounded-lg transition-colors acc-hover-text ${showPersonalize ? 'bg-white/10 acc-text' : 'hover:bg-white/5'}`}
                        title="Personalize"
                    >
                        <Palette className="w-5 h-5 text-gray-300 acc-hover-text transition-colors" />
                    </button>
                    <button
                        onClick={() => {
                            setShowInfo(true);
                            if (showPersonalize) setShowPersonalize(false);
                        }}
                        className={`p-1.5 rounded-lg transition-colors acc-hover-text ${showInfo ? 'bg-white/10 acc-text' : 'hover:bg-white/5'}`}
                        title="Info"
                    >
                        <InfoIcon className="w-5 h-5 text-gray-300 acc-hover-text transition-colors" />
                    </button>
                    <button
                        onClick={() => window.electronAPI?.toggleMini?.()}
                        className={`p-1.5 rounded-lg transition-colors acc-hover-text ${miniOpen ? 'bg-white/10 acc-text' : 'hover:bg-white/5'}`}
                        title={miniOpen ? 'Close mini player' : 'Open mini player'}
                    >
                        <PictureInPicture2 className="w-5 h-5 text-gray-300 acc-hover-text transition-colors" />
                    </button>
                </div>

                {/* Window Controls - Right Side */}
                <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex items-center space-x-4">
                    <button
                        onClick={() => window.electronAPI?.windowMinimize?.()}
                        className="p-1 text-gray-300 acc-hover-text transition-colors"
                        title="Minimize"
                    >
                        <Minus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => window.electronAPI?.windowMaximize?.()}
                        className="p-1 text-gray-300 acc-hover-text transition-colors"
                        title="Maximize"
                    >
                        <Square className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => window.electronAPI?.windowClose?.()}
                        className="p-1 text-gray-300 acc-hover-text transition-colors"
                        title="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Global title-bar popovers: style + info live here, not inside tabs */}
            {(showPersonalize || showInfo) && (
                <div
                    className="absolute top-14 left-2 z-50 w-[320px] max-w-[calc(100vw-1rem)] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl glass-popover p-3 flex flex-col gap-3"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                    {showPersonalize && (
                        <Personalize
                            show
                            onColorChange={(type, value) => {
                                setColors((prev: { lineColor: string; backgroundColor: string }) => ({
                                    ...prev,
                                    [type]: value
                                }));
                            }}
                            currentColors={colors}
                        />
                    )}
                    {showInfo && (
                        <Info
                            show
                            onClose={() => setShowInfo(false)}
                        />
                    )}
                </div>
            )}

            <div className="relative z-10 h-screen overflow-y-auto">
            <div className="flex flex-col items-center justify-center min-h-full p-4 pt-16">
                <div className="w-full max-w-3xl glass-base rounded-2xl p-4 sm:p-6 md:p-8 mx-2 sm:mx-4">
                    {/* Downloader / Library switch: sliding thumb, one clear state */}
                    <div className="relative grid grid-cols-2 gap-1 p-1 rounded-2xl glass-inset mb-5">
                        <span
                            aria-hidden
                            className="absolute top-1 bottom-1 rounded-xl acc-soft-20 border acc-border transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                            style={{
                                left: tab === 'library' ? 'calc(50% + 0.125rem)' : '0.25rem',
                                width: 'calc(50% - 0.375rem)',
                            }}
                        />
                        <button onClick={() => switchTab('download')}
                            className="relative z-10 flex items-center gap-2.5 px-3 py-2 rounded-xl text-left">
                            <ArrowDownToLine className={`w-5 h-5 shrink-0 transition-colors ${tab === 'download' ? 'acc-text' : 'text-gray-500'}`} />
                            <span className="min-w-0">
                                <span className={`block text-xs sm:text-sm font-semibold transition-colors ${tab === 'download' ? 'text-white' : 'text-gray-300'}`}>Downloader</span>
                                <span className="block text-[10px] sm:text-[11px] text-gray-500 truncate">YouTube → audio files</span>
                            </span>
                        </button>
                        <button onClick={() => switchTab('library')}
                            className="relative z-10 flex items-center gap-2.5 px-3 py-2 rounded-xl text-left">
                            <ListMusic className={`w-5 h-5 shrink-0 transition-colors ${tab === 'library' ? 'acc-text' : 'text-gray-500'}`} />
                            <span className="min-w-0">
                                <span className={`block text-xs sm:text-sm font-semibold transition-colors ${tab === 'library' ? 'text-white' : 'text-gray-300'}`}>Library & Player</span>
                                <span className="block text-[10px] sm:text-[11px] text-gray-500 truncate">Your music, EQ, playlists</span>
                            </span>
                        </button>
                    </div>
                    <div className="space-y-5 w-full">
                        {/* Both sections stay mounted (hidden toggle): download input survives tab
                            switches, and the player keeps publishing state to the mini player. */}
                        <div ref={downloadRef} className={tab === 'download' ? 'flex flex-col gap-5' : 'hidden'}>
                        {/* Download options: two settings, always visible, Info/Colors styling */}
                        <div className="rounded-xl border border-white/5 divide-y divide-white/5">
                            <div className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="text-[11px] text-gray-400">Format</span>
                                <div className="flex gap-1">
                                    {(['mp3', 'mp4'] as const).map((f) => (
                                        <button key={f}
                                            onClick={() => {
                                                setFormat(f);
                                                setQuality(f === 'mp4' ? '1080p' : '320');
                                                setFps(null);
                                            }}
                                            className={`px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-wider border transition-colors ${format === f ? 'acc-soft-20 acc-text acc-border' : 'border-transparent text-gray-400 hover:bg-white/5'}`}>
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="text-[11px] text-gray-400">{format === 'mp4' ? 'Resolution' : 'Bitrate'}</span>
                                <div className="flex gap-1 flex-wrap justify-end">
                                    {(format === 'mp4' ? ['1080p', '720p', '480p', '360p'] : ['320', '256', '192', '128']).map((q) => (
                                        <button key={q} onClick={() => setQuality(q)}
                                            className={`px-2 py-1 rounded-lg text-[10px] tabular-nums border transition-colors ${quality === q ? 'acc-soft-20 acc-text acc-border' : 'border-transparent text-gray-400 hover:bg-white/5'}`}>
                                            {format === 'mp4' ? q : `${q}k`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {format === 'mp4' && (
                                <div className="flex items-center justify-between gap-3 px-3 py-2">
                                    <span className="text-[11px] text-gray-400">Framerate</span>
                                    <div className="flex gap-1">
                                        {[{ v: null as number | null, l: 'Auto' }, { v: 30, l: '30' }, { v: 60, l: '60' }].map(({ v, l }) => (
                                            <button key={l} onClick={() => setFps(v)}
                                                className={`px-2 py-1 rounded-lg text-[10px] border transition-colors ${fps === v ? 'acc-soft-20 acc-text acc-border' : 'border-transparent text-gray-400 hover:bg-white/5'}`}>
                                                {l}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 w-full">
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder="Paste YouTube link or 'Artist - Song Name'..."
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    className="glass-inset w-full px-4 py-3 sm:px-5 sm:py-4 text-sm sm:text-base rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none text-gray-100 placeholder-gray-400 transition-all duration-200"
                                    disabled={loading}
                                />
                            </div>
                            {isPlaylist && (
                                <div className="glass-inset flex items-center rounded-xl px-4">
                                    <input
                                        type="checkbox"
                                        id="processPlaylist"
                                        checked={processPlaylist}
                                        onChange={(e) => setProcessPlaylist(e.target.checked)}
                                        className="h-5 w-5 text-purple-500 rounded border-gray-600 bg-gray-700 focus:ring-purple-500"
                                    />
                                    <label htmlFor="processPlaylist" className="ml-2 text-sm font-medium text-white whitespace-nowrap">
                                        Download Playlist
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={handleSelectFolder}
                                className="glass-inset glass-hover flex-1 flex items-center justify-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl text-gray-200 acc-hover-text transition-colors duration-200 font-medium text-xs sm:text-sm"
                            >
                                <FolderOpen className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span className="truncate">{outputFolder ? `Output: ${outputFolder.split('\\').pop()?.split('/').pop() || 'Selected'}` : "Choose Folder"}</span>
                            </button>
                            <button
                                onClick={() => csvInputRef.current?.click()}
                                className="glass-inset glass-hover flex-1 flex items-center justify-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl text-gray-200 acc-hover-text transition-colors duration-200 font-medium text-xs sm:text-sm"
                                disabled={loading}
                            >
                                <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5 acc-text" />
                                <span className="hidden xs:inline">Import from</span> CSV
                                <input
                                    ref={csvInputRef}
                                    type="file"
                                    accept=".csv"
                                    style={{ display: 'none' }}
                                    onChange={e => {
                                        if (e.target.files && e.target.files[0]) handleImportFile(e.target.files[0]);
                                    }}
                                />
                            </button>
                            <button
                                onClick={() => txtInputRef.current?.click()}
                                className="glass-inset glass-hover flex-1 flex items-center justify-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl text-gray-200 acc-hover-text transition-colors duration-200 font-medium text-xs sm:text-sm"
                                disabled={loading}
                            >
                                <FileText className="w-4 h-4 sm:w-5 sm:h-5 acc-text" />
                                <span className="hidden xs:inline">Import from</span> TXT
                                <input
                                    ref={txtInputRef}
                                    type="file"
                                    accept=".txt"
                                    style={{ display: 'none' }}
                                    onChange={e => {
                                        if (e.target.files && e.target.files[0]) handleImportFile(e.target.files[0]);
                                    }}
                                />
                            </button>
                        </div>

                        {/* Download Button */}
                        <DownloadButton
                            loading={loading}
                            url={url}
                            onDownload={handleDownload}
                            onStop={() => {
                                if (typeof window !== 'undefined' && window.electronAPI?.stopDownload) {
                                    isCancelled.current = true;
                                    window.electronAPI.stopDownload();
                                    setLoading(false);
                                    setProgress(prev => ({
                                        ...prev,
                                        status: 'info',
                                        message: 'Download Stopped'
                                    }));
                                }
                            }}
                        />


                        {/* Progress Bar - Always show if there's any progress data */}
                        <div className="w-full">
                            <DownloadProgressComponent progress={progress} />
                        </div>

                        {/* Results and Errors */}
                        <StatusMessage result={result || ''} error={error || ''} />
                        {result && harvest && (
                            <div className="flex gap-2">
                                <button onClick={() => switchTab('library')}
                                    className="glass-inset glass-hover flex-1 px-3 py-2.5 text-xs sm:text-sm font-medium rounded-xl text-gray-200 acc-hover-text transition-colors">
                                    Open in Library
                                </button>
                                <button onClick={() => { setHarvest((h) => (h ? { ...h, autoplay: true } : h)); switchTab('library'); }}
                                    className="flex-1 px-3 py-2.5 text-xs sm:text-sm font-medium acc-soft-40 acc-hover-60 border acc-border rounded-xl text-white transition-colors">
                                    Play now
                                </button>
                            </div>
                        )}
                        </div>
                        <div ref={libraryRef} className={tab === 'library' ? 'flex flex-col gap-5' : 'hidden'}>
                        <PlayerSection outputFolder={outputFolder} lineColor={colors.lineColor} harvest={harvest} onHarvestDone={clearHarvest} />
                        </div>
                        <Footer />
                    </div>
                </div>
            </div>
            </div>
            </>
            )}
        </main>
    );
}