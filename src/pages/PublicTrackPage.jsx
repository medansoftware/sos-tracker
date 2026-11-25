import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, MapPin, Radio } from 'lucide-react';
import L from 'leaflet';
import { io } from 'socket.io-client';

// Perbaikan ikon marker default Leaflet di Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Komponen helper untuk menggeser kamera peta otomatis saat koordinat berubah
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

  useEffect(() => {
  // 1. Ambil state terakhir dari REST API saat halaman pertama kali dibuka
  fetch(`${API_URL}/api/sessions/${sessionId}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data) setSessionData(data);
    })
    .catch((err) => console.error('Gagal memuat sesi:', err));

  // 2. Hubungkan ke Socket.IO untuk pembaruan lokasi & status SOS real-time
  const socket = io(API_URL, {
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    socket.emit('join_session', sessionId);
  });

  socket.on('session_updated', (updatedData) => {
    setSessionData(updatedData);
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
    <div className={`min-h-screen flex flex-col ${isSos ? 'bg-red-950' : 'bg-slate-950'} text-slate-100 transition-colors`}>
      
      {/* Banner Status Atas */}
      <header className={`p-4 border-b ${
        isSos ? 'bg-red-600 border-red-500 animate-pulse' :
        isSafe ? 'bg-emerald-900/60 border-emerald-700' :
        'bg-slate-900 border-slate-800'
      }`}>
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {isSos ? (
              <AlertTriangle className="w-8 h-8 text-white shrink-0" />
            ) : isSafe ? (
              <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
            ) : (
              <Clock className="w-8 h-8 text-amber-400 shrink-0" />
            )}
            <div>
              <h1 className="font-bold text-lg leading-tight">
                {isSos
                  ? 'PERINGATAN DARURAT (SOS AKTIF!)'
                  : isSafe
                  ? 'Pengguna Telah Konfirmasi Aman'
                  : 'Perjalanan Sedang Dipantau'}
              </h1>
              <p className="text-xs opacity-90">
                ID Sesi: <span className="font-mono">{sessionId}</span> • Pembaruan terakhir:{' '}
                {new Date(sessionData.updatedAt).toLocaleTimeString('id-ID')}
              </p>
            </div>
          </div>

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
      </header>

      {/* Konten Utama: Info & Peta */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col gap-4">
        
        {/* Kartu Detail Catatan & Koordinat */}
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
    </div>
  );
}