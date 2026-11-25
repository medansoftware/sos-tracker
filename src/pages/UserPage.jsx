import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  ShieldAlert,
  ShieldCheck,
  MapPin,
  Clock,
  Share2,
  Copy,
  Check,
  Navigation,
  Eye,
  Send,
  RotateCcw,
} from 'lucide-react';
import { unlockAudio, playSosSound, playSafeSound } from '../utils/soundEffects';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function UserPage() {
  const [sessionId] = useState(
    () => localStorage.getItem('active_session_id') || `SOS-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  );
  const [gpsStatus, setGpsStatus] = useState('idle');
  const [coords, setCoords] = useState(null);
  const [note, setNote] = useState('');

  // Select Time: Hour : Minute : Second
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(15);
  const [seconds, setSeconds] = useState(0);

  const [status, setStatus] = useState('IDLE'); // IDLE | ACTIVE | SAFE | SOS
  const [expiresAt, setExpiresAt] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [copied, setCopied] = useState(false);

  // Jumlah pemantau aktif & Live Chat
  const [viewerCount, setViewerCount] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [sentMessages, setSentMessages] = useState([]);

  const watchIdRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('active_session_id', sessionId);
  }, [sessionId]);

  // Koneksi Socket.IO untuk memantau jumlah viewer & mengirim live chat
  useEffect(() => {
    const socket = io(API_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_session', { sessionId, role: 'user' });
    });

    socket.on('viewer_count', ({ count }) => {
      setViewerCount(count);
    });

    socket.on('session_updated', (data) => {
      if (data.status === 'SOS' && status !== 'SOS') {
        setStatus('SOS');
      }
    });

    return () => {
      socket.emit('leave_session', sessionId);
      socket.disconnect();
    };
  }, [sessionId]);

  // Pulihkan state terakhir dari server saat halaman dibuka/refresh
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

  const requestGpsPermission = () => {
    unlockAudio();
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
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Hitung mundur timer lokal (sinkron dengan server worker)
  useEffect(() => {
    if (status !== 'ACTIVE' || !expiresAt) return;

    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemainingSeconds(diff);

      if (diff === 0) {
        setStatus('SOS');
        playSosSound();
        syncSessionData({ status: 'SOS' });
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status, expiresAt]);

  const handleStartCheckIn = () => {
    unlockAudio();
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    if (totalSeconds <= 0) {
      alert('Pilih durasi timer minimal 1 detik.');
      return;
    }

    if (gpsStatus !== 'granted') {
      requestGpsPermission();
    }

    const targetTime = Date.now() + totalSeconds * 1000;
    setExpiresAt(targetTime);
    setRemainingSeconds(totalSeconds);
    setStatus('ACTIVE');
    syncSessionData({ status: 'ACTIVE', expiresAt: targetTime });
  };

  const handleMarkSafe = () => {
    unlockAudio();
    playSafeSound();
    setStatus('SAFE');
    setExpiresAt(null);
    setRemainingSeconds(0);
    syncSessionData({ status: 'SAFE', expiresAt: null });
  };

  const handleTriggerSos = () => {
    unlockAudio();
    playSosSound();
    setStatus('SOS');
    syncSessionData({ status: 'SOS' });
  };

  const handleResetIdle = () => {
    unlockAudio();
    setStatus('IDLE');
    setExpiresAt(null);
    setRemainingSeconds(0);
    syncSessionData({ status: 'IDLE', expiresAt: null });
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current) return;

    const text = chatInput.trim();
    socketRef.current.emit('send_chat', { sessionId, message: text });
    setSentMessages((prev) => [
      { id: Date.now(), text, time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
      ...prev.slice(0, 4),
    ]);
    setChatInput('');
  };

  const formatTimeHMS = (totalSecs) => {
    const h = Math.floor(totalSecs / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSecs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const publicTrackUrl = `${window.location.origin}/track/${sessionId}`;

  const copyTrackLink = () => {
    navigator.clipboard.writeText(publicTrackUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        
        {/* Header + Jumlah Pemantau */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Personal Safety Check-In</h1>
            <p className="text-xs text-slate-400">
              ID Sesi: <span className="font-mono text-slate-200">{sessionId}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span
              className={`px-3 py-0.5 rounded-full text-xs font-semibold ${
                status === 'SOS'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                  : status === 'ACTIVE'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : status === 'SAFE'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {status}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-sky-400 bg-sky-950/60 border border-sky-800/50 px-2.5 py-0.5 rounded-full">
              <Eye className="w-3.5 h-3.5" />
              <span>{viewerCount} memantau</span>
            </span>
          </div>
        </div>

        {/* Bagian 1: Izin GPS */}
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

        {/* Bagian 2: Select Time (Jam : Menit : Detik) atau Status Persisten */}
        {status === 'IDLE' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">
                Durasi Check-In (Jam : Menit : Detik)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="block text-[11px] text-slate-500 mb-1">Jam</span>
                  <select
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {i.toString().padStart(2, '0')} jam
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="block text-[11px] text-slate-500 mb-1">Menit</span>
                  <select
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i}>
                        {i.toString().padStart(2, '0')} mnt
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="block text-[11px] text-slate-500 mb-1">Detik</span>
                  <select
                    value={seconds}
                    onChange={(e) => setSeconds(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i}>
                        {i.toString().padStart(2, '0')} dtk
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Catatan Perjalanan (Opsional)
              </label>
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
          <div
            className={`text-center border rounded-xl p-5 space-y-4 ${
              status === 'SOS'
                ? 'bg-red-950/60 border-red-600'
                : status === 'SAFE'
                ? 'bg-emerald-950/50 border-emerald-600'
                : 'bg-slate-950 border-slate-800'
            }`}
          >
            <p className="text-xs uppercase tracking-wider font-semibold text-slate-300">
              {status === 'SOS'
                ? 'STATUS DARURAT (SOS AKTIF)'
                : status === 'SAFE'
                ? 'STATUS AMAN TERKONFIRMASI'
                : 'Sisa Waktu Check-In'}
            </p>

            {status === 'ACTIVE' && (
              <div className="text-4xl font-mono font-bold text-amber-400">
                {formatTimeHMS(remainingSeconds)}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
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

            {(status === 'SOS' || status === 'SAFE') && (
              <button
                onClick={handleResetIdle}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Atur Timer Perjalanan Baru
              </button>
            )}
          </div>
        )}

        {/* Bagian 3: Live Chat Cepat ke Pemantau */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
          <label className="text-xs font-medium text-slate-400 block">
            Kirim Pesan Cepat ke Pemantau (Pop-up)
          </label>
          <form onSubmit={handleSendChat} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ketik kabar singkat (misal: Sebentar lagi sampai)..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-white flex items-center justify-center shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

          {sentMessages.length > 0 && (
            <div className="space-y-1 max-h-20 overflow-y-auto pt-1">
              {sentMessages.map((msg) => (
                <div key={msg.id} className="text-[11px] text-slate-400 flex justify-between bg-slate-900/80 px-2.5 py-1 rounded">
                  <span className="truncate pr-2 text-slate-200">{msg.text}</span>
                  <span className="font-mono text-slate-500 shrink-0">{msg.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bagian 4: Salin Link Publik */}
        <div className="border-t border-slate-800 pt-4 space-y-2">
          <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5" />
            Tautan Pantauan Publik ({viewerCount} orang sedang membuka)
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