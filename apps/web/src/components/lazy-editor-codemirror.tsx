import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { type Language, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";

export interface LazyEditorProps {
  value: string;
  language?: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

// TS parser is a superset of JS, so a single instance covers both.
const jsLanguage = javascript({ jsx: true, typescript: true });

// Highlight fenced code blocks inside markdown for the languages we bundle.
// Anything else stays plain rather than pulling in lazy-loaded grammars.
const fenceLanguage = (info: string): Language | null => {
  const id = info.trim().toLowerCase();
  if (
    [
      "js",
      "jsx",
      "mjs",
      "cjs",
      "javascript",
      "node",
      "ts",
      "tsx",
      "typescript",
      "json",
      "jsonc",
      "json5",
    ].includes(id)
  ) {
    return jsLanguage.language;
  }
  return null;
};

// Resolve the app's effective theme by reading the `.dark` class the
// ThemeProvider paints onto <html> — the ground truth, already resolved from
// light / dark / system. A MutationObserver keeps it reactive to live toggles.
function useResolvedDarkMode(): boolean {
  const [isDark, setIsDark] = React.useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  React.useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

const LazyCodeMirrorEditor: React.FC<LazyEditorProps> = ({
  value,
  language,
  onChange,
  readOnly,
}) => {
  const isDark = useResolvedDarkMode();

  const extensions = React.useMemo(() => {
    const lang = (language || "").toLowerCase();
    // getLanguageFromPath returns ids like "typescript" / "javascript" / "markdown",
    // so match the whole id rather than substrings ("typescript" has no "ts" substring).
    const jsIds = ["typescript", "javascript", "ts", "tsx", "js", "jsx", "mjs", "cjs", "node"];
    const jsonIds = ["json", "jsonc", "json5"];
    const mdIds = ["markdown", "md", "mdx"];
    const languageExtension = [...jsIds, ...jsonIds].includes(lang)
      ? [jsLanguage]
      : mdIds.includes(lang)
        ? [markdown({ codeLanguages: fenceLanguage })]
        : [];

    // Own the highlight style explicitly (basicSetup's is disabled below) so
    // exactly one mode-appropriate palette applies. oneDark bundles its own
    // chrome + highlight; light mode pairs the default chrome with the default
    // (light-oriented) highlight style.
    const themeExtension = isDark ? oneDark : syntaxHighlighting(defaultHighlightStyle);

    return [...languageExtension, EditorView.lineWrapping, themeExtension];
  }, [language, isDark]);

  // CodeMirror owns its own scroller (.cm-scroller, overflow:auto), so it must
  // not sit inside a Radix ScrollArea — that wrapper's display:table viewport
  // shrink-wraps to content height and leaves the editor short of the modal.
  return (
    <div className="h-full min-h-0 w-full">
      <CodeMirror
        value={value}
        theme="none"
        height="100%"
        className="h-full"
        onChange={(val: string) => onChange(val)}
        readOnly={readOnly}
        basicSetup={{ lineNumbers: true, syntaxHighlighting: false }}
        extensions={extensions}
      />
    </div>
  );
};

export default LazyCodeMirrorEditor;
