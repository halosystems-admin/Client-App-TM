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
  <div className="space-y-2.5">
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex items-center rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 animate-pulse">
        <div className="w-9 h-9 bg-slate-100 rounded-lg mr-2.5" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-slate-100 rounded w-2/3" />
          <div className="h-2.5 bg-slate-50 rounded w-1/3" />
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {!isAtRoot && (
            <button
              type="button"
              onClick={onNavigateBack}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-teal-50 hover:text-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
              title="Go back"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.id}>
              {index > 0 && <ChevronRight size={12} className="shrink-0 text-slate-300" />}
              <button
                onClick={() => onNavigateToBreadcrumb(index)}
                className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium transition-colors whitespace-nowrap ${
                  index === breadcrumbs.length - 1
                    ? 'text-teal-700'
                    : 'text-slate-400 hover:text-teal-600'
                }`}
              >
                {index === 0 && <Home size={12} className="shrink-0" />}
                {index === 0 && breadcrumbs.length > 1 ? 'Root' : crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>
        <button
          type="button"
          onClick={onCreateFolder}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-slate-900/[0.04] px-3 text-xs font-medium text-slate-600 transition-all hover:bg-teal-50 hover:text-teal-700 active:scale-[0.97]"
        >
          <FolderPlus size={14} className="text-teal-600" strokeWidth={2} /> New Folder
        </button>
      </div>

      {/* File / folder listing */}
      <div className="grid grid-cols-1 gap-2">
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
                    className="group relative flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 transition-all duration-150 hover:border-slate-300/80 hover:shadow-sm sm:gap-2.5 sm:px-3.5"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 cursor-pointer items-center rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
                      onClick={() => {
                        setRowMenuId(null);
                        onNavigateToFolder(folder);
                      }}
                    >
                      <div className="mr-2.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                        <FolderOpen className="h-[18px] w-[18px]" strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1 pr-1">
                        <h4 className="truncate text-sm font-semibold text-slate-800 transition-colors group-hover:text-teal-700">{folder.name}</h4>
                        <p className="mt-0.5 text-[11px] text-slate-400">Folder · {folder.createdTime}</p>
                      </div>
                      <ChevronRight size={16} className="ml-0.5 shrink-0 text-slate-300 transition-colors group-hover:text-teal-500" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRowMenuId(null);
                        onStartEditFile(folder);
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-teal-600 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
                      title="Rename folder"
                      aria-label={`Rename ${folder.name}`}
                    >
                      <Pencil size={14} strokeWidth={2} />
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
                    'flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-teal-600 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40';
                  return (
                    <div key={file.id} className="group relative flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 transition-all duration-150 hover:border-slate-300/80 hover:shadow-sm sm:gap-2.5 sm:px-3.5">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
                        <IconComponent className="h-[18px] w-[18px]" strokeWidth={2} />
                      </div>
                      <button
                        type="button"
                        className="min-w-0 flex-1 cursor-pointer rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
                        onClick={() => onViewFile(file)}
                      >
                        <h4 className="truncate text-sm font-semibold text-slate-800 transition-colors group-hover:text-teal-700">{file.name}</h4>
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">{file.createdTime} · {getFriendlyFileType(file.mimeType)}</p>
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
                            <Eye size={15} strokeWidth={2} />
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
                            <Pencil size={15} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteFile(file);
                            }}
                            className={`${iconBtn} text-rose-500 hover:bg-rose-50 hover:text-rose-600`}
                            title="Delete"
                            aria-label={`Delete ${file.name}`}
                          >
                            <Trash2 size={15} strokeWidth={2} />
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
                            <MoreHorizontal size={16} strokeWidth={2} />
                          </button>
                          {rowMenuId === menuKey && (
                            <>
                              <button
                                type="button"
                                className="fixed inset-0 z-10 cursor-default"
                                aria-label="Close menu"
                                onClick={() => setRowMenuId(null)}
                              />
                              <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200/70 bg-white/95 py-1 shadow-lg shadow-slate-900/8 backdrop-blur-md">
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
