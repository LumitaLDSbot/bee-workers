import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const input = path.join(process.cwd(), 'public/icons/icon.svg');
const outputDir = path.join(process.cwd(), 'public/icons');

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-maskable-512.png', size: 512 },
];

async function generate() {
  for (const item of sizes) {
    await sharp(input).resize(item.size, item.size).png().toFile(path.join(outputDir, item.name));
    console.log(`✅ Generado ${item.name}`);
  }
  console.log('🎉 Iconos PWA generados correctamente.');
}

generate().catch(error => { console.error('Error generando iconos:', error); process.exit(1); });
