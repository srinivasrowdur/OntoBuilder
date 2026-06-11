import { Check, Folder, Loader2, Save, X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { ProjectSummary } from "../types";

export function ProjectDrawer({
  canSave,
  message,
  onClose,
  onCreateProject,
  onOpenProject,
  onSaveProject,
  projects,
  saving,
  selectedProjectId,
}: {
  canSave: boolean;
  message: string | null;
  onClose: () => void;
  onCreateProject: (name: string, description?: string) => Promise<void>;
  onOpenProject: (projectId: string) => Promise<void>;
  onSaveProject: () => Promise<void>;
  projects: ProjectSummary[];
  saving: boolean;
  selectedProjectId: string | null;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function handleCreateProject(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || saving) {
      return;
    }
    try {
      await onCreateProject(trimmedName, description.trim() || undefined);
      setName("");
      setDescription("");
      setIsCreating(false);
    } catch {
      // Global app error state owns the rendered failure message.
    }
  }

  async function handleSaveProject() {
    try {
      await onSaveProject();
    } catch {
      // Global app error state owns the rendered failure message.
    }
  }

  async function handleOpenProject(projectId: string) {
    try {
      await onOpenProject(projectId);
      onClose();
    } catch {
      // Global app error state owns the rendered failure message.
    }
  }

  return (
    <div className="project-drawer-shell" role="presentation">
      <button
        aria-label="Close projects"
        className="project-drawer-scrim"
        onClick={onClose}
        type="button"
      />
      <aside className="project-drawer" aria-label="Projects">
        <div className="project-drawer-header">
          <div>
            <span>Workspace</span>
            <strong>Projects</strong>
          </div>
          <button aria-label="Close projects" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="project-drawer-actions">
          <button
            disabled={saving}
            onClick={() => setIsCreating((current) => !current)}
            type="button"
          >
            <Folder size={15} />
            New Project
          </button>
          <button
            disabled={!canSave || saving}
            onClick={() => void handleSaveProject()}
            type="button"
          >
            {saving ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
            Save Current
          </button>
        </div>

        {isCreating ? (
          <form className="project-create-form" onSubmit={handleCreateProject}>
            <input
              aria-label="Project name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Project name"
              value={name}
            />
            <input
              aria-label="Project description"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description"
              value={description}
            />
            <button disabled={!name.trim() || saving} type="submit">
              <Check size={14} />
              Create
            </button>
          </form>
        ) : null}

        {message ? <p className="project-message">{message}</p> : null}

        <div className="project-list" aria-label="Saved projects">
          {projects.length === 0 ? (
            <p>No projects yet.</p>
          ) : (
            projects.map((project) => (
              <button
                className={selectedProjectId === project.id ? "active" : ""}
                key={project.id}
                onClick={() => void handleOpenProject(project.id)}
                type="button"
              >
                <strong>{project.name}</strong>
                <span>{project.domain ?? "No ontology saved"}</span>
                <small>
                  {project.statement_count > 0
                    ? `${project.entity_count} entities · ${project.statement_count} statements`
                    : "Empty project"}
                </small>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
