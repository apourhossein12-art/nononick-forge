import sharp from 'sharp';

for (const size of [192, 512]) {
  await sharp('assets/icon.svg')
    .resize(size, size)
    .png()
    .toFile(`assets/icon-${size}.png`);
}
console.log('PNG icons generated.');
