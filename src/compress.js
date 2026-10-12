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
export async function compressVideo(file, { onStatus = () => {}, onProgress = () => {} } = {}) {
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
    const code = await ff.exec([
      '-i', inName,
      '-vf', "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '96k', '-ac', '2', 'out.mp4',
    ]);
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
