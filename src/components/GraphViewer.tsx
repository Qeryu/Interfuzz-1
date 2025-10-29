import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import * as d3 from 'd3'
import { GraphJSON, lineStyleToStrokeDasharray, applyZoom } from '../lib/d3Interop'
import { getNodePalette, normalizeRowType, inferNodeKind, type NodeKind } from '../lib/nodeTypePalette'

interface Props {
  dataUrl: string
  height?: number
  onLoaded?: (summary: { nodes: number; edges: number; layoutMs: number }) => void
  labelDistance?: number
  resetSignal?: number
  debugShowEdgeLabels?: boolean
  /** 是否严格保持后端提供的原始 label，不做规范化覆盖 */
  keepOriginalLabels?: boolean
  /** 不同 kind 垂直偏移的基准间距；增大以更清晰区分 */
  edgeKindGap?: number
}

export type GraphViewerHandle = {
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
}

const GraphViewer = forwardRef<GraphViewerHandle, Props>(({ dataUrl, height = 0.85 * window.innerHeight, onLoaded, labelDistance = 80, resetSignal, debugShowEdgeLabels = false, keepOriginalLabels = true, edgeKindGap = 14 }: Props, ref) => {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const zoomCtl = useRef<{ reset(): void; destroy(): void; scaleBy: (factor: number) => void } | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  // track theme changes to re-render with correct colors
  const [themeTick, setThemeTick] = useState(0)
  // ensure initial zoom only once per mount
  const didInitialZoom = useRef(false)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    const g = svg.select('g#graph') as d3.Selection<SVGGElement, unknown, null, undefined>
    if (zoomCtl.current) zoomCtl.current.destroy()
    zoomCtl.current = applyZoom(svg as any, g as any)
    return () => { zoomCtl.current?.destroy() }
  }, [])

  // re-render when theme class toggles on <html>
  useEffect(() => {
    const el = document.documentElement
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          setThemeTick((v) => v + 1)
          break
        }
      }
    })
    mo.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])

  useEffect(() => {
    if (resetSignal && zoomCtl.current) zoomCtl.current.reset()
  }, [resetSignal])

  useImperativeHandle(ref, () => ({
    zoomIn() { zoomCtl.current?.scaleBy(1.2) },
    zoomOut() { zoomCtl.current?.scaleBy(1 / 1.2) },
    reset() {
      // reset zoom and also rebuild graph to restore initial layout positions
      zoomCtl.current?.reset()
      setReloadTick((v) => v + 1)
    },
  }), [])

  useEffect(() => {
    let cancelled = false
    setError(null)
    const start = performance.now()

    fetch(dataUrl)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(async (raw: GraphJSON) => {
        if (cancelled) return
        const data = normalizeGraph(raw)
        const layoutMs = await draw(data)
        if (onLoaded) onLoaded({ nodes: data.nodes.length, edges: data.edges.length, layoutMs })
      })
      .catch((e) => !cancelled && setError(String(e)))
    return () => { cancelled = true }

    /**
     * 将后端 / 旧版本生成的 output.json 适配为前端当前绘图期望的结构：
     * 1. 把 edge.semantics (implement / instantiate 等) 映射为 edge.kind
     * 2. 如果存在 legacy 的 style.routing / style.points 等非必须字段，保留但前端忽略
     * 3. 若没有 style.marker 且推断需要箭头，则补 marker: 'arrow'
     * 4. 若没有 style.line，根据 kind 给予默认 line (inheritance/impl = solid/dashed, reference = dotted)
     */
    function normalizeGraph(g: GraphJSON): GraphJSON {
      const semanticsToKind: Record<string, string> = {
        implement: 'interface-impl',
        implements: 'interface-impl',
        implementation: 'interface-impl',
        instantiate: 'reference', // 与 seed.json 中 Object Instantiation 统一为 reference (绿色虚线)
        instantiation: 'reference',
        reference: 'reference',
        inherit: 'inheritance',
        inheritance: 'inheritance',
        extend: 'inheritance',
        extension: 'inheritance',
      }
      const needArrowKinds = new Set(['interface-impl', 'inheritance', 'reference'])
      const defaultLineByKind: Record<string, 'solid' | 'dashed' | 'dotted'> = {
        'inheritance': 'solid',
        'interface-impl': 'dashed',
        'reference': 'dotted',
      }
      // 规格化标签：统一五类边的展示文字，多语言（英文+中文）便于理解
      const canonicalLabelByKind: Record<string, { base: string; zh: string }> = {
        'inheritance': { base: 'Inheritance', zh: '继承' },
        'interface-impl': { base: 'Interface Implement', zh: '接口实现' },
        'reference': { base: 'Reference', zh: '引用' },
        'generic-bounds': { base: 'Generic Bounds', zh: '泛型约束' },
        'nesting': { base: 'Nesting', zh: '嵌套' },
      }
      // 已存在的一些旧 label 变体，统一映射为规范
      const variantToCanonical: Record<string, string> = {
        'implementation': 'interface-impl',
        'implements': 'interface-impl',
        'interface implement': 'interface-impl',
        'object creation': 'reference',
        'instantiate': 'reference',
        'instantiation': 'reference',
        'method invocation': 'reference',
        'inherit': 'inheritance',
        'extension': 'inheritance',
        'extend': 'inheritance',
      }
      // 若 label 缺失或为上述变体，则自动生成规范两行：英文 + 中文
      const ensureLabel = (edge: any) => {
        const kind = edge.kind
        if (!kind) return
        const canonical = canonicalLabelByKind[kind]
        if (!canonical) return
        const rawLabel: string = String(edge.label || '').trim()
        // 如果选择保持原始标签并且已有内容，则不改动（但仍支持换行规范化由后面流程处理）
        if (keepOriginalLabels && rawLabel) return
        if (!rawLabel) {
          edge.label = `${canonical.base}\n${canonical.zh}`
          return
        }
        // 将 label 拆成小写 token 检查是否属于变体集合（单行或多行任意一行匹配）
        const lines = rawLabel.split(/\r?\n/)
        const normalizedTokens = lines.map(l => l.toLowerCase().trim())
        const matchesVariant = normalizedTokens.some(t => variantToCanonical[t] === kind)
        // 对 reference 进一步区分：如果包含 method invocation / object creation，可附加第二行中文描述
        if (kind === 'reference') {
          const isMethod = normalizedTokens.some(t => t.includes('method invocation'))
          const isCreate = normalizedTokens.some(t => t.includes('object creation') || t.includes('instantiate'))
          if (matchesVariant || isMethod || isCreate) {
            const extra = isMethod ? '方法调用' : (isCreate ? '对象创建' : canonical.zh)
            edge.label = `${canonical.base}\n${extra}`
            return
          }
        }
        if (matchesVariant) {
          edge.label = `${canonical.base}\n${canonical.zh}`
        }
      }
      // 深拷贝 edges，并剔除不需要的旧字段；同时对 nodes 去掉 size/position
      const edges = g.edges.map((e: any) => {
        const out = { ...e }
        if (!out.kind) {
          const k = semanticsToKind[String(out.semantics || '').toLowerCase()]
          out.kind = k || 'reference'
        }
        // style 归一化
        out.style = { ...(out.style || {}) }
        if (!out.style.marker && out.kind && needArrowKinds.has(out.kind)) {
          out.style.marker = 'arrow'
        }
        if (!out.style.line && out.kind && defaultLineByKind[out.kind]) {
          out.style.line = defaultLineByKind[out.kind]
        }
        // 兼容旧的 sourceRow/targetRow 顶层字段（如果后端未来直接放在边对象顶层）—— GraphViewer 内部已做处理，这里无需重复，但可以统一 attach
        if ((out as any).sourceRow || (out as any).targetRow || (out as any).sourceMethodIndex || (out as any).targetMethodIndex) {
          out.attach = { ...(out.attach || {}) }
          if ((out as any).sourceRow && out.attach.sourceRow == null) out.attach.sourceRow = (out as any).sourceRow
          if ((out as any).targetRow && out.attach.targetRow == null) out.attach.targetRow = (out as any).targetRow
          if ((out as any).sourceMethodIndex != null && out.attach.sourceMethodIndex == null) out.attach.sourceMethodIndex = (out as any).sourceMethodIndex
          if ((out as any).targetMethodIndex != null && out.attach.targetMethodIndex == null) out.attach.targetMethodIndex = (out as any).targetMethodIndex
        }
        // 标签规范化
        ensureLabel(out)
        return out
      })
      const nodes = (g.nodes || []).map((n: any) => {
        const { size, position, ...rest } = n || {}
        return { ...rest }
      })
      return { ...g, nodes, edges }
    }

    async function draw(data: GraphJSON) {
  if (!svgRef.current) return 0
  const svg = d3.select(svgRef.current)
      const g = svg.select('g#graph')
      const isLight = document.documentElement.classList.contains('theme-light')

      // color palette based on theme
      const colors = {
        nodeFill: isLight ? '#ffffff' : '#111827',
        nodeStroke: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.22)',
        rowDivider: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.12)',
        rowTextDefault: isLight ? '#111827' : '#ffffff',
        edgeStroke: isLight ? '#94A3B8' : '#E2E8F0', // slate-400 vs gray-200
        edgeLabel: isLight ? '#475569' : '#E5E7EB', // slate-600 vs gray-200
        shadowOpacity: isLight ? 0.12 : 0.35,
      }
      const palette = getNodePalette(isLight)
      // prepare defs: clear and add arrow marker + node shadow filter for better contrast
      const defs = svg.select('defs')
      defs.selectAll('*').remove()
      const marker = defs.append('marker')
        .attr('id', 'arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 10)
        .attr('refY', 5)
        .attr('markerWidth', 8)
        .attr('markerHeight', 8)
        .attr('orient', 'auto-start-reverse')
      marker.append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', colors.edgeStroke)

      const filter = defs.append('filter').attr('id', 'nodeShadow')
      filter.append('feDropShadow')
        .attr('dx', 0)
        .attr('dy', 1)
        .attr('stdDeviation', 2)
        .attr('flood-color', '#000')
        .attr('flood-opacity', colors.shadowOpacity)
  g.selectAll('*').remove()

      // defs markers
      const meta = data.meta || {}
      const nodeDef = meta.nodeDefaults || { width: 180, rowHeight: 30, padding: 8 }
      const colGap = meta.layout?.colGap ?? 150
      const rowGap = meta.layout?.rowGap ?? 140
      const leftPad = 40
      const topPad = 40

      // compute nodes size (标准方法：最少一行高度；行高 rowH 均匀)
      const nodes = data.nodes.map((n) => {
        const rows = n.rows || []
        const rowH = nodeDef.rowHeight ?? 30
        const height = Math.max(rowH * rows.length, rowH)
        const width = nodeDef.width ?? 180
        return { ...n, width, height, rowH }
      }) as Array<any>

      // layout positions - 固定使用 Grid
      const t0 = performance.now()
      {
        const layers = Array.from(new Set(nodes.map((n) => n.layer))).sort((a, b) => a - b)
        const byLayer: Record<number, any[]> = {}
        for (const l of layers) {
          byLayer[l] = nodes.filter((n) => n.layer === l).sort((a, b) => a.order - b.order)
        }
        layers.forEach((l, li) => {
          byLayer[l].forEach((n, oi) => {
            n.x = leftPad + li * ((nodeDef.width ?? 180) + colGap)
            n.y = topPad + oi * rowGap
          })
        })
      }
      const layoutMs = performance.now() - t0

      // draw nodes
      const nodesG = g.append('g').attr('class', 'nodes')
      const nodeSel = nodesG.selectAll('g.node').data(nodes, (d: any) => d.id).join('g').attr('class', 'node')
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`)
        .style('cursor', 'grab')

      nodeSel.append('rect')
        .attr('width', (d: any) => d.width)
        .attr('height', (d: any) => d.height)
        .attr('rx', 12)
        .attr('ry', 12)
        .attr('fill', colors.nodeFill)
        .attr('stroke', (d: any) => {
          const k = inferNodeKind(d) as NodeKind | undefined
          return k ? palette[k].accent : colors.nodeStroke
        })
        .attr('filter', 'url(#nodeShadow)')

      // (corner emblem removed per request)

      ;(nodeSel as any).each(function(this: any, d: any) {
        const group = d3.select(this)
        const rowH = d.rowH
        const rows = d.rows || []
        rows.forEach((row: any, i: number) => {
          // row background (optional subtle line)
          const k = normalizeRowType(row.type) as NodeKind | undefined
          // subtle tinted row background
          group.append('rect')
            .attr('x', 0)
            .attr('y', i * rowH)
            .attr('width', d.width)
            .attr('height', rowH)
            .attr('fill', k ? palette[k].tint : 'transparent')
          // divider on top of row for structure
          group.append('line')
            .attr('x1', 0).attr('x2', d.width).attr('y1', i * rowH).attr('y2', i * rowH)
            .attr('stroke', colors.rowDivider)
          // left accent bar
          if (k) {
            group.append('rect')
              .attr('x', 0)
              .attr('y', i * rowH)
              .attr('width', 4)
              .attr('height', rowH)
              .attr('fill', palette[k].accent)
              .attr('rx', 2)
              .attr('ry', 2)
          }
          const y = i * rowH + rowH / 2
          // 文本截断与悬停显示
          const fullText: string = String(row.text || '')
          const maxChars = Math.round((d.width - 28) / 7) // 粗略按字符宽估计
          const truncated = fullText.length > maxChars ? fullText.slice(0, maxChars - 1) + '…' : fullText
          const textEl = group.append('text')
            .attr('x', 12)
            .attr('y', y)
            .attr('dominant-baseline', 'middle')
            .attr('fill', k ? palette[k].text : colors.rowTextDefault)
            .attr('font-size', row.type === 'method' ? 12 : 13)
            .text(truncated)
          if (truncated !== fullText) {
            textEl.attr('data-full', fullText)
              .attr('cursor','help')
              .append('title').text(fullText)
          }
        })
      })

      // edges
    const nodeById: Record<string, any> = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const edges = data.edges
    const edgesG = g.append('g').attr('class', 'edges')

      // helper: pickPort like case script
      function resolveRowIndex(node: any, role: 'classRow' | 'methodRow', side: 'source' | 'target', attach?: any) {
        const rows = node.rows || []
        const firstMethodIdx = rows.findIndex((r: any) => r.type === 'method')
        const defaultIdx = role === 'classRow' ? 0 : (firstMethodIdx >= 0 ? firstMethodIdx : 0)

        if (attach) {
          // absolute row (1-based)
          const absKey = side === 'source' ? 'sourceRow' : 'targetRow'
          if (typeof attach[absKey] === 'number' && Number.isFinite(attach[absKey])) {
            const oneBased = attach[absKey] as number
            const idx = Math.max(0, Math.min(rows.length - 1, Math.round(oneBased - 1)))
            return idx
          }
          // method index within method-only list (0-based)
          const mKey = side === 'source' ? 'sourceMethodIndex' : 'targetMethodIndex'
          if (typeof attach[mKey] === 'number' && Number.isFinite(attach[mKey]) && firstMethodIdx >= 0) {
            const mIdx = Math.max(0, Math.round(attach[mKey] as number))
            const idx = Math.max(firstMethodIdx, Math.min(rows.length - 1, firstMethodIdx + mIdx))
            return idx
          }
          // substring match on text
          const sKey = side === 'source' ? 'sourceMatch' : 'targetMatch'
          if (typeof attach[sKey] === 'string' && attach[sKey]) {
            const needle = String(attach[sKey]).toLowerCase()
            const found = rows.findIndex((r: any) => String(r.text || '').toLowerCase().includes(needle))
            if (found >= 0) return found
          }
        }
        return defaultIdx
      }

      const edgeKindStyle = (kind: string | undefined) => {
        if (!kind) return null
        const k = String(kind).toLowerCase()
        // theme-aware edge colors
        const C = (l: string, d: string) => (isLight ? l : d)
        if (k === 'inheritance') return { stroke: C('#38bdf8', '#bae6fd'), line: 'solid' as const, marker: 'arrow' as const }
        if (k === 'interface-impl' || k === 'interface_impl' || k === 'implement') return { stroke: C('#a78bfa', '#c4b5fd'), line: 'dashed' as const, marker: 'arrow' as const }
        if (k === 'nesting') return { stroke: C('#f59e0b', '#fbbf24'), line: 'solid' as const, marker: 'none' as const }
        if (k === 'generic-bounds' || k === 'generic_bounds') return { stroke: C('#fb7185', '#fca5a5'), line: 'dotted' as const, marker: 'none' as const }
        if (k === 'reference') return { stroke: C('#22c55e', '#86efac'), line: 'dotted' as const, marker: 'arrow' as const }
        return null
      }

      // 单一 tooltip：用于节点截断文本 & 边标签悬停显示
      d3.select(document.body).selectAll('div.graph-tooltip').remove()
      const tooltip = d3.select(document.body)
        .append('div')
        .attr('class','graph-tooltip')
        .style('position','fixed')
        .style('pointer-events','none')
        .style('z-index','9999')
        .style('background', isLight ? 'rgba(255,255,255,0.95)' : 'rgba(17,24,39,0.92)')
        .style('color', isLight ? '#0f172a' : '#f1f5f9')
        .style('font-size','11px')
        .style('padding','6px 8px')
        .style('border-radius','6px')
        .style('border', isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.15)')
        .style('box-shadow', isLight ? '0 4px 12px rgba(0,0,0,0.08)' : '0 4px 12px rgba(0,0,0,0.45)')
        .style('white-space','pre-line')
        .style('opacity','0')
      let hoverTimer: any = null
      const normalizeMultiline = (text: string) => {
        if (!text) return ''
        // 将 '/n' 视为换行；也兼容反斜杠写法 '\n'
        return String(text).replace(/\/(n)/g, '\n').replace(/\\n/g,'\n')
      }
      const showTooltipDelayed = (event: any, text: string) => {
        if (hoverTimer) clearTimeout(hoverTimer)
        const { clientX, clientY } = event
        hoverTimer = setTimeout(()=>{
          tooltip.style('left', (clientX + 12) + 'px')
            .style('top', (clientY + 12) + 'px')
            .style('opacity','1')
            .text(normalizeMultiline(text))
        }, 520)
      }
      const showEdgeLabelImmediate = (event: any, text: string) => {
        if (hoverTimer) clearTimeout(hoverTimer)
        tooltip.style('left', (event.clientX + 12) + 'px')
          .style('top', (event.clientY + 12) + 'px')
          .style('opacity','1')
          .text(normalizeMultiline(text))
      }
      const hideTooltip = () => {
        if (hoverTimer) clearTimeout(hoverTimer)
        tooltip.style('opacity','0')
      }

      svg.selectAll('text[data-full]')
        .on('mouseenter', function(event){
          const full = d3.select(this).attr('data-full')
          if (full) showTooltipDelayed(event, full)
        })
        .on('mousemove', function(event){
          if (tooltip.style('opacity') === '1') {
            tooltip.style('left', (event.clientX + 12) + 'px').style('top', (event.clientY + 12) + 'px')
          }
        })
        .on('mouseleave', hideTooltip)

      const renderEdges = () => {
        edgesG.selectAll('*').remove()
        // Prepared 边：仅使用节点左右侧中点，不再依据行(row)定位
        type Prepared = {
          e: (typeof edges)[number]
          s: any
          t: any
          sCenterY: number
          tCenterY: number
          p0x: number
          p3x: number
        }
        const prepared: Prepared[] = []
        for (const e of edges) {
          const s = nodeById[e.source]
          const t = nodeById[e.target]
          if (!s || !t) continue
          const sCenterY = s.y + s.height / 2
          const tCenterY = t.y + t.height / 2
          // 源永远用右侧中点；目标侧：如果源在目标右侧，则也使用目标右侧中点，否则使用左侧中点
          const p0x = s.x + s.width
          const sourceIsRightOfTarget = s.x > t.x
          const p3x = sourceIsRightOfTarget ? (t.x + t.width) : t.x
          prepared.push({ e, s, t, sCenterY, tCenterY, p0x, p3x })
        }
        const groups = new Map<string, Prepared[]>()
        for (const p of prepared) {
          const key = `${p.p0x}|${p.sCenterY}|${p.p3x}|${p.tCenterY}`
          const arr = groups.get(key)
          if (arr) arr.push(p); else groups.set(key, [p])
        }
        // 垂直偏移策略：同一 endpoints 下，按 kind 分配偏移；同 kind 重叠(偏移=该 kind 的统一值)；仅不同 kind 之间产生对称偏移
        const laneById = new Map<string, number>()
        const symmetricOffsets = (count: number, gap: number) => {
          if (count <= 1) return [0]
          const arr: number[] = []
          const mid = (count % 2 === 1) ? 0 : gap / 2
          // 构造层级：0 层(可能)然后正负递增
          if (count % 2 === 1) arr.push(0)
          let layer = 1
          while (arr.length < count) {
            const up = layer * gap
            const down = -layer * gap
            // 保持对称：负值在前正值在后，使视觉排序自上而下与数组索引对应
            if (arr.length < count) arr.unshift(down)
            if (arr.length < count) arr.push(up)
            layer++
          }
          // 如果偶数，当前 arr 两侧分布，需要微调使中心处不留空 (我们按构造已经均衡)
          return arr.slice(0, count)
        }
        for (const [, arr] of groups) {
          // 按 kind 聚合（undefined 作为 'unknown'）
            const byKind = new Map<string, Prepared[]>()
            for (const p of arr) {
              const k = (p.e as any).kind ? String((p.e as any).kind) : 'unknown'
              const list = byKind.get(k)
              if (list) list.push(p); else byKind.set(k, [p])
            }
            const kinds = Array.from(byKind.keys())
            // gap 可由第一条边的 laneGap 指定，否则默认 6
            // 优先使用组件 prop edgeKindGap，其次使用边自带 laneGap，最后回退默认 14
            const gapCfg = edgeKindGap ?? (arr[0]?.e as any)?.laneGap ?? 14
            const kindOffsets = symmetricOffsets(kinds.length, gapCfg)
            kinds.forEach((k, idx) => {
              const offsetForKind = kindOffsets[idx] ?? 0
              const list = byKind.get(k)!
              list.forEach(p => {
                const explicit = (p.e as any).laneOffset
                laneById.set(p.e.id, (typeof explicit === 'number') ? explicit : offsetForKind)
              })
            })
        }
        prepared.forEach((p) => {
          const e = p.e
          const lane = laneById.get(e.id) ?? 0
          const p0 = { x: p.p0x, y: p.sCenterY + lane }
          const p3 = { x: p.p3x, y: p.tCenterY + lane }
          const extend = (e as any).extendDistance ?? 80
          // 保持原有折线风格：水平 -> 垂直 -> 水平
          const midX = p0.x + extend
          const pts = [p0, { x: midX, y: p0.y }, { x: midX, y: p3.y }, p3]
          const pathD = d3.line<any>().x((pt) => pt.x).y((pt) => pt.y)(pts as any) as string
          const kindSty = edgeKindStyle((e as any).kind)
          const stroke = kindSty?.stroke || colors.edgeStroke
          const lineKind = kindSty?.line || e.style?.line
          const markerKind = kindSty?.marker || e.style?.marker
          const visiblePath = edgesG.append('path')
            .attr('d', pathD)
            .attr('fill', 'none')
            .attr('stroke', stroke)
            .attr('stroke-width', 1.8)
            .attr('stroke-dasharray', lineStyleToStrokeDasharray(lineKind) || null)
            .attr('marker-end', markerKind === 'arrow' ? 'url(#arrow)' : null)
            .attr('data-edge-id', e.id)
          const hit = edgesG.append('path')
            .attr('d', pathD)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 14)
            .style('pointer-events','stroke')
            .style('cursor', e.label ? 'pointer' : 'default')
            .attr('data-edge-hit', e.id)
          if (e.label) {
            hit.on('mouseenter', (event: any) => showEdgeLabelImmediate(event, String(e.label)))
              .on('mousemove', (event: any) => {
                if (tooltip.style('opacity') === '1') {
                  tooltip.style('left', (event.clientX + 12) + 'px').style('top', (event.clientY + 12) + 'px')
                }
              })
              .on('mouseleave', hideTooltip)
          }
          if (debugShowEdgeLabels && e.label) {
            const midIndex = Math.floor(pts.length / 2)
            const midPt = pts[midIndex]
            edgesG.append('text')
              .attr('x', midPt.x)
              .attr('y', midPt.y - 6)
              .attr('text-anchor', 'middle')
              .attr('font-size', 10)
              .attr('fill', colors.edgeLabel)
              .text(normalizeMultiline(String(e.label)))
          }
        })
      }

      // drag 等场景会多次调用 renderEdges()
      // 初始绘制（之前遗漏导致边未渲染）
      renderEdges()

      // drag behavior for nodes: update position and redraw edges
      const dragBehavior = d3.drag<SVGGElement, any>()
        .on('start', function(event) { (event.sourceEvent as any)?.stopPropagation?.(); d3.select(this).style('cursor','grabbing') })
        .on('drag', function(event, d: any) {
          d.x += event.dx
          d.y += event.dy
          d3.select(this as SVGGElement).attr('transform', `translate(${d.x},${d.y})`)
          renderEdges()
        })
        .on('end', function(){ d3.select(this).style('cursor','grab') })
      ;(nodeSel as any).call(dragBehavior as any)

      // fit viewBox
      const bbox = (g.node() as SVGGElement).getBBox()
      const pad = 40
      svg.attr('viewBox', `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`)

      // (legend drawing removed here; using HTML GraphLegend overlay instead)

      // apply an initial zoom-in (50% of original three wheel "up" steps)
      if (!didInitialZoom.current && zoomCtl.current) {
        zoomCtl.current.scaleBy(0.7)
        didInitialZoom.current = true
      }

      return layoutMs
    }
  }, [dataUrl, labelDistance, reloadTick, themeTick])

  if (error) {
    return (
      <div className="card text-sm">
        加载失败：{error}
        <div className="mt-2 text-white/60">请检查 JSON 路径或网络，并重试。</div>
        <button className="btn mt-3" aria-label="重试加载" onClick={() => setReloadTick((v) => v + 1)}>重试</button>
      </div>
    )
  }

  return (
  <svg ref={svgRef} width="100%" height={height} role="img" aria-label="HPG 图视图">
      <defs />
      <g id="graph"></g>
    </svg>
  )
})

export default GraphViewer
