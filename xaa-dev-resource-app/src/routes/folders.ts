import { Router } from 'express';
import { requireAccessToken } from '../auth/jwt.js';
import { requireScope } from '../auth/scopes.js';
import { getFolder, listFiles, listFolders } from '../data/store.js';

export const foldersRouter = Router();

foldersRouter.use(requireAccessToken());

foldersRouter.get('/folders', requireScope('folders.read'), (_req, res) => {
  res.json({ items: listFolders() });
});

foldersRouter.get('/folders/:id', requireScope('folders.read'), (req, res) => {
  const folder = getFolder(String(req.params.id));
  if (!folder) {
    res.status(404).json({ error: 'not_found', error_description: 'Folder not found' });
    return;
  }
  res.json({ ...folder, files: listFiles(folder.id) });
});
