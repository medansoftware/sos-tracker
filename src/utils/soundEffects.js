// =========================================================================
// KONFIGURASI FILE AUDIO (Ubah path di bawah sesuai file di folder public/)
// =========================================================================
export const SAFE_SOUND_FILE = '/sounds/safe.mp3';
export const SOS_SOUND_FILE = '/sounds/sos.mp3';

// Instance Audio yang di-preload agar langsung berbunyi tanpa jeda
const safeAudio = new Audio(SAFE_SOUND_FILE);
const sosAudio = new Audio(SOS_SOUND_FILE);

safeAudio.preload = 'auto';
sosAudio.preload = 'auto';

// Opsional: Atur apakah suara SOS berulang terus sampai halaman ditutup/status berubah
sosAudio.loop = false;

/**
 * Membuka kunci izin autoplay audio browser pada interaksi klik pertama pengguna
 */
export function unlockAudio() {
  [safeAudio, sosAudio].forEach((audio) => {
    audio.muted = true;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        })
        .catch(() => {
          audio.muted = false;
        });
    }
  });
}

/**
 * Memutar efek suara status AMAN (SAFE)
 */
export function playSafeSound() {
  stopAllSounds();
  safeAudio.currentTime = 0;
  safeAudio.play().catch((err) => {
    console.warn('Gagal memutar audio SAFE (pastikan file ada & izin audio aktif):', err);
  });
}

/**
 * Memutar efek suara status DARURAT (SOS)
 */
export function playSosSound() {
  stopAllSounds();
  sosAudio.currentTime = 0;
  sosAudio.play().catch((err) => {
    console.warn('Gagal memutar audio SOS (pastikan file ada & izin audio aktif):', err);
  });
}

/**
 * Menghentikan semua audio yang sedang berjalan
 */
export function stopAllSounds() {
  [safeAudio, sosAudio].forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
}

/**
 * Efek suara ringan untuk pesan chat masuk (menggunakan Web Audio API tanpa butuh file tambahan)
 */
export function playChatPopSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const ctx = new AudioContextClass();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(950, now + 0.12);

  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}