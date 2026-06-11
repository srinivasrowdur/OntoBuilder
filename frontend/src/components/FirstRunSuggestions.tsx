import { Folder, Upload } from "lucide-react";
import type { ProjectSummary } from "../types";

export const EXAMPLE_PROMPTS = [
  {
    title: "Pension schemes",
    prompt: "Build an ontology for workplace pension schemes",
  },
  {
    title: "Insurance claims",
    prompt: "Build an ontology for insurance claims handling",
  },
  {
    title: "Clinical referrals",
    prompt: "Build an ontology for hospital referrals focused on prior authorization",
  },
  {
    title: "Music festivals",
    prompt: "Build an ontology for organising music festivals",
  },
];

export function FirstRunSuggestions({
  onGenerateExample,
  onLoadSample,
  onProjectOpen,
  projects,
}: {
  onGenerateExample: (text: string) => void;
  onLoadSample: () => void;
  onProjectOpen: (projectId: string) => Promise<void>;
  projects: ProjectSummary[];
}) {
  const recentProjects = projects.filter((project) => project.draft_id).slice(0, 3);

  return (
    <div className="first-run-suggestions">
      <div className="example-prompts" aria-label="Example ontologies">
        {EXAMPLE_PROMPTS.map((example) => (
          <button
            key={example.title}
            onClick={() => onGenerateExample(example.prompt)}
            type="button"
          >
            <strong>{example.title}</strong>
            <span>{example.prompt}</span>
          </button>
        ))}
      </div>
      <div className="first-run-secondary">
        <button className="first-run-sample" onClick={onLoadSample} type="button">
          <Upload size={14} />
          Load the retirements sample — no API key needed
        </button>
        {recentProjects.length > 0 ? (
          <div className="first-run-recents" aria-label="Recent projects">
            <span>Recent:</span>
            {recentProjects.map((project) => (
              <button key={project.id} onClick={() => void onProjectOpen(project.id)} type="button">
                <Folder size={13} />
                {project.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
