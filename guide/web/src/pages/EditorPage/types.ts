export type ToolKey = 'avatar' | 'text' | 'media' | 'generate';
export type InspectorTab = 'design' | 'motion' | 'layers' | 'object';

import type { ConfigDiagnostics, DSL } from '@shared/types/editor';

export type RenderControlProps = {
  dsl: DSL;
  editorId?: string;
  inputMode: 'template' | 'topic' | 'script';
  setInputMode: (mode: 'template' | 'topic' | 'script') => void;
  topic: string;
  setTopic: (value: string) => void;
  scriptText: string;
  setScriptText: (value: string) => void;
  selectedDhId: string;
  variableValues: Record<string, string>;
  setVariableValues: (values: Record<string, string>) => void;
  onRender: () => void;
  diagnostics: ConfigDiagnostics | null;
  onPickScript?: () => void;
};
