// Shrinks a video inside the browser (nothing is sent anywhere until you upload).
// Same settings as tools/compress-video.sh: H.264, longest side capped at 1280, fast start.
const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
export const MAX_INPUT = 1024 * 1024 * 1024; // browsers run out of memory beyond about 1 GB

let ready;
async function load() {
  if (!ready) {
    ready = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
      const ff = new FFmpeg();
      await ff.load({
        coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      return ff;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

// onStatus(text) and onProgress(0..1) are optional. Returns a new File (mp4).
// How long a video is (seconds), read by the browser itself.
const durationOf = (file) => new Promise((res) => {
  const v = document.createElement('video'); const u = URL.createObjectURL(file);
  v.preload = 'metadata'; v.muted = true;
  v.onloadedmetadata = () => { res(Number.isFinite(v.duration) ? v.duration : 0); URL.revokeObjectURL(u); };
  v.onerror = () => { res(0); URL.revokeObjectURL(u); };
  v.src = u;
});

// mode: 'web' (default, the single-file "Make smaller": longest side 1280, CRF 23)
//       'quality' (same size and frame rate, visually near-lossless, the original sound kept; the caller keeps the original if the result is not clearly smaller)
//       'under5' (aims for about 5 MB: a bitrate budget worked out from the length, sizes capped at 1280)
export async function compressVideo(file, { onStatus = () => {}, onProgress = () => {}, mode = 'web', targetMB = 5 } = {}) {
  if (file.size > MAX_INPUT) throw new Error('This file is too big to shrink in the browser. Use tools/compress-video.sh on a computer with ffmpeg.');
  onStatus('Loading the video shrinker (first time only, about 30 MB)...');
  let ff;
  try { ff = await load(); } catch (e) { console.error('Loopy shrinker load failed:', e); throw new Error('Could not load the shrinker. Check your internet connection and try again.'); }
  const ext = (file.name.match(/\.[a-z0-9]+$/i) || ['.mp4'])[0].toLowerCase();
  const inName = 'in' + ext;
  const handler = ({ progress }) => onProgress(Math.max(0, Math.min(1, progress || 0)));
  ff.on('progress', handler);
  try {
    onStatus('Shrinking... keep this tab open.');
    await ff.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
    const cap = "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'";
    let args;
    if (mode === 'quality') {
      // Same picture size, high quality (CRF 18 is visually hard to tell from the original); the sound is copied untouched.
      args = ['-i', inName, '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'faster', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'copy', 'out.mp4'];
    } else if (mode === 'under5') {
      const secs = (await durationOf(file)) || 30;
      const total = Math.floor((targetMB * 1048576 * 8 * 0.9) / secs);        // bits per second for the whole file, 10% spare
      const video = Math.max(250000, total - 96000);                           // minus the sound
      const k = Math.round(video / 1000);
      args = ['-i', inName, '-vf', cap, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-maxrate', k + 'k', '-bufsize', (k * 2) + 'k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k', '-ac', '2', 'out.mp4'];
    } else {
      args = ['-i', inName, '-vf', cap, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k', '-ac', '2', 'out.mp4'];
    }
    const code = await ff.exec(args);
    if (code !== 0) throw new Error('This video format could not be shrunk. Try an MP4 or MOV file.');
    const data = await ff.readFile('out.mp4');
    const out = new File([data], file.name.replace(/\.[^.]+$/, '') + '-web.mp4', { type: 'video/mp4' });
    if (!out.size) throw new Error('The shrunk video came out empty. Try another file.');
    return out;
  } finally {
    ff.off('progress', handler);
    try { await ff.deleteFile(inName); } catch {}
    try { await ff.deleteFile('out.mp4'); } catch {}
  }
}
