import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { api, Project, ProjectFile, Chat } from "@/services/api";
import ConfirmDialog from "@/components/deiza/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  X, FolderOpen, FileText, Image as ImageIcon, FileCode, Trash2, Upload,
  Plus, MessageSquare, Loader2, Sparkles, Check, Pin, Pencil, GripVertical,
  MoreHorizontal, Star
} from "lucide-react";

interface ProjectPanelProps {
  projectId: number | null;
  open: boolean;
  onClose: () => void;
  onNewChat: (projectId: number) => void;
  onOpenChat: (chatId: number) => void;
  onDeleted: () => void;
  language: string;
}

const fileIcon = (f: ProjectFile) => {
  if (f.is_image) return <ImageIcon className="w-4 h-4 text-secondary shrink-0" />;
  const ext = f.name.split(".").pop()?.toLowerCase() || "";
  if (["pdf", "docx", "doc", "txt", "md"].includes(ext)) return <FileText className="w-4 h-4 text-primary/70 shrink-0" />;
  return <FileCode className="w-4 h-4 text-muted-foreground shrink-0" />;
};

/**
 * Enhanced Project detail panel with clean file management:
 * - Rename files inline
 * - Pin/unpin files (pinned files appear first)
 * - Delete with confirmation
 * - Visual feedback for all actions
 */
