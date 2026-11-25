import { useState, useEffect, useRef } from 'react';
import { ShieldAlert, ShieldCheck, MapPin, Clock, Share2, Copy, Check, Navigation } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function UserPage() {
  const [sessionId] = useState(() => localStorage.getItem('active_session_id') || `SOS-${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | requesting | granted | denied
  const [coords, setCoords] = useState(null);
  const [note, setNote] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [status, setStatus] = useState('IDLE'); // IDLE | ACTIVE | SAFE | SOS
  const [expiresAt, setExpiresAt] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [copied, setCopied] = useState(false);

  const watchIdRef = useRef(null);

  // Simpan sessionId agar tetap konsisten saat refresh
  useEffect(() => {
    localStorage.setItem('active_session_id', sessionId);
  }, [sessionId]);

    // 1. Pulihkan status terakhir dari server jika halaman di-refresh
    useEffect(() => {
    fetch(`${API_URL}/api/sessions/${sessionId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
        if (data) {
            setStatus(data.status);
            if (data.note) setNote(data.note);
            if (data.coords) setCoords(data.coords);
            if (data.expiresAt) {
            setExpiresAt(data.expiresAt);
            setRemainingSeconds(Math.max(0, Math.floor((data.expiresAt - Date.now()) / 1000)));
            }
        }
        })
        .catch(() => {});
    }, [sessionId]);

    // 2. Ganti fungsi syncSessionData dengan fetch ke Express API:
    const syncSessionData = async (overrideData = {}) => {
    const payload = {
        status: overrideData.status ?? status,
        coords: overrideData.coords ?? coords,
        note: overrideData.note ?? note,
        expiresAt: overrideData.expiresAt !== undefined ? overrideData.expiresAt : expiresAt,
    };

    try {
        await fetch(`${API_URL}/api/sessions/${sessionId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        });
    } catch (err) {
        console.error('Gagal sinkronisasi ke server:', err);
    }
    };

  // Minta izin & pantau pergerakan GPS secara berkelanjutan
  const requestGpsPermission = () => {
    if (!('geolocation' in navigator)) {
      alert('Browser ini tidak mendukung Geolocation.');
      return;
    }

    setGpsStatus('requesting');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        };
        setCoords(newCoords);
        setGpsStatus('granted');
        syncSessionData({ coords: newCoords });
      },
      (error) => {
        console.error('GPS Error:', error);
        setGpsStatus('denied');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Hitung mundur timer & otomatis ubah status ke SOS jika waktu habis
  useEffect(() => {
    if (status !== 'ACTIVE' || !expiresAt) return;

    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemainingSeconds(diff);

      if (diff === 0) {
        setStatus('SOS');
        syncSessionData({ status: 'SOS' });
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status, expiresAt]);

  const handleStartCheckIn = () => {
    if (gpsStatus !== 'granted') {
      requestGpsPermission();
    }
    const targetTime = Date.now() + durationMinutes * 60 * 1000;
    setExpiresAt(targetTime);
    setRemainingSeconds(durationMinutes * 60);
    setStatus('ACTIVE');
    syncSessionData({ status: 'ACTIVE', expiresAt: targetTime });
  };

  const handleMarkSafe = () => {
    setStatus('SAFE');
    setExpiresAt(null);
    setRemainingSeconds(0);
    syncSessionData({ status: 'SAFE', expiresAt: null });
  };

  const handleTriggerSos = () => {
    setStatus('SOS');
    syncSessionData({ status: 'SOS' });
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const publicTrackUrl = `${window.location.origin}/track/${sessionId}`;

  const copyTrackLink = () => {
    navigator.clipboard.writeText(publicTrackUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Personal Safety Check-In</h1>
            <p className="text-xs text-slate-400">ID Sesi: <span className="font-mono text-slate-200">{sessionId}</span></p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            status === 'SOS' ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse' :
            status === 'ACTIVE' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
            status === 'SAFE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
            'bg-slate-800 text-slate-400'
          }`}>
            {status}
          </span>
        </div>

        {/* Langkah 1: Izin GPS */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="w-4 h-4 text-sky-400" />
              <span>Akses Lokasi GPS</span>
            </div>
            {gpsStatus === 'granted' ? (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <Navigation className="w-3 h-3" /> Aktif (±{coords?.accuracy}m)
              </span>
            ) : (
              <span className="text-xs text-amber-400">Belum Aktif</span>
            )}
          </div>

          {gpsStatus !== 'granted' ? (
            <button
              onClick={requestGpsPermission}
              className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 active:scale-[0.99] transition rounded-lg text-sm font-semibold text-white cursor-pointer"
            >
              {gpsStatus === 'requesting' ? 'Meminta Izin GPS...' : 'Izinkan & Aktifkan GPS'}
            </button>
          ) : (
            <div className="text-xs font-mono text-slate-400 bg-slate-900 p-2.5 rounded-lg flex justify-between">
              <span>Lat: {coords?.lat.toFixed(6)}</span>
              <span>Lng: {coords?.lng.toFixed(6)}</span>
            </div>
          )}

          {gpsStatus === 'denied' && (
            <p className="text-xs text-red-400">
              Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser kamu.
            </p>
          )}
        </div>

        {/* Langkah 2: Pengaturan Timer atau Hitung Mundur */}
        {status !== 'ACTIVE' && status !== 'SOS' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Durasi Check-In</label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 15, 30, 60].map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setDurationMinutes(min)}
                    className={`py-2 rounded-lg text-sm font-medium border transition cursor-pointer ${
                      durationMinutes === min
                        ? 'bg-sky-600/20 border-sky-500 text-sky-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {min} mnt
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Catatan Perjalanan (Opsional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: Naik ojol plat BK 1234 XX ke rumah"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>

            <button
              onClick={handleStartCheckIn}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Clock className="w-4 h-4" />
              Mulai Timer Perjalanan
            </button>
          </div>
        ) : (
          <div className="text-center bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
            <p className="text-xs uppercase tracking-wider text-slate-400">
              {status === 'SOS' ? 'WAKTU HABIS / STATUS DARURAT' : 'Sisa Waktu Check-In'}
            </p>
            <div className={`text-5xl font-mono font-bold ${status === 'SOS' ? 'text-red-500' : 'text-amber-400'}`}>
              {formatTime(remainingSeconds)}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleMarkSafe}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                Saya Aman
              </button>
              <button
                onClick={handleTriggerSos}
                className="py-3 px-4 bg-red-600 hover:bg-red-500 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4" />
                Darurat (SOS)
              </button>
            </div>
          </div>
        )}

        {/* Langkah 3: Bagikan Link ke Keluarga/Teman */}
        <div className="border-t border-slate-800 pt-4 space-y-2">
          <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5" />
            Tautan Pantauan Publik (Kirim ke Keluarga/Teman)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={publicTrackUrl}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300"
            />
            <button
              onClick={copyTrackLink}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 flex items-center gap-1 text-xs font-medium shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Tersalin' : 'Salin'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}