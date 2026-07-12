// Absolute cap for an untrusted upload. Prepared exports use compact metadata,
// but a source near the 650 KB base-asset limit still needs bounded headroom.
export const MAX_SVG_FILE_SIZE = 1_000_000;

export function validateSvgFile(file) {
  if (!file) throw new Error('Bir SVG dosyası seçin.');
  const name = String(file.name || '');
  const svgExtension = /\.svg$/i.test(name);
  const svgMime = file.type === 'image/svg+xml';
  if (!svgExtension && !svgMime) throw new Error('Yalnızca SVG harita dosyaları kabul edilir.');
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('SVG dosyası boş.');
  if (file.size > MAX_SVG_FILE_SIZE) {
    throw new Error(`SVG dosyası en fazla ${Math.round(MAX_SVG_FILE_SIZE / 1000)} KB olabilir.`);
  }
  return file;
}

export async function readSvgFile(file) {
  validateSvgFile(file);
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('SVG dosyası okunamadı.'));
    reader.readAsText(file);
  });
}
