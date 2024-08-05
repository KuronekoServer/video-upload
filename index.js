const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = 'uploads';
const METADATA_FILE = 'uploads.json';

// uploadsディレクトリの存在を確認し、なければ作成
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

// メタデータファイルの存在を確認し、なければ作成
if (!fs.existsSync(METADATA_FILE)) {
  fs.writeFileSync(METADATA_FILE, JSON.stringify([]));
}

// ストレージ設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, uuidv4() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MBまで
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      return cb(new Error('ビデオファイルのみが許可されています。'), false);
    }
    cb(null, true);
  },
});

app.use(express.static('public'));

// アップロードハンドラー
app.post('/upload', upload.single('video'), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).send('ファイルがアップロードされていません。');
  }

  // 保存期間の選択（1日、3日、7日）
  const duration = req.body.duration || '1d'; // デフォルトは1日
  let expirationTime = Date.now();
  switch (duration) {
    case '3d':
      expirationTime += 3 * 24 * 60 * 60 * 1000;
      break;
    case '7d':
      expirationTime += 7 * 24 * 60 * 60 * 1000;
      break;
    case '1d':
    default:
      expirationTime += 1 * 24 * 60 * 60 * 1000;
  }

  // ダウンロードURLを生成
  const downloadUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;

  // メタデータの保存
  const fileMetadata = {
    filename: file.filename,
    uploadTime: Date.now(),
    expirationTime: expirationTime,
    url: downloadUrl,
  };
  let metadata = JSON.parse(fs.readFileSync(METADATA_FILE));
  metadata.push(fileMetadata);
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata));

  res.status(200).send({ url: downloadUrl });
});

// ビデオファイルの配信
app.use('/uploads', express.static(path.join(__dirname, UPLOAD_DIR)));

// 定期的に期限切れのファイルを削除する
setInterval(() => {
  let metadata = JSON.parse(fs.readFileSync(METADATA_FILE));
  const now = Date.now();
  metadata = metadata.filter(file => {
    if (file.expirationTime < now) {
      const filePath = path.join(UPLOAD_DIR, file.filename);
      fs.unlink(filePath, (err) => {
        if (err) console.error('ファイルの削除中にエラーが発生しました:', err);
        else console.log('ファイルが削除されました:', file.filename);
      });
      return false;
    }
    return true;
  });
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata));
}, 24 * 60 * 60 * 1000); // 1日ごとに実行

// サーバーを起動
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
