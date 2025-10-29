import React, { useMemo, useState, useEffect } from 'react'

type CodePreviewProps = {
  code: string
  language?: 'java' | 'text'
  filename?: string
  maxHeight?: number
}

// 主题检测 Hook
function useIsLightTheme(): boolean {
  const [isLight, setIsLight] = useState<boolean>(() => 
    typeof document !== 'undefined' && document.documentElement.classList.contains('theme-light')
  )
  
  useEffect(() => {
    if (typeof document === 'undefined') return
    const obs = new MutationObserver(() => {
      setIsLight(document.documentElement.classList.contains('theme-light'))
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  
  return isLight
}

// Java 语法高亮组件（使用 React 元素，避免 HTML 字符串问题）
function HighlightedJavaLine({ line, isLight }: { line: string; isLight: boolean }) {
  const colors = isLight ? {
    string: 'text-red-700',
    annotation: 'text-purple-700',
    number: 'text-emerald-700',
    keyword: 'text-blue-700',
    comment: 'text-green-600',
    normal: 'text-slate-800'
  } : {
    string: 'text-emerald-300',
    annotation: 'text-pink-300',
    number: 'text-amber-300',
    keyword: 'text-sky-300',
    comment: 'text-white/40',
    normal: 'text-white/90'
  }

  const keywords = new Set([
    'public','class','static','void','int','String','new','return','if','else','for','while','do',
    'switch','case','break','continue','interface','implements','extends','package','import',
    'boolean','char','long','float','double','null','true','false','final','private','protected',
    'try','catch','throw','throws','byte','short','this','super','abstract','synchronized'
  ])

  // 检查是否是注释行
  if (line.trimStart().startsWith('//')) {
    return <span className={colors.comment}>{line}</span>
  }

  // 分词并高亮
  const tokens: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < line.length) {
    // 跳过空白
    if (/\s/.test(line[i])) {
      const start = i
      while (i < line.length && /\s/.test(line[i])) i++
      tokens.push(line.substring(start, i))
      continue
    }

    // 字符串字面量
    if (line[i] === '"') {
      const start = i++
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\') i += 2
        else i++
      }
      if (i < line.length) i++ // 跳过结束引号
      tokens.push(<span key={key++} className={colors.string}>{line.substring(start, i)}</span>)
      continue
    }

    // 单行注释
    if (line[i] === '/' && line[i + 1] === '/') {
      tokens.push(<span key={key++} className={colors.comment}>{line.substring(i)}</span>)
      break
    }

    // 注解
    if (line[i] === '@') {
      const start = i++
      while (i < line.length && /[A-Za-z0-9_]/.test(line[i])) i++
      tokens.push(<span key={key++} className={colors.annotation}>{line.substring(start, i)}</span>)
      continue
    }

    // 数字（包括负号）
    if (/[-\d]/.test(line[i]) && (line[i] === '-' || /\d/.test(line[i]))) {
      const start = i
      if (line[i] === '-') i++
      while (i < line.length && /[\d.]/.test(line[i])) i++
      // 检查后缀 L/F/l/f
      if (i < line.length && /[LlFf]/.test(line[i])) i++
      const numStr = line.substring(start, i)
      // 确保是有效数字（不是单独的减号）
      if (numStr !== '-' && /[-\d]/.test(numStr[numStr.length - 1])) {
        tokens.push(<span key={key++} className={colors.number}>{numStr}</span>)
        continue
      }
      // 否则回退
      i = start + 1
      tokens.push(line[start])
      continue
    }

    // 标识符或关键字
    if (/[A-Za-z_]/.test(line[i])) {
      const start = i
      while (i < line.length && /[A-Za-z0-9_]/.test(line[i])) i++
      const word = line.substring(start, i)
      if (keywords.has(word)) {
        tokens.push(<span key={key++} className={colors.keyword}>{word}</span>)
      } else {
        tokens.push(word)
      }
      continue
    }

    // 其他字符
    tokens.push(line[i++])
  }

  return <>{tokens}</>
}

export default function CodePreview({ code, language = 'java', filename, maxHeight = 224 }: CodePreviewProps) {
  const isLight = useIsLightTheme()
  const lines = useMemo(() => code.replace(/\r\n?/g, '\n').split('\n'), [code])

  function copyAll() {
    navigator.clipboard?.writeText(code).catch(() => {})
  }

  return (
    <div className={`code-preview rounded-xl border overflow-hidden ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-black/40'}`}>
      <div className={`code-preview__bar flex items-center justify-between px-3 py-2 border-b ${isLight ? 'border-slate-200 bg-slate-100' : 'border-white/10 bg-white/5'}`}>
        <div className={`flex items-center gap-2 text-[11px] ${isLight ? 'text-slate-600' : 'text-white/60'}`}>
          <span className={`px-1.5 py-0.5 rounded ${isLight ? 'bg-slate-200' : 'bg-white/10'}`}>{language.toUpperCase()}</span>
          {filename && <span className={isLight ? 'text-slate-700' : 'text-white/70'}>{filename}</span>}
          <span className={isLight ? 'text-slate-400' : 'text-white/40'}>· {lines.length} 行</span>
        </div>
        <button className="btn-ghost text-[11px] px-2 py-1" onClick={copyAll}>复制</button>
      </div>
      <div className="text-[12px] leading-relaxed font-mono overflow-auto" style={{ maxHeight }}>
        <table className="w-full table-fixed">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="align-top">
                <td className={`select-none pr-3 text-right w-10 ${isLight ? 'text-slate-400' : 'text-white/30'}`}>
                  {i + 1}
                </td>
                <td className={`whitespace-pre-wrap ${isLight ? 'text-slate-800' : 'text-white/90'}`}>
                  {language === 'java' ? (
                    <HighlightedJavaLine line={line} isLight={isLight} />
                  ) : (
                    line
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