const ProjectPanel = ({ projectId, open, onClose, onNewChat, onOpenChat, onDeleted, language }: ProjectPanelProps) => {
  const { t } = useLanguage();
  void language;
  const [project, setProject] = useState<Project | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [name, setName] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // File management states
  const [editingFileId, setEditingFileId] = useState<number | null>(null);
  const [editingFileName, setEditingFileName] = useState("");
  const [deletingFileId, setDeletingFileId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await api.getProject(projectId);
      // Sort files: pinned first, then by date
      const sortedFiles = [...(res.project.files || [])].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
      });
      setProject({ ...res.project, files: sortedFiles });
      setChats(res.chats);
      setInstructions(res.project.instructions || "");
      setName(res.project.name);
    } catch {
      toast.error(t("prj.err.load"));
      onClose();
    } finally {
      setLoading(false);
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open && projectId) load(); }, [open, projectId, load]);

  // Debounced auto-save for name + instructions
  const scheduleSave = (patch: { name?: string; instructions?: string }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!projectId) return;
      try {
        await api.updateProject(projectId, patch);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      } catch { /* silent */ }
    }, 800);
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || !projectId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const up = await api.uploadFile(file);
        await api.addProjectFile(projectId, {
          name: up.filename,
          mime_type: up.mime_type || file.type,
          content: up.content || "",
          raw_bytes: up.raw_bytes,
          is_image: up.is_image,
        });
      }
      toast.success(t("prj.ok.added"));
      load();
    } catch (e: any) {
      const msg = e?.message || "";
      toast.error(msg.includes("file_limit") || msg.includes("limite")
        ? t("prj.err.filelimit")
        : t("prj.err.upload"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Start editing a file name
  const startRenameFile = (file: ProjectFile) => {
    setEditingFileId(file.id);
    setEditingFileName(file.name);
  };

  // Save file rename
  const saveRenameFile = async (fid: number) => {
    if (!projectId || !editingFileName.trim()) return;
    setActionLoading(fid);
    try {
      await api.renameProjectFile(projectId, fid, editingFileName.trim());
      toast.success("Archivo renombrado");
      setEditingFileId(null);
      load();
    } catch {
      toast.error("Error al renombrar");
    } finally {
      setActionLoading(null);
    }
  };

  // Cancel rename
  const cancelRenameFile = () => {
    setEditingFileId(null);
    setEditingFileName("");
  };

  // Toggle pin status
  const togglePinFile = async (fid: number, currentPinned: boolean) => {
    if (!projectId) return;
    setActionLoading(fid);
    try {
      await api.pinProjectFile(projectId, fid, !currentPinned);
      toast.success(currentPinned ? "Archivo desfijado" : "Archivo fijado");
      load();
    } catch {
      toast.error("Error al cambiar estado");
    } finally {
      setActionLoading(null);
    }
  };

  // Delete file with confirmation
  const confirmDeleteFile = (fid: number) => {
    setDeletingFileId(fid);
  };

  const executeDeleteFile = async () => {
    if (!projectId || !deletingFileId) return;
    setActionLoading(deletingFileId);
    try {
      await api.deleteProjectFile(projectId, deletingFileId);
      toast.success("Archivo eliminado");
      setDeletingFileId(null);
      setProject(p => p ? { ...p, files: (p.files || []).filter(f => f.id !== deletingFileId), file_count: p.file_count - 1 } : p);
    } catch {
      toast.error("Error al eliminar");
    } finally {
      setActionLoading(null);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const handleDeleteProject = async () => {
    if (!projectId) return;
    setConfirmDelete(false);
    try {
      await api.deleteProject(projectId);
      toast.success(t("prj.ok.deleted"));
      onDeleted();
      onClose();
    } catch { toast.error(t("prj.err.deleteproject")); }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} aria-hidden="true"
          />
          <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center sm:p-6 pointer-events-none">
          <motion.div
            role="dialog" aria-label={name}
            className="pointer-events-auto w-full sm:w-[640px] sm:max-w-[92vw] max-h-[92dvh] sm:max-h-[84vh]
                       bg-card parchment-texture rounded-t-3xl sm:rounded-3xl deiza-shadow-lg deiza-border overflow-hidden flex flex-col"
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            {/* Header */}
            <div className="shrink-0 border-b border-border/15 bg-gradient-to-r from-primary/[0.06] via-transparent to-transparent">
              <div className="flex items-center gap-3 px-5 pt-4 pb-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 deiza-border">
                  <FolderOpen className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    value={name}
                    onChange={e => { setName(e.target.value); scheduleSave({ name: e.target.value }); }}
                    className="w-full font-display text-lg sm:text-xl bg-transparent outline-none text-foreground border-b border-transparent focus:border-primary/30 transition-colors"
                    aria-label={t("prj.name")}
                  />
                  <p className="font-body text-[10px] text-muted-foreground/50 mt-0.5">
                    {(project?.files?.length || 0)} {t("prj.files")} · {chats.length} {t("prj.chat")}{chats.length !== 1 ? "s" : ""}
                    {savedFlash && <span className="ml-2 text-green-500">{t("prj.saved")}</span>}
                  </p>
                </div>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors focus-ring shrink-0" aria-label={t("artifact.close")}>
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {loading && !project ? (
              <div className="flex-1 flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 pb-safe">
                {/* Instructions */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary/70" />
                    <h3 className="font-body text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                      {t("prj.instructions")}
                    </h3>
                  </div>
                  <textarea
                    value={instructions}
                    onChange={e => { setInstructions(e.target.value); scheduleSave({ instructions: e.target.value }); }}
                    placeholder={t("prj.instructions.ph")}
                    rows={3}
                    className="w-full bg-muted/20 deiza-border rounded-2xl px-4 py-3 font-body text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-y placeholder:text-muted-foreground/50 leading-relaxed"
                  />
                  <p className="font-body text-[10px] text-muted-foreground/50 mt-1">
                    {t("prj.instructions.desc")}
                  </p>
                </div>

                {/* Files Section - Enhanced UI */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-body text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                      {t("prj.knowledge")} <span className="text-muted-foreground/50 font-normal normal-case">· {project?.files?.length || 0} {t("prj.files")}</span>
                    </h3>
                    <input ref={fileInputRef} type="file" multiple className="hidden" aria-hidden="true" tabIndex={-1}
                      onChange={e => handleUpload(e.target.files)} />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-body text-[11px] font-medium transition-colors focus-ring disabled:opacity-50"
                    >
                      {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      {t("prj.upload")}
                    </button>
                  </div>
                  {(project?.files?.length || 0) === 0 ? (
                    <p className="font-body text-xs text-muted-foreground/60 italic bg-muted/10 rounded-2xl px-4 py-5 text-center deiza-border">
                      {t("prj.upload.desc")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {project!.files!.map(f => (
                        <div 
                          key={f.id} 
                          className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted/15 deiza-border hover:bg-muted/25 transition-all ${f.pinned ? "ring-1 ring-primary/30 bg-primary/[0.03]" : ""}`}
                        >
                          {/* Drag handle */}
                          <GripVertical className="w-3 h-3 text-muted-foreground/20 shrink-0 cursor-grab" />
                          
                          {/* File icon */}
                          {fileIcon(f)}
                          
                          {/* File name - editable */}
                          <div className="flex-1 min-w-0">
                            {editingFileId === f.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editingFileName}
                                  onChange={(e) => setEditingFileName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveRenameFile(f.id);
                                    if (e.key === "Escape") cancelRenameFile();
                                  }}
                                  autoFocus
                                  className="flex-1 min-w-0 font-body text-xs bg-background border border-primary/30 rounded px-2 py-1 outline-none"
                                />
                                <button 
                                  onClick={() => saveRenameFile(f.id)}
                                  disabled={actionLoading === f.id}
                                  className="p-1 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                                >
                                  {actionLoading === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                </button>
                                <button 
                                  onClick={cancelRenameFile}
                                  className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="font-body text-xs text-foreground/85 truncate flex items-center gap-1.5">
                                {f.name}
                                {f.pinned && <Star className="w-3 h-3 text-primary fill-primary" />}
                              </span>
                            )}
                          </div>
                          
                          {/* File size/type */}
                          <span className="font-body text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
                            {f.is_image ? t("prj.image") : `${Math.max(1, Math.round(f.size_chars / 1000))}k`}
                          </span>
                          
                          {/* Action buttons */}
                          {editingFileId !== f.id && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {/* Pin button */}
                              <button 
                                onClick={() => togglePinFile(f.id, f.pinned)}
                                disabled={actionLoading === f.id}
                                className={`p-1.5 rounded-full transition-colors focus-ring shrink-0 ${f.pinned ? "text-primary bg-primary/10" : "text-muted-foreground/40 hover:text-primary hover:bg-primary/10"}`}
                                title={f.pinned ? "Desfijar" : "Fijar"}
                              >
                                {actionLoading === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pin className={`w-3 h-3 ${f.pinned ? "fill-current" : ""}`} />}
                              </button>
                              
                              {/* Rename button */}
                              <button 
                                onClick={() => startRenameFile(f)}
                                disabled={actionLoading === f.id}
                                className="p-1.5 rounded-full text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors focus-ring shrink-0"
                                title="Renombrar"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              
                              {/* Delete button */}
                              <button 
                                onClick={() => confirmDeleteFile(f.id)}
                                disabled={actionLoading === f.id}
                                className="p-1.5 rounded-full text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors focus-ring shrink-0"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Chats */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-body text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                      {t("prj.chats")}
                    </h3>
                    <button
                      onClick={() => { if (projectId) { onNewChat(projectId); onClose(); } }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-body text-[11px] font-medium hover:bg-primary/90 transition-colors focus-ring"
                    >
                      <Plus className="w-3 h-3" />
                      {t("prj.newchat")}
                    </button>
                  </div>
                  {chats.length === 0 ? (
                    <p className="font-body text-xs text-muted-foreground/60 italic px-1">
                      {t("prj.nochats")}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {chats.map(c => (
                        <button key={c.id} onClick={() => { onOpenChat(c.id); onClose(); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors focus-ring text-left">
                          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                          <span className="flex-1 min-w-0 font-body text-xs text-foreground/85 truncate">{c.title}</span>
                          <span className="font-body text-[10px] text-muted-foreground/40 shrink-0">{c.message_count} msg</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Danger zone */}
                <div className="pt-2 border-t border-border/15">
                  <button onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-2 font-body text-xs text-muted-foreground/60 hover:text-destructive transition-colors focus-ring rounded px-1 py-1">
                    <Trash2 className="w-3 h-3" />
                    {t("prj.delete")}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
          </div>
          
          {/* Delete Project Confirmation */}
          <ConfirmDialog
            open={confirmDelete}
            title={t("prj.confirm.title")}
            message={t("prj.confirm.message", { name })}
            confirmLabel={t("prj.delete")}
            cancelLabel={t("prj.cancel")}
            destructive
            onCancel={() => setConfirmDelete(false)}
            onConfirm={handleDeleteProject}
          />
          
          {/* Delete File Confirmation */}
          <ConfirmDialog
            open={deletingFileId !== null}
            title="Eliminar archivo"
            message="¿Estás seguro de que quieres eliminar este archivo? Esta acción no se puede deshacer."
            confirmLabel="Eliminar"
            cancelLabel="Cancelar"
            destructive
            onCancel={() => setDeletingFileId(null)}
            onConfirm={executeDeleteFile}
          />
        </>
      )}
    </AnimatePresence>
  );
};

export default ProjectPanel;
