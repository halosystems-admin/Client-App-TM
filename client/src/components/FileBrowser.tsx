import React, { useState } from 'react';
import type { DriveFile, BreadcrumbItem } from '../../../shared/types';
import { AppStatus, FOLDER_MIME_TYPE } from '../../../shared/types';
import {
  FileText, ChevronLeft, ChevronRight, Home, FolderOpen, FolderPlus,
  Pencil, Trash2, Eye, ExternalLink, CloudUpload,
  FileSpreadsheet, FileImage, File, MoreHorizontal,
} from 'lucide-react';
import { getFriendlyFileType } from '../utils/formatting';

interface FileBrowserProps {
  files: DriveFile[];
  status: AppStatus;
  breadcrumbs: BreadcrumbItem[];
  onNavigateToFolder: (folder: DriveFile) => void;
  onNavigateBack: () => void;
  onNavigateToBreadcrumb: (index: number) => void;
  onStartEditFile: (file: DriveFile) => void;
  onDeleteFile: (file: DriveFile) => void;
  onViewFile: (file: DriveFile) => void;
  onCreateFolder: () => void;
}

const isFolder = (file: DriveFile): boolean => file.mimeType === FOLDER_MIME_TYPE;

const FileSkeleton: React.FC = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex items-center p-4 bg-white border border-slate-200 rounded-xl animate-pulse">
        <div className="w-11 h-11 bg-slate-200 rounded-lg mr-4" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 rounded w-2/3" />
          <div className="h-3 bg-slate-100 rounded w-1/3" />
        </div>
      </div>
    ))}
  </div>
);

