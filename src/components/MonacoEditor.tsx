'use client'

import { useRef } from 'react'
import Editor from '@monaco-editor/react'

interface MonacoEditorProps {
  value: string
  onChange: (value: string | undefined) => void
  language?: string
  height?: string
}

export default function MonacoEditor({
  value,
  onChange,
  language = 'javascript',
  height = '400px'
}: MonacoEditorProps) {
  const editorRef = useRef(null)

  function handleEditorDidMount(editor: any, monaco: any) {
    editorRef.current = editor
  }

  return (
    <Editor
      height={height}
      language={language}
      value={value}
      onChange={onChange}
      onMount={handleEditorDidMount}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
    />
  )
}