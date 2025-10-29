import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, PlayCircle, BookOpen, BarChart3, GitBranch, ScrollText, Sparkles } from 'lucide-react'

export default function Home() {
  const nav = useNavigate()
  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10">
        {/* gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-900/30 via-transparent to-transparent" />
        <div className="absolute -top-24 -left-24 h-72 w-72 bg-sky-700/40 blur-3xl rounded-full" />
        <div className="absolute -bottom-24 -right-24 h-72 w-72 bg-indigo-700/30 blur-3xl rounded-full" />

  <div className="relative px-6 py-14 md:px-10 md:py-20 text-center">
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight">InterFuzz</h1>
          <p className="mt-4 md:mt-6 text-lg md:text-xl text-white/70 max-w-5xl mx-auto">
            基于异构程序图（HPG）生成<strong className="text-white font-semibold">具有丰富跨类结构</strong>的Java测试种子，<br />
            系统化构造继承、接口、嵌套、泛型、引用等复杂类间关系，<br />
            用于检测优化编译器的缺陷
          </p> 
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              to="/demo"
              className="btn-primary relative overflow-hidden transition-transform hover:-translate-y-0.5 hover:shadow-[0_0_0_2px_rgba(56,189,248,0.35)]"
              aria-label="开始演示"
            >
              <PlayCircle size={18} /> 开始演示
            </Link>
            <Link
              to="/principle"
              className="btn transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-white/30"
              aria-label="查看工具介绍"
            >
              <BookOpen size={18} /> 工具介绍
            </Link>
          </div>

          {/* Mini features inside hero */}
          <div className="mt-10 grid gap-4 md:grid-cols-3 text-left">
            <Link to="/principle" className="group rounded-2xl bg-white/5 border border-white/10 p-5 hover:bg-white/10 hover:-translate-y-1 transition duration-300">
              <div className="w-12 h-12 rounded-xl bg-white/10 text-white grid place-items-center mb-3">
                <GitBranch className="opacity-90" size={22} />
              </div>
              <h3 className="text-xl font-semibold mb-1">工具介绍 · Introduction</h3>
              <p className="text-white/70 text-base">用高层程序图抽象类/接口/方法及其语义关系，统一表达与分析。</p>
              <div className="mt-4 inline-flex items-center gap-1 text-white/80 group-hover:text-white">
                了解详情 <ArrowRight size={16} />
              </div>
            </Link>
            <Link to="/demo" className="group rounded-2xl bg-white/5 border border-white/10 p-5 hover:bg-white/10 hover:-translate-y-1 transition duration-300">
              <div className="w-12 h-12 rounded-xl bg-white/10 text-white grid place-items-center mb-3">
                <PlayCircle className="opacity-90" size={22} />
              </div>
              <h3 className="text-xl font-semibold mb-1">工具使用 · Tool</h3>
              <p className="text-white/70 text-base">使用 InterFuzz 工具生成具有复杂类间结构的测试种子。</p>
              <div className="mt-4 inline-flex items-center gap-1 text-white/80 group-hover:text-white">
                开始体验 <ArrowRight size={16} />
              </div>
            </Link>
            <Link to="/effects" className="group rounded-2xl bg-white/5 border border-white/10 p-5 hover:bg-white/10 hover:-translate-y-1 transition duration-300">
              <div className="w-12 h-12 rounded-xl bg-white/10 text-white grid place-items-center mb-3">
                <BarChart3 className="opacity-90" size={22} />
              </div>
              <h3 className="text-xl font-semibold mb-1">研究结果 · Evaluation</h3>
              <p className="text-white/70 text-base">统计与案例一目了然，直达发现的编译器问题与复现线索。</p>
              <div className="mt-4 inline-flex items-center gap-1 text-white/80 group-hover:text-white">
                查看效果 <ArrowRight size={16} />
              </div>
            </Link>
          </div>

          {/* (removed: cat inside hero) */}
        </div>
      </section>
      {/* Cat fixed on the right edge of the Home page */}
      <div className="pointer-events-none hidden md:block fixed right-3 lg:right-6 top-1/2 -translate-y-1/2 z-10">
        <svg
          className="cat-illustration text-white w-36 h-36 lg:w-48 lg:h-48 float-slow"
          viewBox="0 0 200 200"
          fill="none"
          aria-hidden
        >
          {/* soft glow */}
          <defs>
            <radialGradient id="catGlowHome" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(130 120) rotate(90) scale(90 90)">
              <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>
          <circle cx="130" cy="120" r="90" fill="url(#catGlowHome)" />

          {/* tail */}
          <path d="M150 125c20 0 25 20 10 28-9 5-18-1-18-1" stroke="currentColor" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />

          {/* body */}
          <ellipse cx="110" cy="120" rx="38" ry="48" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeOpacity="0.75" strokeWidth="2" />

          {/* head */}
          <circle cx="130" cy="72" r="24" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeOpacity="0.8" strokeWidth="2" />
          {/* ears */}
          <path d="M115 62 L120 45 L128 62 Z" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.8" strokeWidth="2" />
          <path d="M132 62 L140 45 L145 62 Z" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.8" strokeWidth="2" />

          {/* face */}
          <circle cx="123" cy="72" r="2.3" fill="currentColor" fillOpacity="0.88" />
          <circle cx="137" cy="72" r="2.3" fill="currentColor" fillOpacity="0.88" />
          <path d="M130 78 q-3 3 -6 0" stroke="currentColor" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round" />
          <path d="M130 78 q3 3 6 0" stroke="currentColor" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round" />
          <path d="M130 74 v4" stroke="currentColor" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round" />

          {/* whiskers */}
          <path d="M118 72 h-10" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M118 76 h-10" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M142 72 h10" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M142 76 h10" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" />

          {/* paws */}
          <circle cx="95" cy="164" r="6" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" />
          <circle cx="120" cy="166" r="6" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Paper intro – livelier with subtle motion */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10">
        {/* decorative blobs */}
        <div className="pointer-events-none absolute -top-10 -left-6 h-28 w-28 bg-sky-500/20 blur-2xl rounded-full float-slow" />
        <div className="pointer-events-none absolute -bottom-10 -right-6 h-28 w-28 bg-indigo-500/20 blur-2xl rounded-full float-slow" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent" />
        <div className="relative p-6 md:p-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="badge">来自论文</span>
            <ScrollText size={18} className="opacity-80" />
            <span className="inline-flex items-center gap-1 text-sm text-white/70">
              <Sparkles size={14} className="text-yellow-300" />
              动机与要点
            </span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            异构程序图建模 + 跨类变异 + 复杂度引导的编译器模糊测试
          </h2>
          <div className="mt-2 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)] sheen" />
          <p className="mt-3 text-base text-white/80 max-w-4xl">
            针对复杂类间结构难以系统化生成的挑战，InterFuzz 提出三大核心组件：
            异构程序图（HPG）统一表示类间结构、跨类结构变异算子系统化生成复杂关系、
            图复杂度引导优先探索易触发缺陷的程序形态。
          </p>

          <div className="mt-6 space-y-3">
            {/* 三大核心方法 */}
            <div className="grid md:grid-cols-3 gap-3">
              {[
                { 
                  title: <><span className="text-blue-400">◆</span> 核心 1：HPG 异构程序图</>, 
                  desc: '将程序抽象为多类型有向图 HPG(𝒫) = (V, 𝒯, E, ℰ)，统一表示继承、接口、嵌套、泛型、引用等五种类间结构，支持结构化分析与操作。',
                  highlight: true
                },
                { 
                  title: <><span className="text-yellow-400">◆</span> 核心 2：跨类结构变异算子</>, 
                  desc: '在 HPG 上执行图级原子操作（添加/删除节点或边、修改属性），系统化生成具有复杂类间关系的测试用例，保证语法与语义正确性。',
                  highlight: true
                },
                { 
                  title: <><span className="text-red-400">◆</span> 核心 3：图复杂度引导</>, 
                  desc: '基于节点度数与边类型多样性评估结构复杂度，引导变异过程优先探索"关系多样且连接丰富"的程序形态，高效触发编译器缺陷。',
                  highlight: true
                },
              ].map((it, i) => (
                <div key={i} className="card group transition duration-300 hover:-translate-y-1 hover:bg-gradient-to-br hover:from-sky-500/10 hover:to-purple-500/10 hover:shadow-xl border-2 border-sky-500/30 hover:border-sky-400/50">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-white">{it.title}</h3>
                  </div>
                  <p className="text-white/80 text-base leading-relaxed">{it.desc}</p>
                </div>
              ))}
            </div>

            {/* 其他特性 */}
            <div className="grid md:grid-cols-3 gap-3">
              {[
                { title: '差分测试策略', desc: '对同一程序在不同 Java 编译器（HotSpot JIT、ART、R8 AOT）上的执行结果进行对比，检测优化引入的语义错误。' },
                { title: '图可视化展示', desc: '将 HPG 图结构可视化呈现，支持种子程序与变异程序的双图对比，直观展现结构变化与复杂度提升。' },
                { title: '实证成果丰硕', desc: '已发现 20 个真实编译器 Bug，涉及 HotSpot、ART、R8 三大编译器，其中 16 个与类间结构直接相关。' },
              ].map((it, i) => (
                <div key={i} className="card group transition duration-300 hover:-translate-y-1 hover:bg-white/10 hover:shadow-xl">
                  <div className="flex items-start justify-between">
                    <h3 className="font-medium">{it.title}</h3>
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 group-hover:bg-white/80 transition" />
                  </div>
                  <p className="mt-1 text-white/70 text-base">{it.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      
    </div>
  )
}

