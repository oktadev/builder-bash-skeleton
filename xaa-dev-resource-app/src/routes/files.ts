import { Router } from 'express';
import { requireAccessToken } from '../auth/jwt.js';
import { requireScope } from '../auth/scopes.js';
import { createFile, getFile, listFiles } from '../data/store.js';

export const filesRouter = Router();

filesRouter.use(requireAccessToken());

filesRouter.get('/files', requireScope('files.read'), (req, res) => {
  const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : undefined;
  res.json({ items: listFiles(folderId) });
});

filesRouter.get('/files/:id', requireScope('files.read'), (req, res) => {
  const file = getFile(String(req.params.id));
  if (!file) {
    res.status(404).json({ error: 'not_found', error_description: 'File not found' });
    return;
  }
  res.json(file);
});

filesRouter.post('/files', requireScope('files.write'), (req, res) => {
  const { name, folderId, sizeBytes, mimeType } = req.body ?? {};
  if (typeof name !== 'string' || typeof folderId !== 'string') {
    res.status(400).json({
      error: 'invalid_request',
      error_description: '`name` and `folderId` are required strings',
    });
    return;
  }
  const owner = typeof req.token?.sub === 'string' ? req.token.sub : 'unknown';
  const file = createFile({
    name,
    folderId,
    sizeBytes: typeof sizeBytes === 'number' ? sizeBytes : 0,
    mimeType: typeof mimeType === 'string' ? mimeType : 'application/octet-stream',
    owner,
  });
  res.status(201).json(file);
});
