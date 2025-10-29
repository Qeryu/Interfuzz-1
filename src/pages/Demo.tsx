import { useEffect, useRef, useState } from 'react'
import GraphPanel from '../components/GraphPanel'
import { Trash2, PlayCircle, CheckCircle2, Loader2, Info, FileCode, ChevronRight, Download, BarChart2, Activity, ArrowRightCircle, Sparkles } from 'lucide-react'
import { PIPELINE_CORE_STEPS, PIPELINE_CONNECTORS, PIPELINE_PROGRESS_SEQUENCE, PIPELINE_DESCRIPTION, PIPELINE_NOTE, HEADER_TITLE, HEADER_SUBTITLE } from '../data/terminology'
import PipelineFlow from '../components/PipelineFlow'
import CodePreview from '../components/CodePreview'
import FeatureIntro from '../components/FeatureIntro' // 页面首部平台功能总览
import InteractiveNav, { Mode } from '../components/InteractiveNav'
// 轻量滚动显隐：本页内嵌，避免外部导出冲突
import type { MutableRefObject } from 'react'

function useLocalReveal(): { ref: MutableRefObject<HTMLDivElement | null>; visible: boolean } {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      entries.forEach(ent => {
        if (ent.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, visible }
}

function FadeIn({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { ref, visible } = useLocalReveal()
  return <div ref={ref} className={`${className} ${visible ? 'reveal-in' : 'reveal-pre'}`}>{children}</div>
}

export default function Demo() {
  const [leftDataUrl, setLeftDataUrl] = useState<string | null>(null)
  const [rightDataUrl, setRightDataUrl] = useState<string | null>(null)
  // 移除上传/变异后台调用，仅保留本地文件读取预览
  const [error, setError] = useState<string | null>(null)
  const blobUrls = useRef<string[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFileContent, setSelectedFileContent] = useState<string>('')
  const [manualOpen, setManualOpen] = useState<boolean>(false)
  const [manualJavaText, setManualJavaText] = useState<string>('')
  const [leftSource, setLeftSource] = useState<string>('')
  const [rightSource, setRightSource] = useState<string>('')
  // 预选 Seed 选择器
  const [showSeedPicker, setShowSeedPicker] = useState<boolean>(false)
  const previewRef = useRef<HTMLDivElement | null>(null)

  // ---- 生成 Seed（对外呈现为由 JavaFuzzer 生成；内部使用本地生成逻辑） ----
  function generateRandomSeed(iterations: number): { name: string; content: string } {
    const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
    const classId = `${Date.now().toString(36)}${rand(100, 999)}`
    const cls = `Seed${classId}`
    const iface = `I${rand(1, 9)}`
    const methCount = rand(1, 3)
    const methods = Array.from({ length: methCount }).map((_, i) => `  public int m${i + 1}() { return ${rand(0, 9)}; }`).join('\n')
    const meta = `// InterFuzz Demo Seed  ·  iterations=${iterations}  ·  generated=${new Date().toISOString()}\n`
    const content = meta +
      `interface ${iface} { default int v(){ return ${rand(1, 3)}; } }\n` +
      `class C_${cls} implements ${iface} { static int s = ${rand(0, 2)}; static { s = s + ${rand(0, 3)}; }\n${methods}\n}` +
      `\npublic class ${cls} {\n  public static void main(String[] args) {\n    System.out.println(new C_${cls}().v() + C_${cls}.s);\n  }\n}`
    return { name: `${cls}.java`, content }
  }

  // ---- 自动流程演示相关状态 ----
  const progressSteps = PIPELINE_PROGRESS_SEQUENCE
  const [analysisRunning, setAnalysisRunning] = useState(false)
  const [analysisDone, setAnalysisDone] = useState(false)
  const [currentStep, setCurrentStep] = useState<number>(-1)
  const [mutatedCode, setMutatedCode] = useState<string>('')
  const totalSteps = progressSteps.length
  const progress = currentStep < 0 ? 0 : Math.min(100, Math.round(((currentStep + (analysisDone ? 1 : 0)) / totalSteps) * 100))

  // ---- Graph 结构差异（四类节点 · 五类边） ----
  type GraphRow = { type: string; text: string }
  type GraphNode = { id: string; rows: GraphRow[] }
  type GraphEdge = { id: string; kind?: string; source: string; target: string }
  interface GraphData { nodes: GraphNode[]; edges: GraphEdge[] }
  interface GraphSummary {
    rowCounts: Record<string, number> // 基于行统计: class/interface/method/field
    nodeKindCounts: Record<string, number> // 节点级 (class/interface 节点数量, 其他按行补齐)
    edgeKindCounts: Record<string, number>
    methodRowsPerNode: Record<string, number>
    fieldRowsPerNode: Record<string, number>
  }
  interface GraphDiff {
    nodeKindDelta: Record<string, number>
    edgeKindDelta: Record<string, number>
    addedNodes: Array<{ id: string; kind: string }>
    addedMethodRows: Array<{ nodeId: string; count: number }>
    addedFieldRows: Array<{ nodeId: string; count: number }>
    addedEdges: Array<{ id: string; kind: string }>
  }
  const [seedGraphSummary, setSeedGraphSummary] = useState<GraphSummary | null>(null)
  const [mutGraphSummary, setMutGraphSummary] = useState<GraphSummary | null>(null)
  const [graphDiff, setGraphDiff] = useState<GraphDiff | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [compareJustActivated, setCompareJustActivated] = useState(false)
  // 图区域临时脉冲高亮 (点击“可视化变异过程”时触发)
  const [graphPulse, setGraphPulse] = useState(false)

  // 固定使用真实示例图数据（input / output）
  const SEED_GRAPH_PATH = '/graphs/input.json'
  const MUT_GRAPH_PATH = '/graphs/output.json'
  // 测试程序 output.java 下载 URL
  const [outputJavaBlobUrl, setOutputJavaBlobUrl] = useState<string | null>(null)

  // 轻量主题检测（通过根元素是否含有 theme-light class）
  function useIsLightTheme(): boolean {
    const [isLight, setIsLight] = useState<boolean>(() => typeof document !== 'undefined' && document.documentElement.classList.contains('theme-light'))
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
  const isLight = useIsLightTheme()

  // 公共色阶映射（暗 / 亮）
  const tone = {
    heading: isLight ? 'text-slate-700' : 'text-white/80',
    subHeading: isLight ? 'text-slate-600' : 'text-white/60',
    caption: isLight ? 'text-slate-500' : 'text-white/50',
    divider: isLight ? 'bg-slate-200' : 'bg-white/10',
    tagIdle: isLight ? 'text-slate-500' : 'text-white/45'
  }

  function normalizeEdgeKind(k?: string, semantics?: string): string {
    let raw = k || semantics || ''
    if (!raw) return 'reference' // 默认回落为 reference，避免 unknown
    const v = raw.toLowerCase()
    if (v === 'interface_impl' || v === 'implement' || v === 'implements' || v === 'implementation' || v === 'interface-impl') return 'interface-impl'
    if (v === 'generic_bounds' || v === 'generic-bounds') return 'generic-bounds'
    if (v === 'instantiate' || v === 'instantiation' || v === 'object creation') return 'reference'
    if (v === 'extend' || v === 'inherit' || v === 'inheritance' || v === 'extension') return 'inheritance'
    return v
  }
  const EDGE_BASE = ['reference','interface-impl','inheritance','nesting','generic-bounds']
  const ROW_BASE = ['class','interface','method','field']

  function summarizeGraph(g: GraphData): GraphSummary {
    const rowCounts: Record<string, number> = {}
    const nodeKindCounts: Record<string, number> = {}
    const edgeKindCounts: Record<string, number> = {}
    const methodRowsPerNode: Record<string, number> = {}
    const fieldRowsPerNode: Record<string, number> = {}
    ROW_BASE.forEach(r => { rowCounts[r] = 0 })
    EDGE_BASE.forEach(e => { edgeKindCounts[e] = 0 })

    g.nodes.forEach(n => {
      const rows = n.rows || []
      let nodeKind = 'unknown'
      for (const r of rows) {
        const t = r.type.toLowerCase()
        if (ROW_BASE.includes(t)) rowCounts[t] = (rowCounts[t] || 0) + 1
        if ((t === 'class' || t === 'interface') && nodeKind === 'unknown') nodeKind = t
        if (t === 'method') methodRowsPerNode[n.id] = (methodRowsPerNode[n.id] || 0) + 1
        if (t === 'field') fieldRowsPerNode[n.id] = (fieldRowsPerNode[n.id] || 0) + 1
      }
      nodeKindCounts[nodeKind] = (nodeKindCounts[nodeKind] || 0) + 1
    })
    g.edges.forEach(e => {
      const k = normalizeEdgeKind(e.kind, (e as any).semantics)
      if (EDGE_BASE.includes(k)) edgeKindCounts[k] = (edgeKindCounts[k] || 0) + 1
    })
    // ensure keys present
    ROW_BASE.forEach(r => { if (!(r in rowCounts)) rowCounts[r] = 0 })
    EDGE_BASE.forEach(e => { if (!(e in edgeKindCounts)) edgeKindCounts[e] = 0 })
    return { rowCounts, nodeKindCounts, edgeKindCounts, methodRowsPerNode, fieldRowsPerNode }
  }

  function diffGraphs(seed: GraphData, mutated: GraphData): GraphDiff {
    const s = summarizeGraph(seed)
    const m = summarizeGraph(mutated)
    const nodeKindDelta: Record<string, number> = { class: 0, interface: 0, method: 0, field: 0 }
    const edgeKindDelta: Record<string, number> = { reference: 0, 'interface-impl': 0, inheritance: 0, nesting: 0, 'generic-bounds': 0 }
    ;(['class','interface','method','field'] as const).forEach((k) => { nodeKindDelta[k] = (m.rowCounts[k]||0)-(s.rowCounts[k]||0) })
    EDGE_BASE.forEach((k) => { edgeKindDelta[k] = (m.edgeKindCounts[k]||0)-(s.edgeKindCounts[k]||0) })
    const seedNodeIds = new Set<string>(seed.nodes.map(n=>n.id))
    const addedNodes: Array<{ id: string; kind: string }> = mutated.nodes.filter(n=>!seedNodeIds.has(n.id)).map(n => {
      const firstRow = n.rows[0]?.type?.toLowerCase() || 'unknown'
      return { id: n.id, kind: firstRow }
    })
    const addedMethodRows: Array<{ nodeId: string; count: number }> = []
    const addedFieldRows: Array<{ nodeId: string; count: number }> = []
    mutated.nodes.forEach(n => {
      const mCount = m.methodRowsPerNode[n.id]||0
      const sCount = s.methodRowsPerNode[n.id]||0
      if (mCount > sCount) addedMethodRows.push({ nodeId: n.id, count: mCount - sCount })
      const mfCount = m.fieldRowsPerNode[n.id]||0
      const sfCount = s.fieldRowsPerNode[n.id]||0
      if (mfCount > sfCount) addedFieldRows.push({ nodeId: n.id, count: mfCount - sfCount })
    })
    const seedEdgeIds = new Set<string>(seed.edges.map(e=>e.id))
    const addedEdges: Array<{ id: string; kind: string }> = mutated.edges.filter(e=>!seedEdgeIds.has(e.id)).map(e => ({ id: e.id, kind: normalizeEdgeKind(e.kind, (e as any).semantics) }))
    setSeedGraphSummary(s)
    setMutGraphSummary(m)
    return { nodeKindDelta, edgeKindDelta, addedNodes, addedMethodRows, addedFieldRows, addedEdges }
  }

  // Fetch & summarize when URLs become available
  useEffect(() => {
    async function fetchSeed() {
      if (!leftDataUrl) return
      try {
        const r = await fetch(leftDataUrl)
        if (!r.ok) throw new Error('seed graph load failed')
        const data: GraphData = await r.json()
        setSeedGraphSummary(summarizeGraph(data))
      } catch {}
    }
    fetchSeed()
  }, [leftDataUrl])
  useEffect(() => {
    async function fetchMut() {
      if (!rightDataUrl || !leftDataUrl) return
      try {
        const seedResp = await fetch(leftDataUrl); const seedData: GraphData = await seedResp.json()
        const mutResp = await fetch(rightDataUrl); const mutData: GraphData = await mutResp.json()
        const d = diffGraphs(seedData, mutData)
        setGraphDiff(d)
        setCompareMode(true); setCompareJustActivated(true); setTimeout(()=>setCompareJustActivated(false),800)
      } catch {}
    }
    fetchMut()
  }, [rightDataUrl, leftDataUrl])

  function buildGraphSuggestions(): string[] {
  if (!graphDiff) return ['等待加载图数据以生成建议']
    const s: string[] = []
    // 聚合结构复杂度提升相关触发条件为单条建议
    const structuralComplex = (
      graphDiff.nodeKindDelta.interface > 0 ||
      graphDiff.nodeKindDelta.class > 0 ||
      graphDiff.addedMethodRows.length > 0 ||
      graphDiff.edgeKindDelta['inheritance'] > 0
    )
    if (structuralComplex) s.push('更复杂的类间结构')
    // 已移除“实现关系增长：动态分派机会增加”与“引用边显著增长：对象交互路径增多”提示
    if (graphDiff.edgeKindDelta['generic-bounds'] > 0) s.push('出现泛型约束：类型系统覆盖增强')
    if (graphDiff.edgeKindDelta['nesting'] > 0) s.push('出现嵌套：内部类/作用域结构更丰富')
    if (s.length === 0) s.push('结构变化较小，可考虑引入新的接口或继承层次')
    return s
  }
  const graphSuggestions = buildGraphSuggestions()

  // 右侧列垂直居中偏移逻辑（当左侧过高时）
  const leftColumnRef = useRef<HTMLDivElement | null>(null)
  const rightColumnRef = useRef<HTMLDivElement | null>(null)
  const [rightTopOffset, setRightTopOffset] = useState(0)
  function recalcRightOffset() {
    if (!leftColumnRef.current || !rightColumnRef.current) return
    const lh = leftColumnRef.current.getBoundingClientRect().height
    const rh = rightColumnRef.current.getBoundingClientRect().height
    const diff = lh - rh
    // 仅在明显差距时居中（> 120px）
    if (diff > 120) {
      setRightTopOffset(Math.round(diff / 2))
    } else {
      setRightTopOffset(0)
    }
  }
  useEffect(() => { recalcRightOffset() }, [selectedFileContent, mutatedCode, analysisDone, compareMode])
  // 变异生成后自动进入对比模式（一次性）
  // compare mode 激活已在加载右图时处理；保留对测试程序触发的兜底逻辑
  useEffect(() => {
    if (mutatedCode && !compareMode && rightDataUrl) {
      setCompareMode(true)
      setCompareJustActivated(true)
      setTimeout(() => setCompareJustActivated(false), 800)
    }
  }, [mutatedCode, rightDataUrl])
  useEffect(() => {
    const h = () => recalcRightOffset()
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // 模拟步骤执行
  async function startAutoDemo() {
    if (analysisRunning) return
  const hasManual = false
  // 使用占位 Seed 名称（可为空时回退为 ExampleSeed.java）
  const seedName = selectedFile?.name || 'ExampleSeed.java'
    // reset
    setAnalysisDone(false)
    setCurrentStep(-1)
    setMutatedCode('')
  setLeftDataUrl(null)
  setRightDataUrl(null)
  setLeftSource('')
  setRightSource('')
    // 清空结构统计与差异，以确保重新运行时右上角组件刷新
    setSeedGraphSummary(null)
    setMutGraphSummary(null)
    setGraphDiff(null)
    setCompareMode(false)
    setCompareJustActivated(false)
    setError(null)
    setAnalysisRunning(true)

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
    for (let i = 0; i < progressSteps.length; i++) {
      setCurrentStep(i)
      // 针对具体阶段做出可见效果
      if (progressSteps[i].includes('初始 HPG')) {
        setLeftDataUrl(SEED_GRAPH_PATH)
        setLeftSource(`${seedName} · input.json`)
      }
      // 结构分析阶段：只生成统计，不加载图（假设步骤名包含“结构分析”）
      if (progressSteps[i].includes('结构分析')) {
        try {
          const resp = await fetch(SEED_GRAPH_PATH)
          if (resp.ok) {
            const data: GraphData = await resp.json()
            const summary = summarizeGraph(data)
            setSeedGraphSummary(summary)
          }
        } catch {}
      }
      if (progressSteps[i].includes('变异后 HPG')) {
        setRightDataUrl(MUT_GRAPH_PATH)
        setRightSource(`${seedName.replace(/\.java$/, '')}-after · output.json`)
        // 仍加载图用于差异统计，不再保存 JSON 文本
        try { await fetch(MUT_GRAPH_PATH) } catch {}
      }
      if (progressSteps[i].includes('测试程序生成')) {
        try {
          const resp = await fetch('/graphs/output.java')
          if (resp.ok) {
            const txt = await resp.text()
            setMutatedCode(txt)
            if (outputJavaBlobUrl) URL.revokeObjectURL(outputJavaBlobUrl)
            const blob = new Blob([txt], { type: 'text/x-java-source;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            setOutputJavaBlobUrl(url)
          }
        } catch {}
      }
      
      // 为每个步骤单独设置延迟时间（单位：毫秒）
      let stepDelay = 1500 // 默认值
      const stepName = progressSteps[i]
      
      if (stepName.includes('Seed 导入')) {
        stepDelay = 1500  // Seed 导入: 1.5秒
      } else if (stepName.includes('结构分析')) {
        stepDelay = 2000  // 结构分析: 2秒
      } else if (stepName.includes('初始 HPG')) {
        stepDelay = 2500  // 初始 HPG: 2.5秒
      } else if (stepName.includes('Inter-Class Mutator') || stepName.includes('INTER-CLASS MUTATOR')) {
        stepDelay = 15000 // Inter-Class Mutator: 15秒
      } else if (stepName.includes('变异后 HPG')) {
        stepDelay = 2500  // 变异后 HPG: 2.5秒
      } else if (stepName.includes('测试程序生成')) {
        stepDelay = 2000  // 测试程序生成: 2秒
      }
      
      await delay(stepDelay)
    }
    setAnalysisRunning(false)
    setAnalysisDone(true)
  }

  // 复制逻辑由 CodePreview 内部处理

  // 初始两个图都为空

  // cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrls.current.forEach((u) => URL.revokeObjectURL(u))
      blobUrls.current = []
    }
  }, [])

  const effectiveLeftUrl = leftDataUrl ?? undefined
  const effectiveRightUrl = rightDataUrl ?? undefined

  // 读取本地选取的 Java Seed 文件内容用于预览（不上传）
  function onSelectLocalJava(file: File | null) {
    setSelectedFile(file)
    setSelectedFileContent('')
    // 切换到文件时清空手动输入
    if (file) {
      setManualJavaText('')
      setManualOpen(false)
    }
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      setSelectedFileContent(text)
      // 切换新 Seed 时清理旧结构
      setSeedGraphSummary(null)
      setMutGraphSummary(null)
      setGraphDiff(null)
      setCompareMode(false)
      setCompareJustActivated(false)
    }
    reader.readAsText(file)
  }

  // 单一真实预选 Seed 内容（input.java）
  const [inputSeedContent, setInputSeedContent] = useState<string>('')
  useEffect(() => {
    let cancel = false
    ;(async ()=>{
      try {
        const resp = await fetch('/graphs/input.java')
        if (!resp.ok) return
        const txt = await resp.text()
        if (!cancel) setInputSeedContent(txt)
      } catch {}
    })()
    return () => { cancel = true }
  }, [])
  function useInputSeed() {
    if (!inputSeedContent) return
    const file = new File([inputSeedContent], 'input.java', { type: 'text/x-java-source;charset=utf-8' })
    setSelectedFile(file)
    setSelectedFileContent(inputSeedContent)
    setAnalysisDone(false)
    setCurrentStep(-1)
    setMutatedCode('')
    setLeftDataUrl(null)
    setRightDataUrl(null)
    setLeftSource('')
    setRightSource('')
    setSeedGraphSummary(null)
    setMutGraphSummary(null)
    setGraphDiff(null)
    setCompareMode(false)
    setCompareJustActivated(false)
    setError(null)
    setShowSeedPicker(false) // 选用后自动收起预选框
  }
  
  // 模式切换：overview / single / batch
  const [mode, setMode] = useState<Mode>('overview')

  return (
    <div className="space-y-6">
  <InteractiveNav activeMode={mode} onModeChange={setMode} />
      {/* 平台功能总览介绍：仅在 overview 模式显示 */}
      {mode === 'overview' && (
        <FadeIn>
          <FeatureIntro onNavigateMode={(m)=> setMode(m)} />
        </FadeIn>
      )}
      {/* 页面标题：区分单种子流水线 / 多种子批量生成；移除统一“工具使用”及演示文案 */}
      {/* 已移除单种子与批量模式顶部大标题，根据导航直接进入模块内容 */}

      {/* Header - 已移除详细说明部分 */}
      {/* 自动流程演示模块：在 batch 模式隐藏 */}
  {mode !== 'batch' && mode !== 'overview' && (
  <div className="card" id="pipeline-section">
        {/* 模块醒目头部 */}
  <div className="relative mb-4 overflow-hidden rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500/25 via-sky-500/20 to-emerald-500/25 px-5 py-4 flex items-center justify-between theme-light:border-sky-300/40 theme-light:from-sky-300/25 theme-light:via-cyan-300/15 theme-light:to-emerald-300/20">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-cyan-400 to-sky-500 text-white flex items-center justify-center shadow-inner">
              <PlayCircle size={24} />
            </div>
            <div className="flex flex-col">
              <div className="text-xl md:text-2xl font-semibold tracking-wide text-cyan-200 leading-tight theme-light:text-slate-900">分析—变异流水线</div>
              <div className="text-sm md:text-base text-white/65 mt-0.5 theme-light:text-slate-900">结构 → 初始HPG → 变异 → 变异后HPG → 测试程序</div>
            </div>
          </div>
          <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(circle_at_85%_15%,rgba(255,255,255,0.35),transparent_70%)]" />
        </div>
          <div className="flex flex-col lg:flex-row gap-8">
          {/* 左：控制 + 预览双栈 */}
          <div className="flex-[1.15] space-y-4" ref={leftColumnRef}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white flex items-center gap-2 theme-light:text-slate-900"><PlayCircle size={18} className="text-sky-400 theme-light:text-sky-600"/>分析—变异流水线</h3>
              <button
                className="btn-primary disabled:opacity-50"
                disabled={analysisRunning || analysisDone || !selectedFile}
                onClick={() => {
                  if (!selectedFile) { setError('请先选择预选 Seed 后再开始分析'); return }
                  if (analysisDone) { setError('分析已完成，如需再次执行请点击重新运行'); return }
                  startAutoDemo()
                }}
                aria-label="开始分析"
              >{
                analysisRunning
                  ? (<><Loader2 size={16} className="animate-spin"/> 运行中...</>)
                  : analysisDone
                    ? '分析已完成'
                    : !selectedFile
                      ? '请选择 Seed'
                      : '开始分析'
              }</button>
            </div>
            {/* 固定真实图数据集提示 */}
            <div className="text-sm text-white/50 flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-white/5 border border-white/10">图数据集: 真实案例 (input.json → output.json)</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-sm mb-1 relative">
              <label className="text-white/60">Seed：</label>
              <button
                type="button"
                onClick={() => setShowSeedPicker(v=>!v)}
                className={`seed-btn`}
                aria-label="选择预选 Seed"
                aria-expanded={showSeedPicker}
              >
                <span className="seed-btn__sheen" aria-hidden="true" />
                <span className="seed-btn__content">
                  <FileCode size={14} />
                  <span className="text-[12px] font-semibold tracking-wide">选择预选 Seed</span>
                </span>
              </button>
              <span className="seed-caption">
                <span className="seed-caption__source">预选 Seed · input.java</span>
              </span>
              <div
                className={`seed-panel absolute z-20 top-full left-14 w-[520px] rounded-xl border p-3 shadow-lg backdrop-blur-md mt-2 seed-panel-transition ${showSeedPicker ? 'seed-panel-open' : 'seed-panel-closed'} ${isLight ? 'border-slate-200 bg-white/95' : 'border-white/10 bg-[rgba(20,24,36,0.9)]'}`}
                aria-hidden={!showSeedPicker}
              >
                {/* 内层内容保持渲染，提高动画流畅度 */}
                <div className="grid grid-cols-1 gap-2">
                  <div className={`rounded-lg border p-2 transition group ${isLight ? 'border-slate-200 bg-slate-50 hover:bg-slate-100' : 'border-white/10 bg-white/5 hover:bg-white/10'}` }>
                    <div className="flex items-center justify-between mb-1">
                      <div className={`font-medium truncate ${isLight ? 'text-slate-700 group-hover:text-slate-800' : 'text-white/80 group-hover:text-white'}`}>input.java</div>
                      <button
                        className={`text-sm px-2 py-1 rounded-md border transition ${isLight ? 'border-slate-300 bg-white hover:bg-slate-50 text-slate-600' : 'btn-ghost border-white/15 text-white/60 hover:text-white'}`}
                        disabled={!inputSeedContent}
                        onClick={useInputSeed}
                      >选用</button>
                    </div>
                    <pre className={`text-[10px] max-h-32 overflow-auto whitespace-pre-wrap leading-snug ${isLight ? 'text-slate-600' : 'text-white/60'}`}>{inputSeedContent ? inputSeedContent.slice(0, 580) + (inputSeedContent.length > 580 ? '…' : '') : '加载中...'}</pre>
                  </div>
                </div>
              </div>
              {selectedFile && (
                <>
                  <div className="h-4 w-px bg-white/10 mx-1" />
                  <button
                    className="btn text-sm px-2 py-1"
                    onClick={() => {
                      setSelectedFile(null)
                      setSelectedFileContent('')
                      setManualJavaText('')
                      setManualOpen(false)
                      setLeftDataUrl(null); setRightDataUrl(null); setLeftSource(''); setRightSource(''); setMutatedCode(''); setAnalysisDone(false); setCurrentStep(-1)
                      setSeedGraphSummary(null); setMutGraphSummary(null); setGraphDiff(null); setCompareMode(false); setCompareJustActivated(false)
                      if (outputJavaBlobUrl) { URL.revokeObjectURL(outputJavaBlobUrl); setOutputJavaBlobUrl(null) }
                    }}>移除文件</button>
                  {analysisDone && (
                    <button
                      className="btn text-sm px-2 py-1"
                      disabled={analysisRunning}
                      onClick={() => {
                        setAnalysisDone(false)
                        setCurrentStep(-1)
                        setMutatedCode('')
                        if (outputJavaBlobUrl) { URL.revokeObjectURL(outputJavaBlobUrl); setOutputJavaBlobUrl(null) }
                        startAutoDemo()
                      }}
                    >重新运行</button>
                  )}
                </>
              )}
            </div>
            <p className="text-sm text-white/50">导入 Seed 后系统依次执行：Seed 导入 → 结构分析 → 初始 HPG → 变异执行 → 变异后 HPG → 测试程序。</p>
            {/* 输入预览 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-white/70 text-sm font-semibold tracking-wide">输入 Seed 源码</h4>
                {selectedFile && <span className="text-[10px] text-white/40">{selectedFile.name}</span>}
              </div>
              {selectedFile && selectedFileContent ? (
                <div ref={previewRef}>
                  <CodePreview code={selectedFileContent} language="java" filename={selectedFile?.name || 'Seed.java'} maxHeight={260} />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-6 text-center text-sm text-white/45 theme-light:text-slate-900 theme-light:bg-slate-100/60 theme-light:border-slate-300/60">
                  选择或导入 Seed 后显示源码
                </div>
              )}
            </div>
            {/* 输出预览 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-white/70 text-sm font-semibold tracking-wide">输出结果</h4>
                {mutatedCode && <span className="text-[10px] text-white/40">已生成</span>}
              </div>
              {mutatedCode ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/50">测试程序 (output.java)</span>
                    {outputJavaBlobUrl && (
                      <a
                        href={outputJavaBlobUrl}
                        download="output.java"
                        className="text-cyan-300 underline hover:text-cyan-200 text-sm"
                      >下载 output.java</a>
                    )}
                  </div>
                  <CodePreview
                    code={mutatedCode}
                    language="java"
                    filename={`output.java`}
                    maxHeight={260}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-6 text-center text-sm text-white/45 min-h-[140px] flex items-center justify-center theme-light:text-slate-900 theme-light:bg-slate-100/55 theme-light:border-slate-300/60">
                  等待流程生成测试程序…
                </div>
              )}
            </div>
          </div>
          {/* 右：步骤列表（整合进度） */}
          <div className="flex-[0.85] space-y-4" ref={rightColumnRef} style={{ marginTop: rightTopOffset }}>
            {/* Graph 结构 / 差异 面板 */}
            <div className={`relative rounded-xl border p-6 flex flex-col gap-6 overflow-hidden transition-all duration-500 min-h-[300px] graph-struct-surface ${compareJustActivated ? 'ring-1 ring-cyan-400/40 scale-[1.02]' : ''} ${isLight ? 'border-slate-200 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200' : 'border-white/10 bg-gradient-to-br from-[rgba(35,50,70,0.55)] via-[rgba(20,28,40,0.55)] to-[rgba(12,18,30,0.55)]'}`}>
              <div className="absolute inset-0 pointer-events-none opacity-[0.18] bg-[radial-gradient(circle_at_70%_30%,rgba(0,155,220,0.45),transparent_60%)]" />
              <div className="flex items-center justify-between relative z-10">
                <h4 className={`text-sm font-semibold tracking-wide flex items-center gap-1 ${tone.heading}`}><BarChart2 size={14} className="text-cyan-400"/>{compareMode ? 'Graph 结构差异' : 'Seed 结构'}</h4>
                <button
                  type="button"
                  onClick={() => setCompareMode(m => !m)}
                  className={`text-sm px-2 py-1 rounded-md border transition ${isLight ? 'border-slate-300 bg-white hover:bg-slate-50 text-slate-600' : 'border-white/15 bg-white/5 hover:bg-white/10 text-white/60'}`}
                >{compareMode ? '单列视图' : '对比视图'}</button>
              </div>
              {!compareMode && (
                <div className="relative z-10 flex-1 flex flex-col gap-6">
                  <div className="flex flex-col">
                    <h5 className={`text-sm font-medium mb-2 ${tone.subHeading}`}>节点统计</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 gap-3">
                      <MetricBlock label="Class" value={seedGraphSummary?.rowCounts.class ?? '-'} color="sky" />
                      <MetricBlock label="Interface" value={seedGraphSummary?.rowCounts.interface ?? '-'} color="cyan" />
                      <MetricBlock label="Method" value={seedGraphSummary?.rowCounts.method ?? '-'} color="emerald" />
                      <MetricBlock label="Field" value={seedGraphSummary?.rowCounts.field ?? '-'} color="amber" />
                    </div>
                    {/* 移除原行统计说明 */}
                  </div>
                  <div className="flex flex-col">
                    <h5 className={`text-sm font-medium mb-2 ${tone.subHeading}`}>边统计</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      <MetricBlock label="Reference" value={seedGraphSummary?.edgeKindCounts['reference'] ?? '-'} color="teal" />
                      <MetricBlock label="Interface Impl." value={seedGraphSummary?.edgeKindCounts['interface-impl'] ?? '-'} color="violet" />
                      <MetricBlock label="Inheritance" value={seedGraphSummary?.edgeKindCounts['inheritance'] ?? '-'} color="indigo" />
                      <MetricBlock label="Nesting" value={seedGraphSummary?.edgeKindCounts['nesting'] ?? '-'} color="rose" />
                      <MetricBlock label="Generic Bounds" value={seedGraphSummary?.edgeKindCounts['generic-bounds'] ?? '-'} color="lime" />
                    </div>
                    {/* 移除原边分类说明 */}
                  </div>
                  <div className={`text-sm italic ${tone.caption}`}>单列模式：加载右侧图后自动进入对比</div>
                </div>
              )}
              {compareMode && (
                <div className="relative z-10 grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h5 className={`text-sm font-medium flex items-center gap-1 ${tone.subHeading}`}><Activity size={12} className="text-sky-500"/>Seed</h5>
                    <CompareLine label="Class" a={seedGraphSummary?.rowCounts.class} b={mutGraphSummary?.rowCounts.class} />
                    <CompareLine label="Interface" a={seedGraphSummary?.rowCounts.interface} b={mutGraphSummary?.rowCounts.interface} />
                    <CompareLine label="Method" a={seedGraphSummary?.rowCounts.method} b={mutGraphSummary?.rowCounts.method} />
                    <CompareLine label="Field" a={seedGraphSummary?.rowCounts.field} b={mutGraphSummary?.rowCounts.field} />
                    <div className={`mt-1 h-px w-full ${tone.divider}`} />
                    <CompareLine label="Reference" a={seedGraphSummary?.edgeKindCounts['reference']} b={mutGraphSummary?.edgeKindCounts['reference']} />
                    <CompareLine label="Interface Implementation" a={seedGraphSummary?.edgeKindCounts['interface-impl']} b={mutGraphSummary?.edgeKindCounts['interface-impl']} />
                    <CompareLine label="Inheritance" a={seedGraphSummary?.edgeKindCounts['inheritance']} b={mutGraphSummary?.edgeKindCounts['inheritance']} />
                    <CompareLine label="Nesting" a={seedGraphSummary?.edgeKindCounts['nesting']} b={mutGraphSummary?.edgeKindCounts['nesting']} />
                    <CompareLine label="Generic Bounds" a={seedGraphSummary?.edgeKindCounts['generic-bounds']} b={mutGraphSummary?.edgeKindCounts['generic-bounds']} />
                  </div>
                  <div className="space-y-2">
                    <h5 className={`text-sm font-medium flex items-center gap-1 ${tone.subHeading}`}><ArrowRightCircle size={12} className="text-emerald-500"/>差异摘要</h5>
                    <DiffSummaryAggregated graphDiff={graphDiff} tone={tone} />
                    <div className={`mt-2 text-sm italic flex items-center gap-1 ${tone.caption}`}><Sparkles size={12} className="text-yellow-500"/>基于行(row)统计：方法/字段作为行计数，节点按首行类型分类。</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {graphSuggestions.map((sg,i)=> (
                        <span key={i} className="px-2 py-0.5 rounded-full bg-white/8 border border-white/10 text-sm text-white/65 backdrop-blur-sm theme-light:text-slate-900">{sg}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* 步骤列表 */}
            <div className="space-y-2" aria-label="Progress Steps">
              {progressSteps.map((s: string, idx: number) => {
                const isActive = idx === currentStep && analysisRunning
                const doneStep = idx < currentStep || (analysisDone && idx === progressSteps.length - 1)
                const isConnector = PIPELINE_CONNECTORS.some((c: { from: string; to: string; label: string }) => c.label === s)
                const isTestProgramStep = /测试程序生成/.test(s)
                return (
                  <div key={s} className={`flex items-start gap-3 rounded-lg px-3 py-2 text-[13px] border transition relative overflow-hidden group ${isConnector ? 'border-dashed' : ''} ${doneStep ? 'border-emerald-500/40 bg-emerald-500/[0.07]' : isActive ? 'border-sky-500/50 bg-sky-500/[0.12]' : 'border-white/10 bg-white/[0.035]'}`}>
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-10 pointer-events-none bg-gradient-to-r from-cyan-400/40 to-transparent"></div>
                    <div className="mt-0.5 min-w-4 flex items-center justify-center">
                      {isActive ? (
                        <Loader2 size={16} className="text-sky-400 animate-spin"/>
                      ) : doneStep ? (
                        isConnector ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 size={16} className="text-emerald-400"/>
                        )
                      ) : (
                        <ChevronRight size={16} className="text-white/40"/>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={`font-medium ${isConnector ? 'text-sm tracking-wide uppercase text-white/50' : ''} ${doneStep ? 'text-emerald-300' : isActive ? 'text-sky-300' : isConnector ? '' : 'text-white/70'}`}>{s}</div>
                      {isActive && <div className="text-sm text-white/50 mt-0.5">处理中...</div>}
                    </div>
                  </div>
                )
              })}
              {/* 外部提示：测试程序生成后出现 */}
              {progressSteps.some(s => /测试程序生成/.test(s)) && (
                (() => {
                  const idx = progressSteps.findIndex(s => /测试程序生成/.test(s))
                  const reached = idx >= 0 && (currentStep > idx || (currentStep === idx && (analysisDone || analysisRunning)))
                  if (!reached) return null
                  return (
                    <div className="flex items-center justify-center mt-6">
                      <button
                        type="button"
                        onClick={() => {
                          // 仅滚动到图区域，不再做额外偏移；触发脉冲高亮反馈
                          const target = document.querySelector('#graph-visual-region')
                          if (target) {
                            target.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            setGraphPulse(true)
                            setTimeout(() => setGraphPulse(false), 900)
                          }
                        }}
                        className="group relative px-3 py-1.5 rounded-md bg-transparent text-cyan-200 text-[12px] font-semibold tracking-wide flex items-center gap-1 hover:text-cyan-100 transition"
                        aria-label="滚动查看图可视化"
                      >
                        <span className="inline-flex items-center gap-1">
                          <span className="drop-shadow-sm">可视化初始种子与有丰富跨类结构的种子对应的异构程序图（HPG）</span>
                          <span className="animate-bounce inline-flex text-cyan-300">
                            {/* 更精致的双层箭头 */}
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                              <path d="M12 4v8" />
                              <path d="M6 12l6 6 6-6" />
                            </svg>
                          </span>
                        </span>
                      </button>
                    </div>
                  )
                })()
              )}
            </div>
          </div>
          </div>
        {/* 去除独立居中进度条，减少重复视觉元素 */}
      </div>
      )}
      {error && <div className="card text-sm text-rose-400">错误：{error}</div>}
  {/* 图结果模块：在 batch 模式隐藏（已取消折叠功能） */}
  {mode !== 'batch' && mode !== 'overview' && (
  <div className="card">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-base text-white/70">图结果</div>
            <div className="h-px flex-1 mx-3 bg-white/10" />
            <div className="text-sm text-white/50">Left: 初始 HPG · Right: 变异后 HPG</div>
          </div>
          {/* 水平流程示意 */}
          <div className="hidden md:block">
            <PipelineFlow
              coreSteps={PIPELINE_CORE_STEPS}
              connectors={PIPELINE_CONNECTORS}
              active={progressSteps[currentStep] || null}
              completed={new Set(progressSteps.slice(0, currentStep))}
            />
          </div>
        </div>
  </div>
      )}
      {/* Graphs: 双图固定并排，初始为空 / 在 batch 模式隐藏 */}
  {mode !== 'batch' && mode !== 'overview' && (
        <FadeIn className="block">
          <div id="graph-visual-region" className={`grid gap-3 xl:grid-cols-2 ${graphPulse ? 'ring-2 ring-cyan-400/50 rounded-xl animate-pulse' : ''}`}>
          <GraphPanel
            dataUrl={effectiveLeftUrl}
            height={600}
            title={'初始 HPG'}
            subtitle={leftSource || undefined}
          />
          <GraphPanel
            dataUrl={effectiveRightUrl}
            height={600}
            title="变异后 HPG"
            subtitle={rightSource || undefined}
          />
          </div>
        </FadeIn>
      )}
      {/* 多种子批量生成模块：仅在 batch 模式显示 */}
  {mode === 'batch' && (
    <div className="relative">
      <AcquireSeedsSection generateRandomSeed={generateRandomSeed} blobUrls={blobUrls} />
    </div>
  )}
    </div>
  )
}

// 获取 Seed 批量打包组件
interface AcquireSeedsProps {
  generateRandomSeed: (iterations: number) => { name: string; content: string } // 保留签名兼容，不再使用
  blobUrls: React.MutableRefObject<string[]>
}

function AcquireSeedsSection({ generateRandomSeed, blobUrls }: AcquireSeedsProps) {
  const [count, setCount] = useState<number>(3)
  const [iterations, setIterations] = useState<number>(10)
  const [acquiring, setAcquiring] = useState(false)
  const [items, setItems] = useState<Array<{ name: string; url: string; size: number }>>([])
  const [zipBuilding, setZipBuilding] = useState(false)
  const [zipProgress, setZipProgress] = useState(0)
  const [zipUrl, setZipUrl] = useState<string | null>(null)
  const [zipJustBuilt, setZipJustBuilt] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null)
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 清理单独创建的 blob (ZIP) URL
  useEffect(() => {
    return () => {
      if (zipUrl) URL.revokeObjectURL(zipUrl)
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
  }, [zipUrl])

  // 格式化剩余时间
  function formatTimeRemaining(seconds: number): string {
    if (seconds < 60) return `${Math.ceil(seconds)}秒`
    const minutes = Math.floor(seconds / 60)
    const secs = Math.ceil(seconds % 60)
    return `${minutes}分${secs}秒`
  }

  async function acquire() {
    if (acquiring) return
    setAcquiring(true)
    setError(null)
    setGenerationProgress(0)
    setEstimatedTimeRemaining(null)
    
    // 清理旧的进度定时器
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
    
    // 清理旧 item urls
    items.forEach(it => URL.revokeObjectURL(it.url))
    
    try {
      // 使用 fetch 接收流式进度
      const response = await fetch('/api/generate-seeds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          iterations: iterations,
          count: count,
          stream: true, // 启用流式传输
        }),
      })
      
      if (!response.ok) {
        throw new Error(`生成失败: ${response.statusText}`)
      }
      
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      
      if (!reader) {
        throw new Error('无法读取响应流')
      }
      
      let buffer = ''
      let startTime = Date.now()
      
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        
        // 处理SSE消息（格式：data: {...}\n\n）
        const messages = buffer.split('\n\n')
        buffer = messages.pop() || '' // 保留不完整的消息
        
        for (const message of messages) {
          if (!message.trim() || !message.startsWith('data:')) continue
          
          try {
            const jsonStr = message.replace(/^data:\s*/, '')
            const data = JSON.parse(jsonStr)
            
            switch (data.type) {
              case 'started':
                console.log('生成已开始')
                break
                
              case 'progress':
                const progress = data.progress || 0
                setGenerationProgress(progress)
                
                // 计算预估剩余时间
                const elapsed = (Date.now() - startTime) / 1000
                const rate = progress > 0 ? elapsed / progress : 0
                const remaining = rate * (100 - progress)
                setEstimatedTimeRemaining(remaining)
                break
                
              case 'case_success':
                console.log(`测试用例 ${data.case} 生成成功`)
                break
                
              case 'case_error':
                console.log(`测试用例 ${data.case} 生成失败`)
                break
                
              case 'complete':
                setGenerationProgress(100)
                setEstimatedTimeRemaining(0)
                
                // 处理返回的测试用例
                await handleTestCasesComplete(data.testCases)
                return
                
              case 'error':
                throw new Error(data.error || '生成失败')
            }
          } catch (err) {
            console.error('处理进度消息失败:', err)
          }
        }
      }
      
    } catch (e: any) {
      console.error('生成种子失败:', e)
  setError('测试用例生成失败: ' + (e?.message || '未知错误'))
      setAcquiring(false)
      setGenerationProgress(0)
      setEstimatedTimeRemaining(null)
    }
  }
  
  async function handleTestCasesComplete(testCases: any[]) {
    try {
      const next: Array<{ name: string; url: string; size: number }> = []
      
      if (testCases && Array.isArray(testCases)) {
        const JSZipModule = await import('jszip')
        
        for (const testCase of testCases) {
          try {
            const zip = new JSZipModule.default()
            
            // 将测试用例中的所有文件添加到zip中，保持目录结构
            for (const file of testCase.files) {
              zip.file(file.path, file.content)
            }
            
            const blob = await zip.generateAsync({ type: 'blob' })
            const url = URL.createObjectURL(blob)
            blobUrls.current.push(url)
            next.push({ 
              name: testCase.name + '.zip', 
              url, 
              size: blob.size 
            })
          } catch (e: any) {
            console.error('单个测试用例打包失败:', e)
          }
        }
      }
      
      setItems(next)
      setAcquiring(false)
      
      // 保持100%进度显示一小会儿
      setTimeout(() => {
        setGenerationProgress(0)
        setEstimatedTimeRemaining(null)
      }, 3000)
    } catch (e: any) {
      setError('处理测试用例失败: ' + (e?.message || '未知错误'))
      setAcquiring(false)
      setGenerationProgress(0)
      setEstimatedTimeRemaining(null)
    }
  }

  function downloadOne(it: { name: string; url: string }) {
    const a = document.createElement('a')
    a.href = it.url
    a.download = it.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function downloadAll() {
    if (zipBuilding || items.length === 0) return
    setZipBuilding(true)
    setZipProgress(0)
    try {
      const JSZipModule = await import('jszip')
      const zip = new JSZipModule.default()
      items.forEach(it => {
        // 将每个单独zip文件再嵌入一个总zip (保持名称) —— 需要先fetch blob再添加
        // 我们已有 blob URLs，可通过 fetch 取回
        zip.file(it.name, 'PLACEHOLDER') // 占位后替换
      })
      // 重新写入真实内容
      for (const it of items) {
        try {
          const resp = await fetch(it.url)
          const blob = await resp.blob()
          const arrBuff = await blob.arrayBuffer()
          zip.remove(it.name)
          zip.file(it.name, arrBuff)
        } catch {}
      }
      const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setZipProgress(Math.round(metadata.percent))
      })
      const url = URL.createObjectURL(blob)
      blobUrls.current.push(url)
      setZipUrl(url)
      const a = document.createElement('a')
      a.href = url
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      a.download = `test_cases_batch_${timestamp}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      try {
        const mod = await import('canvas-confetti')
        const confetti = mod.default
        confetti({ particleCount: 90, spread: 72, startVelocity: 28, scalar: 0.9, origin: { y: 0.3 } })
        setZipJustBuilt(true)
        setTimeout(() => setZipJustBuilt(false), 2000)
      } catch {}
      setZipProgress(100)
      setTimeout(() => { setZipBuilding(false); setZipProgress(0) }, 400)
    } catch (e:any) {
      setError('总 ZIP 打包失败: ' + (e?.message || '未知错误'))
      setZipBuilding(false)
      setZipProgress(0)
    }
  }

  return (
  <div className="card" id="seed-section">
      {/* 模块醒目头部 */}
  <div className="relative mb-4 overflow-hidden rounded-xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-cyan-500/25 px-5 py-4 flex items-center justify-between theme-light:border-emerald-400/40 theme-light:from-emerald-300/25 theme-light:via-teal-300/15 theme-light:to-cyan-300/20">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center shadow-inner">
            <Download size={24} />
          </div>
          <div className="flex flex-col">
            <div className="text-xl md:text-2xl font-semibold tracking-wide text-emerald-200 leading-tight theme-light:text-slate-900">多种子批量生成</div>
            <div className="text-xs md:text-sm text-white/65 mt-0.5 theme-light:text-slate-900">按配置批量生成测试用例集合 · 支持单例与总包打包</div>
          </div>
        </div>
        <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.35),transparent_70%)]" />
      </div>
      <div className="flex items-center justify-between mb-3">
  <h3 className="font-semibold text-white">批量生成配置</h3>
        <div className="flex items-center gap-2 text-sm text-white/70">
          <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5">测试用例: <span className="text-white">{count}</span></span>
          <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5">迭代: <span className="text-white">{iterations}</span></span>
          {items.length > 0 && (
            <span className="px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              已生成: {items.length}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-1">
          <label htmlFor="cnt-input" className="text-white/60">测试用例数</label>
          <input 
            id="cnt-input" 
            type="number" 
            min="1" 
            max="100"
            className="w-20 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50" 
            value={count} 
            onChange={(e) => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={acquiring}
          />
        </div>
        <div className="flex items-center gap-1">
          <label htmlFor="iter-input" className="text-white/60">迭代次数</label>
          <input 
            id="iter-input" 
            type="number" 
            min="1" 
            max="1000"
            className="w-20 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50" 
            value={iterations} 
            onChange={(e) => setIterations(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={acquiring}
          />
        </div>
        <button className="btn-primary disabled:opacity-50" disabled={acquiring} onClick={acquire} aria-label="生成测试用例">{acquiring ? (<><Loader2 size={14} className="animate-spin"/> 生成中...</>) : '生成'}</button>
        {items.length > 0 && !acquiring && (
          <button className="btn text-xs px-3 py-1.5 inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-medium" onClick={downloadAll} disabled={zipBuilding}>
            {zipBuilding ? (<><Loader2 size={14} className="animate-spin"/> 打包中 {zipProgress}%</>) : (<><Download size={14}/> 批量下载 ({items.length})</>)}
          </button>
        )}
        {zipUrl && !zipBuilding && items.length > 0 && (
          <a className="text-xs text-white/60 hover:text-white/80 underline inline-flex items-center gap-1" href={zipUrl} download>
            <Download size={12}/> 重新下载批量ZIP
          </a>
        )}
        {zipJustBuilt && !zipBuilding && (
          <span className="text-sm text-emerald-300 inline-flex items-center gap-1 animate-pulse"><CheckCircle2 size={14}/> 打包完成</span>
        )}
        {error && (
          <div className="w-full text-rose-400 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto bg-rose-950/20 border border-rose-500/30 rounded p-2 mt-2">
            {error}
          </div>
        )}
      </div>
      
      {/* 生成进度条 */}
      {acquiring && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-emerald-400"/>
              <span className="text-white/80 font-medium">正在生成测试用例...</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-emerald-300 font-semibold">{generationProgress}%</span>
              {estimatedTimeRemaining !== null && estimatedTimeRemaining > 0 && (
                <span className="text-white/60 text-xs">预计剩余: {formatTimeRemaining(estimatedTimeRemaining)}</span>
              )}
            </div>
          </div>
          <div className="relative w-full h-4 bg-white/10 rounded-lg overflow-hidden">
            <div 
              className="h-full transition-all duration-300 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 relative overflow-hidden"
              style={{ width: `${generationProgress}%` }}
            >
              {/* 动画光泽效果 */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
            </div>
          </div>
          <div className="text-sm text-white/50 flex items-center gap-2">
            <Activity size={12}/>
            <span>批量生成 {count} 个测试用例，每个 {iterations} 次迭代</span>
          </div>
        </div>
      )}
      {items.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-white/80">已生成的测试用例集合</h4>
            <span className="text-sm text-white/50">{items.length} 个测试用例</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((it, idx) => (
              <div key={it.url} className="rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-3 hover:from-white/10 hover:to-white/5 hover:border-white/20 transition-all shadow-sm group">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-md bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
                      {idx + 1}
                    </div>
                    <div className="flex flex-col">
                      <div className="text-sm font-medium text-white/90 truncate max-w-[140px]" title={it.name}>
                        {it.name.replace('.zip', '')}
                      </div>
                      <div className="text-[10px] text-white/40">{Math.round(it.size/1024)} KB</div>
                    </div>
                  </div>
                </div>
                <button 
                  className="w-full btn-ghost text-sm px-2 py-1.5 inline-flex items-center justify-center gap-1.5 group-hover:bg-white/10" 
                  onClick={() => downloadOne(it)}
                >
                  <Download size={12}/> 下载此测试用例
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {zipBuilding && (
        <div className="mt-3">
          <div className="text-sm text-white/60 mb-1">正在打包 {items.length} 个测试用例：{zipProgress}%</div>
          <div className="w-full h-3 bg-white/10 rounded-lg overflow-hidden">
            <div className="h-full transition-all duration-200 bg-gradient-to-r from-emerald-500 via-cyan-400 to-sky-400" style={{ width: `${zipProgress}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

export { AcquireSeedsSection }

// 辅助展示组件定义（放在同文件末尾避免引入额外文件）
interface MetricBlockProps { label: string; value: any; color: string }
function MetricBlock({ label, value, color }: MetricBlockProps) {
  const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('theme-light')
  const colorMapDark: Record<string,string> = {
    cyan: 'text-cyan-300', sky: 'text-sky-300', emerald: 'text-emerald-300', violet: 'text-violet-300', fuchsia: 'text-fuchsia-300', amber: 'text-amber-300', rose: 'text-rose-300', lime: 'text-lime-300', indigo: 'text-indigo-300', teal: 'text-teal-300'
  }
  const colorMapLight: Record<string,string> = {
    cyan: 'text-cyan-600', sky: 'text-sky-600', emerald: 'text-emerald-600', violet: 'text-violet-600', fuchsia: 'text-fuchsia-600', amber: 'text-amber-600', rose: 'text-rose-600', lime: 'text-lime-600', indigo: 'text-indigo-600', teal: 'text-teal-600'
  }
  return (
    <div className={`rounded-lg border p-2 flex flex-col items-center gap-1 ${isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'}`}>
      <div className={`text-sm text-center leading-tight ${isLight ? 'text-slate-500' : 'text-white/45'}`}>{label}</div>
      <div className={`text-base font-semibold ${ (isLight ? colorMapLight[color] : colorMapDark[color]) || (isLight ? 'text-slate-700' : 'text-white/70')}`}>{value}</div>
    </div>
  )
}
interface CompareLineProps { label: string; a?: number; b?: number }
function CompareLine({ label, a, b }: CompareLineProps) {
  const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('theme-light')
  return (
    <div className="flex items-center justify-between text-base">
      <span className={isLight ? 'text-slate-500' : 'text-white/45'}>{label}</span>
      <div className="flex items-center gap-1">
        <span className={`${isLight ? 'text-slate-600' : 'text-white/60'} min-w-[22px] text-right`}>{a ?? '-'}</span>
        <ChevronRight size={12} className={isLight ? 'text-slate-400' : 'text-white/30'} />
        <span className={`${isLight ? 'text-emerald-600' : 'text-emerald-300'} min-w-[22px] text-left`}>{b ?? '-'}</span>
        {a != null && b != null && a !== b && (
          <span className={`text-sm ${b - a >= 0 ? (isLight ? 'text-emerald-500' : 'text-emerald-400') : (isLight ? 'text-rose-500' : 'text-rose-400')}`}>{b - a >= 0 ? '+' : ''}{b - a}</span>
        )}
      </div>
    </div>
  )
}
interface DiffBarProps { original?: number; added?: number }
function DiffBar({ original, added }: DiffBarProps) {
  if (original == null || added == null) return <div className="h-2 rounded bg-white/10" />
  const total = original + added
  const pct = total === 0 ? 0 : (added / total) * 100
  return (
    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden relative">
      <div className="h-full bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400" style={{ width: `${pct}%` }} />
      <div className="absolute inset-0 flex items-center justify-center text-[9px] text-white/70">
        +{added} / {original}
      </div>
    </div>
  )
}

// 聚合差异标签组件，避免主界面过长
// 引用上方 GraphDiff 接口类型
type GraphDiffLocal = {
  nodeKindDelta: Record<string, number>
  edgeKindDelta: Record<string, number>
  addedNodes: Array<{ id: string; kind: string }>
  addedMethodRows: Array<{ nodeId: string; count: number }>
  addedFieldRows: Array<{ nodeId: string; count: number }>
  addedEdges: Array<{ id: string; kind: string }>
}
interface DiffSummaryAggregatedProps { graphDiff: GraphDiffLocal | null; tone: any }
function DiffSummaryAggregated({ graphDiff, tone }: DiffSummaryAggregatedProps) {
  const [open, setOpen] = useState(false)
  if (!graphDiff) {
    return <div className="text-sm px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-white/50 inline-block">暂无新增结构</div>
  }
  const nodeKindsAgg: Record<string, number> = {}
  graphDiff.addedNodes.forEach((n: { id: string; kind: string }) => { nodeKindsAgg[n.kind] = (nodeKindsAgg[n.kind] || 0) + 1 })
  const totalAddedMethods = graphDiff.addedMethodRows.reduce((a: number,b: { nodeId: string; count: number })=>a + b.count,0)
  const totalAddedFields = graphDiff.addedFieldRows.reduce((a: number,b: { nodeId: string; count: number })=>a + b.count,0)
  const edgeKindsAgg: Record<string, number> = {}
  graphDiff.addedEdges.forEach((e: { id: string; kind: string }) => { edgeKindsAgg[e.kind] = (edgeKindsAgg[e.kind] || 0) + 1 })
  const badges: Array<{ label: string; value: number; color: string }> = []
  Object.entries(nodeKindsAgg).forEach(([k,v]) => badges.push({ label: `节点:${k}`, value: v, color: 'emerald' }))
  if (totalAddedMethods > 0) badges.push({ label: '方法行', value: totalAddedMethods, color: 'cyan' })
  if (totalAddedFields > 0) badges.push({ label: '字段行', value: totalAddedFields, color: 'amber' })
  Object.entries(edgeKindsAgg).forEach(([k,v]) => badges.push({ label: `边:${k}`, value: v, color: 'purple' }))
  if (badges.length === 0) return <div className="text-sm px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-white/50 inline-block">暂无新增结构</div>

  const colorClass = (c: string) => {
    switch (c) {
      case 'emerald': return 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
      case 'cyan': return 'bg-cyan-500/15 border-cyan-400/30 text-cyan-300'
      case 'amber': return 'bg-amber-500/15 border-amber-400/30 text-amber-300'
      case 'purple': return 'bg-purple-500/15 border-purple-400/30 text-purple-300'
      default: return 'bg-white/10 border-white/15 text-white/60'
    }
  }
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {badges.slice(0,6).map((b,i)=>(
        <span key={i} className={`px-2 py-0.5 rounded-md border text-sm ${colorClass(b.color)}`}>{b.label} +{b.value}</span>
      ))}
      {badges.length > 6 && (
        <button type="button" onClick={()=>setOpen(true)} className="px-2 py-0.5 rounded-md border border-white/15 bg-white/10 text-sm text-white/65 hover:text-white/80">+更多 {badges.length - 6}</button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setOpen(false)} />
          <div className="relative w-full max-w-lg rounded-xl border border-white/15 bg-[#121a26] p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white/80">新增结构详情</h4>
              <button type="button" onClick={()=>setOpen(false)} className="text-sm px-2 py-1 rounded-md bg-white/10 text-white/70 hover:text-white">关闭</button>
            </div>
            <div className="max-h-[260px] overflow-auto space-y-2 pr-1">
              <div>
                <div className="text-sm font-medium text-emerald-300 mb-1">新增节点列表</div>
                <div className="flex flex-wrap gap-1">
                  {graphDiff.addedNodes.map((n: { id: string; kind: string }) => <span key={n.id} className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-[10px] border border-emerald-400/30 text-emerald-200">{n.id}({n.kind})</span>)}
                  {graphDiff.addedNodes.length===0 && <span className="text-[10px] text-white/40">无</span>}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-cyan-300 mb-1">新增方法行 (按节点)</div>
                <div className="flex flex-wrap gap-1">
                  {graphDiff.addedMethodRows.map((m: { nodeId: string; count: number }) => <span key={m.nodeId} className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-[10px] border border-cyan-400/30 text-cyan-200">{m.nodeId} ×{m.count}</span>)}
                  {graphDiff.addedMethodRows.length===0 && <span className="text-[10px] text-white/40">无</span>}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-amber-300 mb-1">新增字段行 (按节点)</div>
                <div className="flex flex-wrap gap-1">
                  {graphDiff.addedFieldRows.map((f: { nodeId: string; count: number }) => <span key={f.nodeId} className="px-1.5 py-0.5 rounded bg-amber-500/15 text-[10px] border border-amber-400/30 text-amber-200">{f.nodeId} ×{f.count}</span>)}
                  {graphDiff.addedFieldRows.length===0 && <span className="text-[10px] text-white/40">无</span>}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-purple-300 mb-1">新增边列表</div>
                <div className="flex flex-wrap gap-1">
                  {graphDiff.addedEdges.map((e: { id: string; kind: string }) => <span key={e.id} className="px-1.5 py-0.5 rounded bg-purple-500/15 text-[10px] border border-purple-400/30 text-purple-200">{e.kind}</span>)}
                  {graphDiff.addedEdges.length===0 && <span className="text-[10px] text-white/40">无</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
