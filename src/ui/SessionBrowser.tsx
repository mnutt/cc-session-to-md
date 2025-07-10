import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { SessionParser } from '../parsers/SessionParser.js';
import { MarkdownFormatter } from '../formatters/MarkdownFormatter.js';
import { SessionInfo, ProjectInfo } from '../types/index.js';
import { formatRelativeTime } from '../utils/time.js';
import { normalizePath, makeRelativeToHome } from '../utils/paths.js';
import { copyToClipboard } from '../utils/clipboard.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface SessionBrowserProps {
  projectsDir: string;
}

interface SessionBrowserState {
  mode: 'projects' | 'sessions' | 'loading';
  projects: ProjectInfo[];
  sessions: SessionInfo[];
  selectedProject?: ProjectInfo;
  selectedIndex: number;
  filter: string;
  error?: string;
}

export class SessionBrowser {
  private projectsDir: string;

  constructor(projectsDir: string = '~/.claude/projects') {
    this.projectsDir = normalizePath(projectsDir);
  }

  async run(): Promise<void> {
    return new Promise((resolve, reject) => {
      const App = () => <SessionBrowserApp projectsDir={this.projectsDir} onExit={resolve} onError={reject} />;
      render(<App />);
    });
  }
}

const SessionBrowserApp: React.FC<{
  projectsDir: string;
  onExit: () => void;
  onError: (error: Error) => void;
}> = ({ projectsDir, onExit, onError }) => {
  const [state, setState] = useState<SessionBrowserState>({
    mode: 'loading',
    projects: [],
    sessions: [],
    selectedIndex: 0,
    filter: ''
  });

  const { exit } = useApp();

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setState(prev => ({ ...prev, mode: 'loading' }));
      
      if (!fs.existsSync(projectsDir)) {
        setState(prev => ({ 
          ...prev, 
          mode: 'projects', 
          error: `Claude projects directory not found: ${projectsDir}` 
        }));
        return;
      }

      const projectDirs = fs.readdirSync(projectsDir)
        .filter(dir => !dir.startsWith('.'))
        .filter(dir => fs.statSync(path.join(projectsDir, dir)).isDirectory());

      if (projectDirs.length === 0) {
        setState(prev => ({ 
          ...prev, 
          mode: 'projects', 
          error: `No projects found in ${projectsDir}` 
        }));
        return;
      }

      const projects: ProjectInfo[] = [];

      for (const dir of projectDirs) {
        const fullPath = path.join(projectsDir, dir);
        const stats = fs.statSync(fullPath);
        const jsonlFiles = fs.readdirSync(fullPath).filter(file => file.endsWith('.jsonl'));
        
        if (jsonlFiles.length === 0) continue;

        // Get CWD from any file in the directory by peeking at the first line with CWD
        let cwd: string | null = null;
        
        // Try each file until we find a CWD
        for (const jsonlFile of jsonlFiles) {
          const filePath = path.join(fullPath, jsonlFile);
          
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            
            for (const line of lines) {
              if (!line.trim()) continue;
              
              try {
                const data = JSON.parse(line);
                if (data.cwd) {
                  cwd = data.cwd;
                  break;
                }
              } catch (parseError) {
                // Skip invalid JSON lines
                continue;
              }
            }
            
            // If we found a CWD, stop looking
            if (cwd) break;
          } catch (fileError) {
            console.error(`Error reading file ${filePath}:`, fileError);
            continue;
          }
        }

        // If no CWD found, fall back to the original directory name display logic
        const displayName = cwd 
          ? makeRelativeToHome(cwd)
          : dir.replace(/-/g, '/').replace(/_/g, ' ');
        
        projects.push({
          name: dir,
          path: fullPath,
          displayName,
          sessionCount: jsonlFiles.length,
          lastModified: stats.mtime
        });
      }

      projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

      setState(prev => ({ 
        ...prev, 
        mode: 'projects', 
        projects,
        selectedIndex: 0,
        error: undefined
      }));
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const loadSessions = async (project: ProjectInfo) => {
    try {
      setState(prev => ({ ...prev, mode: 'loading' }));
      
      const jsonlFiles = fs.readdirSync(project.path)
        .filter(file => file.endsWith('.jsonl'))
        .map(file => path.join(project.path, file))
        .sort()
        .reverse();

      if (jsonlFiles.length === 0) {
        setState(prev => ({ 
          ...prev, 
          mode: 'sessions', 
          error: `No session files found in ${project.path}` 
        }));
        return;
      }

      const parser = new SessionParser();
      const sessions = parser.parseFiles(jsonlFiles);

      setState(prev => ({ 
        ...prev, 
        mode: 'sessions', 
        sessions,
        selectedProject: project,
        selectedIndex: 0,
        error: undefined
      }));
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const processSession = async (session: SessionInfo) => {
    try {
      setState(prev => ({ ...prev, mode: 'loading' }));
      
      const projectDir = path.dirname(session.file);
      const jsonlFiles = fs.readdirSync(projectDir)
        .filter(file => file.endsWith('.jsonl'))
        .map(file => path.join(projectDir, file))
        .sort();

      const parser = new SessionParser();
      const sessionData = parser.getSessionData(session.sessionId, jsonlFiles);
      
      const formatter = new MarkdownFormatter();
      const markdown = formatter.convertInput(sessionData);
      
      console.log(markdown);
      
      await copyToClipboard(markdown);
      console.log('\n📋 Copied to clipboard');
      
      exit();
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const filteredItems = state.mode === 'projects' 
    ? state.projects.filter(project => 
        state.filter === '' || project.displayName.toLowerCase().includes(state.filter.toLowerCase())
      )
    : state.sessions.filter(session => 
        state.filter === '' || session.summary.toLowerCase().includes(state.filter.toLowerCase())
      );

  const maxIndex = Math.max(0, filteredItems.length - 1);
  const clampedIndex = Math.min(state.selectedIndex, maxIndex);

  useInput((input: string, key: any) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    if (key.escape) {
      if (state.mode === 'sessions') {
        setState(prev => ({ 
          ...prev, 
          mode: 'projects',
          selectedIndex: 0,
          filter: '',
          error: undefined
        }));
      } else {
        exit();
      }
      return;
    }

    if (key.return) {
      if (state.mode === 'projects' && filteredItems.length > 0) {
        const selectedProject = filteredItems[clampedIndex] as ProjectInfo;
        loadSessions(selectedProject);
      } else if (state.mode === 'sessions' && filteredItems.length > 0) {
        const selectedSession = filteredItems[clampedIndex] as SessionInfo;
        processSession(selectedSession);
      }
      return;
    }

    if (key.upArrow) {
      setState(prev => ({ 
        ...prev, 
        selectedIndex: Math.max(0, prev.selectedIndex - 1) 
      }));
      return;
    }

    if (key.downArrow) {
      setState(prev => ({ 
        ...prev, 
        selectedIndex: Math.min(maxIndex, prev.selectedIndex + 1) 
      }));
      return;
    }

    if (key.backspace) {
      setState(prev => ({ 
        ...prev, 
        filter: prev.filter.slice(0, -1),
        selectedIndex: 0
      }));
      return;
    }

    if (input && input.length === 1 && /[a-zA-Z0-9\s]/.test(input)) {
      setState(prev => ({ 
        ...prev, 
        filter: prev.filter + input,
        selectedIndex: 0
      }));
      return;
    }
  });

  if (state.mode === 'loading') {
    return <LoadingScreen />;
  }

  if (state.error) {
    return <ErrorScreen error={state.error} onExit={exit} />;
  }

  if (state.mode === 'projects') {
    return (
      <ProjectList 
        projects={filteredItems as ProjectInfo[]} 
        selectedIndex={clampedIndex}
        filter={state.filter}
      />
    );
  }

  if (state.mode === 'sessions') {
    return (
      <SessionList 
        sessions={filteredItems as SessionInfo[]} 
        selectedIndex={clampedIndex}
        filter={state.filter}
        project={state.selectedProject!}
      />
    );
  }

  return null;
};

const LoadingScreen: React.FC = () => (
  <Box flexDirection="column" alignItems="center" justifyContent="center" minHeight={10}>
    <Text color="cyan">Loading...</Text>
  </Box>
);

const ErrorScreen: React.FC<{ error: string; onExit: () => void }> = ({ error, onExit }) => {
  useInput((input: string, key: any) => {
    if (key.return || key.escape) {
      onExit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="red">❌ Error: {error}</Text>
      <Text color="gray">Press Enter or Esc to exit</Text>
    </Box>
  );
};

const ProjectList: React.FC<{
  projects: ProjectInfo[];
  selectedIndex: number;
  filter: string;
}> = ({ projects, selectedIndex, filter }) => (
  <Box flexDirection="column">
    <TitleHeader />
    <Box flexDirection="column" marginY={1}>
      <Text color="cyan" bold>Select a project:</Text>
      <Box flexDirection="column" marginTop={1}>
        {projects.map((project, index) => (
          <Box key={project.name}>
            <Text color={index === selectedIndex ? "black" : "white"} 
                  backgroundColor={index === selectedIndex ? "cyan" : undefined}>
              {index === selectedIndex ? "❯ " : "  "}
              {project.displayName}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
    <FooterControls filter={filter} itemCount={projects.length} />
  </Box>
);

const SessionList: React.FC<{
  sessions: SessionInfo[];
  selectedIndex: number;
  filter: string;
  project: ProjectInfo;
}> = ({ sessions, selectedIndex, filter, project }) => {
  // Calculate maximum width for each column to ensure proper alignment
  const modifiedWidth = Math.max(8, ...sessions.map(s => formatRelativeTime(s.modified).length));
  const createdWidth = Math.max(7, ...sessions.map(s => formatRelativeTime(s.created).length));
  const messagesWidth = Math.max(8, ...sessions.map(s => s.messageCount.toString().length));
  
  return (
    <Box flexDirection="column">
      <TitleHeader />
      <Box marginY={1}>
        <Text color="cyan" bold>Sessions in {project.displayName}:</Text>
      </Box>
      <Box flexDirection="column">
        <Box>
          <Text color="gray" bold>
            {"Modified".padEnd(modifiedWidth)} {"Created".padEnd(createdWidth)} {"Messages".padStart(messagesWidth)}  Summary
          </Text>
        </Box>
        {sessions.map((session, index) => (
          <Box key={session.sessionId}>
            <Text 
              color={index === selectedIndex ? "black" : "white"} 
              backgroundColor={index === selectedIndex ? "cyan" : undefined}
              wrap="truncate"
            >
              {index === selectedIndex ? "❯ " : "  "}
              {formatRelativeTime(session.modified).padEnd(modifiedWidth)} {formatRelativeTime(session.created).padEnd(createdWidth)} {session.messageCount.toString().padStart(messagesWidth)}  {session.summary}
            </Text>
          </Box>
        ))}
      </Box>
      <FooterControls filter={filter} itemCount={sessions.length} showBackOption />
    </Box>
  );
};

const TitleHeader: React.FC = () => (
  <Box flexDirection="column" marginBottom={1}>
    <Text color="cyan">
      {`   ██████╗ ██████╗ ██████╗███╗   ███╗██████╗`}
    </Text>
    <Text color="cyan">
      {`  ██╔════╝██╔════╝╚════██╗████╗ ████║██╔══██╗`}
    </Text>
    <Text color="cyan">
      {`  ██║     ██║      █████╔╝██╔████╔██║██║  ██║`}
    </Text>
    <Text color="cyan">
      {`  ██║     ██║     ██╔═══╝ ██║╚██╔╝██║██║  ██║`}
    </Text>
    <Text color="cyan">
      {`  ╚██████╗╚██████╗███████╗██║ ╚═╝ ██║██████╔╝`}
    </Text>
    <Text color="cyan">
      {`   ╚═════╝ ╚═════╝╚══════╝╚═╝     ╚═╝╚═════╝`}
    </Text>
    <Text color="gray" dimColor>          Claude Code Session to Markdown</Text>
  </Box>
);

const FooterControls: React.FC<{
  filter: string;
  itemCount: number;
  showBackOption?: boolean;
}> = ({ filter, itemCount, showBackOption = false }) => (
  <Box flexDirection="column" marginTop={1}>
    {filter && (
      <Text color="yellow">Filter: {filter}</Text>
    )}
    <Text color="gray">
      Use ↑/↓ arrows to navigate, type to filter, Enter to select
      {showBackOption && ", Esc to go back"}
      {!showBackOption && ", Esc to quit"}
    </Text>
    <Text color="gray">{itemCount} items</Text>
  </Box>
);

export default SessionBrowser;