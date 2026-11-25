import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Radio,
  Volume2,
  MessageCircle,
} from 'lucide-react';
import L from 'leaflet';
import { unlockAudio, playSosSound, playSafeSound, playChatPopSound } from '../utils/soundEffects';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function RecenterMap({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], map.getZoom(), { animate: true });
    }
  }, [lat, lng, map]);
  return null;
}

export default function PublicTrackPage() {
  const { sessionId } = useParams();
  const [sessionData, setSessionData] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [floatingBubbles, setFloatingBubbles] = useState([]);

  const prevStatusRef = useRef(null);

  const handleEnableAudio = () => {
    unlockAudio();
    setAudioEnabled(true);
  };

  useEffect(() => {
    // 1. Ambil state awal dari REST API
    fetch(`${API_URL}/api/sessions/${sessionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setSessionData(data);
          prevStatusRef.current = data.status;
        }
      })
      .catch((err) => console.error('Gagal memuat sesi:', err));

    // 2. Hubungkan Socket.IO sebagai 'viewer'
    const socket = io(API_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      socket.emit('join_session', { sessionId, role: 'viewer' });
    });

    socket.on('session_updated', (updatedData) => {
      // Putar sound effect jika terjadi perubahan status ke SOS atau SAFE
      if (prevStatusRef.current !== updatedData.status) {
        if (updatedData.status === 'SOS') {
          playSosSound();
        } else if (updatedData.status === 'SAFE') {
          playSafeSound();
        }
        prevStatusRef.current = updatedData.status;
      }

      setSessionData(updatedData);
    });

    // 3. Tangkap pesan live chat dari pengguna & tampilkan sebagai floating bubble yang perlahan pudar
    socket.on('receive_chat', (chatPayload) => {
      playChatPopSound();
      const bubbleId = chatPayload.id;

      setFloatingBubbles((prev) => [
        ...prev,
        { ...chatPayload, fading: false },
      ]);

      // Mulai animasi fade-out setelah 6 detik
      setTimeout(() => {
        setFloatingBubbles((prev) =>
          prev.map((b) => (b.id === bubbleId ? { ...b, fading: true } : b))
        );
      }, 6000);

      // Hapus bubble setelah transisi fade-out selesai (8 detik)
      setTimeout(() => {
        setFloatingBubbles((prev) => prev.filter((b) => b.id !== bubbleId));
      }, 8000);
    });

    return () => {
      socket.emit('leave_session', sessionId);
      socket.disconnect();
    };
  }, [sessionId]);

  if (!sessionData) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-4">
        <div className="text-center space-y-2">
          <Radio className="w-8 h-8 text-slate-500 mx-auto animate-pulse" />
          <h2 className="text-lg font-semibold">Menunggu Sinyal Sesi ({sessionId})...</h2>
          <p className="text-xs text-slate-400">Pastikan pengguna telah mengaktifkan GPS pada halaman utama.</p>
        </div>
      </div>
    );
  }

  const isSos = sessionData.status === 'SOS';
  const isSafe = sessionData.status === 'SAFE';
  const hasCoords = Boolean(sessionData.coords?.lat && sessionData.coords?.lng);

  return (
    <div
      onClick={handleEnableAudio}
      className={`min-h-screen flex flex-col ${
        isSos ? 'bg-red-950' : isSafe ? 'bg-emerald-950/40' : 'bg-slate-950'
      } text-slate-100 transition-colors relative`}
    >
      {/* Banner Status Persisten (Tidak Hilang Otomatis) */}
      <header
        className={`p-4 border-b shadow-lg ${
          isSos
            ? 'bg-red-600 border-red-400'
            : isSafe
            ? 'bg-emerald-700 border-emerald-500'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {isSos ? (
              <AlertTriangle className="w-9 h-9 text-white shrink-0 animate-bounce" />
            ) : isSafe ? (
              <CheckCircle2 className="w-9 h-9 text-white shrink-0" />
            ) : (
              <Clock className="w-8 h-8 text-amber-400 shrink-0" />
            )}
            <div>
              <h1 className="font-bold text-lg leading-tight text-white">
                {isSos
                  ? 'PERINGATAN DARURAT (SOS AKTIF!)'
                  : isSafe
                  ? 'PENGGUNA TELAH KONFIRMASI AMAN'
                  : 'Perjalanan Sedang Dipantau'}
              </h1>
              <p className="text-xs text-white/90">
                ID Sesi: <span className="font-mono">{sessionId}</span> • Status tercatat pukul:{' '}
                <strong>{new Date(sessionData.updatedAt).toLocaleTimeString('id-ID')}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!audioEnabled && (
              <button
                onClick={handleEnableAudio}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-950/60 hover:bg-slate-950 text-white text-xs font-medium rounded-lg border border-white/20 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5 text-amber-300" />
                Aktifkan Suara Alarm
              </button>
            )}

            {hasCoords && (
              <a
                href={`https://www.google.com/maps?q=${sessionData.coords.lat},${sessionData.coords.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white text-slate-950 font-semibold text-xs rounded-lg shadow hover:bg-slate-100 transition"
              >
                Buka di Google Maps <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Konten Utama: Info & Peta */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-400 block mb-1">Catatan Perjalanan</span>
            <p className="text-sm font-medium text-slate-100">
              {sessionData.note || 'Tidak ada catatan tambahan.'}
            </p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 block mb-1">Koordinat GPS Terakhir</span>
              {hasCoords ? (
                <p className="text-sm font-mono text-sky-400">
                  {sessionData.coords.lat.toFixed(6)}, {sessionData.coords.lng.toFixed(6)}
                </p>
              ) : (
                <p className="text-sm text-amber-400">Menunggu titik koordinat...</p>
              )}
            </div>
            <MapPin className="w-6 h-6 text-slate-500" />
          </div>
        </div>

        {/* Peta Interaktif */}
        <div className="flex-1 min-h-[400px] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden relative z-0">
          {hasCoords ? (
            <MapContainer
              center={[sessionData.coords.lat, sessionData.coords.lng]}
              zoom={16}
              className="w-full h-full min-h-[400px]"
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker position={[sessionData.coords.lat, sessionData.coords.lng]}>
                <Popup>
                  <strong>Status: {sessionData.status}</strong>
                  <br />
                  Akurasi: ±{sessionData.coords.accuracy} meter
                </Popup>
              </Marker>
              <RecenterMap lat={sessionData.coords.lat} lng={sessionData.coords.lng} />
            </MapContainer>
          ) : (
            <div className="w-full h-full min-h-[400px] flex items-center justify-center text-sm text-slate-400">
              Peta akan muncul otomatis setelah perangkat pengguna mengirimkan lokasi GPS.
            </div>
          )}
        </div>
      </main>

      {/* Floating Chat Bubbles (Melayang & Perlahan Pudar) */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2.5 max-w-xs sm:max-w-sm pointer-events-none">
        {floatingBubbles.map((bubble) => (
          <div
            key={bubble.id}
            className={`bg-sky-600/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl rounded-br-sm shadow-2xl border border-sky-400/40 transition-all duration-1000 ease-out transform ${
              bubble.fading ? 'opacity-0 -translate-y-3 scale-95' : 'opacity-100 translate-y-0 scale-100'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-sky-200 mb-0.5">
              <MessageCircle className="w-3 h-3" />
              <span>Pesan dari Pengguna</span>
              <span className="ml-auto font-mono opacity-80">
                {new Date(bubble.sentAt).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <p className="text-sm leading-snug break-words">{bubble.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}