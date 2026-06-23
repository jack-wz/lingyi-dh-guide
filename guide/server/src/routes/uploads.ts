import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync, readFile } from 'fs';
import { registerUploadedAsset } from './assets.js';
import { sanitizeSvgSafelist, looksLikeLottieJson } from '../../../shared/types/motion.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '../../../data/uploads');

// Ensure uploads directory exists
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname) || '.bin';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const MOTION_JSON_LIMIT = 8 * 1024 * 1024; // 8MB cap for lottie/recipe json

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    // V5 expanded whitelist: svg / lottie / json / webm added (#19).
    const allowed = /\.(jpg|jpeg|png|webp|gif|mp3|wav|m4a|ogg|mp4|mov|avi|svg|json|lottie|webm)$/i;
    if (allowed.test(extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.originalname}`));
    }
  },
});

const router = Router();

// POST /api/uploads - upload a file
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const ext = extname(req.file.originalname).toLowerCase();
  // V5 content validation for newly-allowed motion asset uploads (#19).
  if (ext === '.svg') {
    const text = await readFileProm(req.file.path, 'utf-8', MOTION_JSON_LIMIT);
    if (text.length > MOTION_JSON_LIMIT) return res.status(413).json({ error: 'SVG too large (>8MB)' });
    const { blockers } = sanitizeSvgSafelist(text);
    if (blockers.length) return res.status(422).json({ error: 'SVG failed sanitizer', blockers });
  } else if (ext === '.json' || ext === '.lottie') {
    if (req.file.size > MOTION_JSON_LIMIT) return res.status(413).json({ error: 'Lottie/JSON too large (>8MB)' });
    const text = await readFileProm(req.file.path, 'utf-8', MOTION_JSON_LIMIT);
    if (ext === '.json' && !looksLikeLottieJson(text)) {
      return res.status(422).json({ error: 'Uploaded .json does not look like a Lottie body (v/layers/assets/fr keys missing). Pass type=motion_recipe explicitly if intentional.' });
    }
  }

  const url = `/uploads/${req.file.filename}`;
  const assetId = registerUploadedAsset(req.file, url);
  res.json({
    url,
    asset_id: assetId,
    filename: req.file.filename,
    original_name: req.file.originalname,
    size: req.file.size,
    mime_type: req.file.mimetype,
  });
});

function readFileProm(path: string, enc: BufferEncoding, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    readFile(path, { encoding: enc, flag: 'r' }, (err, data) => {
      if (err) return reject(err);
      if (Buffer.byteLength(data, enc) > limit) return reject(new Error('file too large'));
      resolve(data as unknown as string);
    });
  });
}

export default router;
