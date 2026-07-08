// Generates a single-rectangle Shapefile (.shp/.shx/.dbf/.prj) covering a location's
// BNG_BBOX from config.js, zipped for upload as the "area of interest" on the Defra/EA
// LIDAR download portal (https://environment.data.gov.uk/survey) — an alternative to
// drawing the box by hand on their map. Output is written under tools/terrain/raw/
// (gitignored) since it's a throwaway input to an external site, not part of the baked
// game data.
//
// No shapefile-writing dependency needed: the format for one closed rectangular ring is
// simple enough to build directly from the ESRI Shapefile spec
// (https://www.esri.com/content/dam/esrisites/sitecore-archive/Files/Pdfs/library/whitepapers/pdfs/shapefile.pdf).
//
// Defaults to the first configured location — pass --location=<slug> to target another.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getLocation, resolveLocationSlugs } from './config.js';

const [slug] = resolveLocationSlugs();
const { bbox: BNG_BBOX, slug: locationSlug } = getLocation(slug);

const OUT_DIR = fileURLToPath(new URL('./raw/aoi/', import.meta.url));
const BASENAME = `${locationSlug}-aoi`;

// dBase III field type 'C' (character), single field "id" so the .dbf has a valid record.
const DBF_FIELD_NAME = 'id';
const DBF_FIELD_LEN = 1;

// Esri WKT for EPSG:27700 (OSGB36 / British National Grid), the projection the portal requires.
const OSGB_WKT =
  'PROJCS["British_National_Grid",GEOGCS["GCS_OSGB_1936",' +
  'DATUM["D_OSGB_1936",SPHEROID["Airy_1830",6377563.396,299.3249646]],' +
  'PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]],' +
  'PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",400000],' +
  'PARAMETER["False_Northing",-100000],PARAMETER["Central_Meridian",-2],' +
  'PARAMETER["Scale_Factor",0.9996012717],PARAMETER["Latitude_Of_Origin",49],' +
  'UNIT["Meter",1]]';

function rectangleRing({ minE, minN, maxE, maxN }) {
  // Shapefile exterior rings must be clockwise (x right, y up) — unlike GeoJSON.
  return [
    [minE, minN],
    [minE, maxN],
    [maxE, maxN],
    [maxE, minN],
    [minE, minN],
  ];
}

function buildShp(points) {
  const numPoints = points.length;
  const contentLenBytes = 4 + 32 + 4 + 4 + 4 * 1 + 16 * numPoints; // shapeType+box+numParts+numPoints+parts+points
  const contentLenWords = contentLenBytes / 2;
  const fileLenWords = 50 + 4 + contentLenWords; // 100B header + 8B record header + content, in 16-bit words

  const buf = Buffer.alloc(100 + 8 + contentLenBytes);
  buf.writeInt32BE(9994, 0); // file code
  buf.writeInt32BE(fileLenWords, 24);
  buf.writeInt32LE(1000, 28); // version
  buf.writeInt32LE(5, 32); // shape type: Polygon
  buf.writeDoubleLE(BNG_BBOX.minE, 36);
  buf.writeDoubleLE(BNG_BBOX.minN, 44);
  buf.writeDoubleLE(BNG_BBOX.maxE, 52);
  buf.writeDoubleLE(BNG_BBOX.maxN, 60);
  // Z/M ranges (68-99) left zero — unused for 2D data.

  let off = 100;
  buf.writeInt32BE(1, off); // record number (1-based)
  buf.writeInt32BE(contentLenWords, off + 4);
  off += 8;

  buf.writeInt32LE(5, off); // shape type again, in record content
  buf.writeDoubleLE(BNG_BBOX.minE, off + 4);
  buf.writeDoubleLE(BNG_BBOX.minN, off + 12);
  buf.writeDoubleLE(BNG_BBOX.maxE, off + 20);
  buf.writeDoubleLE(BNG_BBOX.maxN, off + 28);
  buf.writeInt32LE(1, off + 36); // numParts
  buf.writeInt32LE(numPoints, off + 40);
  buf.writeInt32LE(0, off + 44); // parts[0] = index of first point
  off += 48;
  for (const [x, y] of points) {
    buf.writeDoubleLE(x, off);
    buf.writeDoubleLE(y, off + 8);
    off += 16;
  }
  return { buf, contentLenWords };
}

function buildShx(contentLenWords) {
  const buf = Buffer.alloc(100 + 8);
  buf.writeInt32BE(9994, 0);
  buf.writeInt32BE(50 + 4, 24); // header(50) + one index entry(4 words), in 16-bit words
  buf.writeInt32LE(1000, 28);
  buf.writeInt32LE(5, 32);
  buf.writeDoubleLE(BNG_BBOX.minE, 36);
  buf.writeDoubleLE(BNG_BBOX.minN, 44);
  buf.writeDoubleLE(BNG_BBOX.maxE, 52);
  buf.writeDoubleLE(BNG_BBOX.maxN, 60);

  buf.writeInt32BE(50, 100); // offset of the one record, in 16-bit words (right after the 100B header)
  buf.writeInt32BE(contentLenWords, 104);
  return buf;
}

function buildDbf() {
  const headerSize = 32 + 32 + 1; // header + one field descriptor + terminator
  const recordSize = 1 + DBF_FIELD_LEN; // deletion flag + field bytes

  const header = Buffer.alloc(32);
  header.writeUInt8(0x03, 0); // dBase III, no memo
  const today = new Date();
  header.writeUInt8(today.getFullYear() - 1900, 1);
  header.writeUInt8(today.getMonth() + 1, 2);
  header.writeUInt8(today.getDate(), 3);
  header.writeInt32LE(1, 4); // one record
  header.writeUInt16LE(headerSize, 8);
  header.writeUInt16LE(recordSize, 10);

  const field = Buffer.alloc(32);
  field.write(DBF_FIELD_NAME, 0, 'ascii');
  field.writeUInt8(0x43, 11); // 'C'
  field.writeUInt8(DBF_FIELD_LEN, 16);
  field.writeUInt8(0, 17);

  const record = Buffer.alloc(recordSize);
  record.writeUInt8(0x20, 0); // not deleted
  record.write('1', 1, 'ascii');

  return Buffer.concat([header, field, Buffer.from([0x0d]), record, Buffer.from([0x1a])]);
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const points = rectangleRing(BNG_BBOX);
  const { buf: shp, contentLenWords } = buildShp(points);
  const shx = buildShx(contentLenWords);
  const dbf = buildDbf();

  writeFileSync(new URL(`${BASENAME}.shp`, `file://${OUT_DIR}`), shp);
  writeFileSync(new URL(`${BASENAME}.shx`, `file://${OUT_DIR}`), shx);
  writeFileSync(new URL(`${BASENAME}.dbf`, `file://${OUT_DIR}`), dbf);
  writeFileSync(new URL(`${BASENAME}.prj`, `file://${OUT_DIR}`), OSGB_WKT);

  const zipName = `${BASENAME}.zip`;
  execFileSync(
    'zip',
    ['-j', zipName, `${BASENAME}.shp`, `${BASENAME}.shx`, `${BASENAME}.dbf`, `${BASENAME}.prj`],
    { cwd: OUT_DIR, stdio: 'inherit' },
  );

  console.log(`\nWrote ${OUT_DIR}${zipName}`);
  console.log('Upload this zip as the area of interest on https://environment.data.gov.uk/survey');
}

main();
