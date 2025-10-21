import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface LazyEditorProps {
  value: string;
  language?: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

const LazyCodeMirrorEditor: React.FC<LazyEditorProps> = ({ value, language, onChange, readOnly }) => {
  const extensions = React.useMemo(() => {
    const lang = (language || "").toLowerCase();
    if (lang.includes("ts") || lang.includes("js")) {
      return [javascript({ jsx: true, typescript: true }), EditorView.lineWrapping];
    }
    if (lang.includes("md") || lang.includes("markdown")) {
      return [markdown(), EditorView.lineWrapping];
    }
    return [EditorView.lineWrapping];
  }, [language]);

  return (
    <div className="h-full w-full min-h-0">
      <ScrollArea className="h-full w-full">
        <CodeMirror
          value={value}
          theme="dark"
          height="100%"
          onChange={(val: string) => onChange(val)}
          readOnly={readOnly}
          basicSetup={{ lineNumbers: true }}
          extensions={extensions}
        />
      </ScrollArea>
    </div>
  );
};

export default LazyCodeMirrorEditor;