export const FileBrowser: React.FC<FileBrowserProps> = ({
  files, status, breadcrumbs,
  onNavigateToFolder, onNavigateBack, onNavigateToBreadcrumb,
  onStartEditFile, onDeleteFile, onViewFile, onCreateFolder,
}) => {
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const isAtRoot = breadcrumbs.length <= 1;
  const folders = files.filter(isFolder);
  const regularFiles = files.filter(f => !isFolder(f));

  return (
    <div>
      {/* Breadcrumb navigation + New Folder button */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {!isAtRoot && (
            <button
              type="button"
              onClick={onNavigateBack}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-teal-50 hover:text-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
              title="Go back"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.id}>
              {index > 0 && <ChevronRight size={14} className="text-slate-300 shrink-0" />}
              <button
                onClick={() => onNavigateToBreadcrumb(index)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  index === breadcrumbs.length - 1
                    ? 'text-teal-700 bg-teal-50'
                    : 'text-slate-500 hover:text-teal-600 hover:bg-slate-100'
                }`}
              >
                {index === 0 && <Home size={13} className="shrink-0" />}
                {index === 0 && breadcrumbs.length > 1 ? 'Root' : crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>
        <button
          type="button"
          onClick={onCreateFolder}
          className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-black/[0.04] transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
        >
          <FolderPlus size={16} className="text-teal-600" strokeWidth={2} /> New Folder
        </button>
      </div>

      {/* File / folder listing */}
      <div className="grid grid-cols-1 gap-3">
        {status === AppStatus.LOADING ? (
          <FileSkeleton />
        ) : folders.length === 0 && regularFiles.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
            {status === AppStatus.UPLOADING ? (
              <div className="flex flex-col items-center gap-3">
                <CloudUpload className="w-12 h-12 text-teal-200 animate-bounce" />
                <p className="text-teal-600 font-medium">Adding file to drive...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FolderOpen className="w-10 h-10 text-slate-300" />
                <p className="text-slate-400 font-medium">This folder is empty</p>
                <p className="text-slate-300 text-sm">Upload files using the button above</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Folders first */}
            {folders.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-1 pt-1">
                  <FolderOpen size={13} className="text-slate-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Folders ({folders.length})</span>
                </div>
                {folders.map(folder => (
                  <div
                    key={folder.id}
                    className="group relative flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm ring-1 ring-black/[0.03] transition-all duration-200 hover:border-slate-300/90 hover:shadow-md sm:gap-3 sm:p-4"
                  >
                    <button
                      type="button"
                      className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center rounded-xl py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
                      onClick={() => {
                        setRowMenuId(null);
                        onNavigateToFolder(folder);
                      }}
                    >
                      <div className="mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-600 sm:mr-3">
                        <FolderOpen className="h-5 w-5" strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1 pr-1">
                        <h4 className="truncate font-semibold text-slate-800 transition-colors group-hover:text-teal-700">{folder.name}</h4>
                        <p className="mt-1 text-xs text-slate-500">Folder &bull; {folder.createdTime}</p>
                      </div>
                      <ChevronRight size={20} className="ml-0.5 shrink-0 text-slate-300 transition-colors group-hover:text-teal-500" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRowMenuId(null);
                        onStartEditFile(folder);
                      }}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-teal-700 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
                      title="Rename folder"
                      aria-label={`Rename ${folder.name}`}
                    >
                      <Pencil size={17} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* Files */}
            {regularFiles.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-1 pt-2">
                  <FileText size={13} className="text-slate-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Files ({regularFiles.length})</span>
                </div>
                {regularFiles.map(file => {
                  const isImage = file.mimeType.includes('image');
                  const isSpreadsheet = file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || file.mimeType.includes('csv');
                  const isPdf = file.mimeType === 'application/pdf';
                  const iconClass = isImage ? 'bg-purple-100 text-purple-600'
                    : isSpreadsheet ? 'bg-emerald-100 text-emerald-600'
                    : isPdf ? 'bg-red-100 text-red-600'
                    : 'bg-blue-100 text-blue-600';
                  const IconComponent = isImage ? FileImage
                    : isSpreadsheet ? FileSpreadsheet
                    : isPdf ? FileText
                    : File;
                  const menuKey = `file-${file.id}`;
                  const iconBtn =
                    'flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50';
                  return (
                    <div key={file.id} className="group relative flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm ring-1 ring-black/[0.03] transition-all duration-200 hover:border-slate-300/90 hover:shadow-md sm:gap-3 sm:p-4">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:mr-1 ${iconClass}`}>
                        <IconComponent className="h-5 w-5" strokeWidth={2} />
                      </div>
                      <button
                        type="button"
                        className="min-w-0 flex-1 cursor-pointer rounded-xl py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
                        onClick={() => onViewFile(file)}
                      >
                        <h4 className="truncate font-semibold text-slate-800 transition-colors group-hover:text-teal-700">{file.name}</h4>
                        <p className="mt-1 truncate text-xs text-slate-500">{file.createdTime} &bull; {getFriendlyFileType(file.mimeType)}</p>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <div className="hidden items-center gap-1 sm:flex">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewFile(file);
                            }}
                            className={iconBtn}
                            title="Preview"
                            aria-label={`Preview ${file.name}`}
                          >
                            <Eye size={17} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartEditFile(file);
                            }}
                            className={iconBtn}
                            title="Rename"
                            aria-label={`Rename ${file.name}`}
                          >
                            <Pencil size={17} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteFile(file);
                            }}
                            className={`${iconBtn} border-rose-100/90 text-rose-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700`}
                            title="Delete"
                            aria-label={`Delete ${file.name}`}
                          >
                            <Trash2 size={17} strokeWidth={2} />
                          </button>
                        </div>
                        <div className="relative sm:hidden">
                          <button
                            type="button"
                            onClick={() => setRowMenuId(rowMenuId === menuKey ? null : menuKey)}
                            className={iconBtn}
                            title="File actions"
                            aria-expanded={rowMenuId === menuKey}
                          >
                            <MoreHorizontal size={18} strokeWidth={2} />
                          </button>
                          {rowMenuId === menuKey && (
                            <>
                              <button
                                type="button"
                                className="fixed inset-0 z-10 cursor-default"
                                aria-label="Close menu"
                                onClick={() => setRowMenuId(null)}
                              />
                              <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 py-1 shadow-xl shadow-slate-900/10 ring-1 ring-black/[0.04] backdrop-blur-md">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                                  onClick={() => {
                                    setRowMenuId(null);
                                    onViewFile(file);
                                  }}
                                >
                                  <Eye size={16} /> Preview
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                                  onClick={() => {
                                    setRowMenuId(null);
                                    onStartEditFile(file);
                                  }}
                                >
                                  <Pencil size={16} /> Rename
                                </button>
                                <a
                                  href={file.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                                  onClick={() => setRowMenuId(null)}
                                >
                                  <ExternalLink size={16} /> Open in Drive
                                </a>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
                                  onClick={() => {
                                    setRowMenuId(null);
                                    onDeleteFile(file);
                                  }}
                                >
                                  <Trash2 size={16} /> Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`${iconBtn} hidden text-teal-700 hover:border-teal-200 hover:bg-teal-50 xl:flex`}
                          title="Open in Google Drive"
                          aria-label={`Open ${file.name} in Google Drive`}
                        >
                          <ExternalLink size={17} strokeWidth={2} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
