'use client'

import { useRef } from 'react'
import Editor from '@monaco-editor/react'

interface MonacoEditorProps {
  value: string
  onChange: (value: string | undefined) => void
  language?: string
  height?: string
  theme?: string
}

export default function MonacoEditor({
  value,
  onChange,
  language = 'javascript',
  height = '400px',
  theme = 'vs-dark'
}: MonacoEditorProps) {
  const editorRef = useRef(null)

  function handleEditorDidMount(editor: any, monaco: any) {
    editorRef.current = editor

    // Configure Monaco themes
    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1f2937',
      }
    })

    monaco.editor.defineTheme('custom-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#ffffff',
      }
    })

    // Set up language configurations
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
    })

    // Add Solidity language support
    monaco.languages.register({ id: 'solidity' })
    monaco.languages.setMonarchTokensProvider('solidity', {
      tokenizer: {
        root: [
          [/\b(contract|function|pragma|solidity|import|from|public|private|internal|external|view|pure|payable|returns|uint|int|address|string|bool|bytes|mapping)\b/, 'keyword'],
          [/\b(msg|block|tx)\b/, 'keyword'],
          [/\/\/.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/"([^"\\]|\\.)*$/, 'string.invalid'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/'[^\\']'/, 'string'],
          [/0[xX][0-9a-fA-F]+/, 'number.hex'],
          [/\d+/, 'number'],
        ],
        comment: [
          [/[^\/*]+/, 'comment'],
          [/\*\//, 'comment', '@pop'],
          [/[\/*]/, 'comment']
        ]
      }
    })
  }

  const getMonacoTheme = (theme: string) => {
    switch (theme) {
      case 'vs-light':
        return 'custom-light'
      case 'vs-dark':
      default:
        return 'custom-dark'
    }
  }

  return (
    <Editor
      height={height}
      language={language}
      value={value}
      onChange={onChange}
      onMount={handleEditorDidMount}
      theme={getMonacoTheme(theme)}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        wordWrap: 'on',
        folding: true,
        lineDecorationsWidth: 10,
        lineNumbersMinChars: 3,
        glyphMargin: false,
        contextmenu: true,
        quickSuggestions: true,
        parameterHints: {
          enabled: true
        },
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: 'on',
        hover: {
          enabled: true
        },
        matchBrackets: 'always',
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        formatOnPaste: true,
        formatOnType: true,
      }}
    />
  )
}