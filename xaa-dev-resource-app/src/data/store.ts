/**
 * In-memory Box-style data store. Seeded at startup; not persisted.
 */

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  owner: string;
  createdAt: string;
}

export interface FileItem {
  id: string;
  name: string;
  folderId: string;
  sizeBytes: number;
  mimeType: string;
  owner: string;
  createdAt: string;
}

const now = () => new Date().toISOString();

const folders: Folder[] = [
  { id: 'f_root', name: 'All Files', parentId: null, owner: 'demo', createdAt: now() },
  { id: 'f_docs', name: 'Documents', parentId: 'f_root', owner: 'demo', createdAt: now() },
  { id: 'f_pics', name: 'Pictures', parentId: 'f_root', owner: 'demo', createdAt: now() },
];

const files: FileItem[] = [
  {
    id: 'file_readme',
    name: 'README.md',
    folderId: 'f_docs',
    sizeBytes: 1024,
    mimeType: 'text/markdown',
    owner: 'demo',
    createdAt: now(),
  },
  {
    id: 'file_budget',
    name: 'budget-2026.xlsx',
    folderId: 'f_docs',
    sizeBytes: 45678,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    owner: 'demo',
    createdAt: now(),
  },
  {
    id: 'file_vacation',
    name: 'vacation.jpg',
    folderId: 'f_pics',
    sizeBytes: 2_345_678,
    mimeType: 'image/jpeg',
    owner: 'demo',
    createdAt: now(),
  },
];

export function listFolders(): Folder[] {
  return [...folders];
}

export function getFolder(id: string): Folder | undefined {
  return folders.find((f) => f.id === id);
}

export function listFiles(folderId?: string): FileItem[] {
  if (folderId) return files.filter((f) => f.folderId === folderId);
  return [...files];
}

export function getFile(id: string): FileItem | undefined {
  return files.find((f) => f.id === id);
}

export function createFile(input: Omit<FileItem, 'id' | 'createdAt'>): FileItem {
  const file: FileItem = {
    ...input,
    id: `file_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now(),
  };
  files.push(file);
  return file;
}
